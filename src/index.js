const fetch = require('node-fetch')
const set = require('set-value')

const newRelicAccountId = process.env.NEW_RELIC_ACCOUNT_ID
const newRelicTrustedAccountId = process.env.NEW_RELIC_TRUSTED_ACCOUNT_ID
const newRelicLicenseSecretArn = process.env.NEW_RELIC_LICENSE_SECRET_ARN

const awsRegion = process.env.AWS_REGION

const getNewRelicLayers = async () => {
  const response = await fetch(`https://${awsRegion}.layers.newrelic-external.com/get-layers`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  if (response.status !== 200) {
    throw new Error('New Relic Serverless Instrumentation: Could not retrieve layers from New Relic API.')
  }
  const data = await response.json()
  return data.Layers
}

module.exports.handler = async (event) => {
  // If we haven't set any new relic parameters then ignore
  if (!newRelicAccountId || !newRelicTrustedAccountId || !newRelicLicenseSecretArn) {
    console.log('New Relic Serverless Instrumentation: Not enabled as the required parameters are not all specified.')
    return
  }

  const newRelicLayers = await getNewRelicLayers()
  const globalRuntime = event.fragment?.Globals?.Function?.Runtime

  const resourceKeys = Object.keys(event.fragment.Resources)
  for (let i = 0; i < resourceKeys.length; i++) {
    const resource = event.fragment.Resources[resourceKeys[i]]
    if (resource.Type === 'AWS::Serverless::Function') {
      // Identify runtime and layer
      const resourceRunTime = resource.Properties.Runtime || globalRuntime

      if (!resourceRunTime) {
        throw new Error('New Relic Serverless Instrumentation: Cannot identify Global or AWS::Serverless::Function level runtime.')
      }

      const newRelicLayer = newRelicLayers.find((layer) => layer.LatestMatchingVersion.CompatibleRuntimes.includes(resourceRunTime))

      if (!newRelicLayer) {
        throw new Error(`New Relic Serverless Instrumentation: Cannot identify New Relic layer for runtime ${resourceRunTime}.`)
      }

      // Set handler
      const origHandler = resource.Properties.Handler
      set(resource, 'Properties.Handler', 'newrelic-lambda-wrapper.handler')
      set(resource, 'Properties.Environment.Variables.NEW_RELIC_LAMBDA_HANDLER', origHandler)

      // Set account id
      set(resource, 'Properties.Environment.Variables.NEW_RELIC_ACCOUNT_ID', newRelicAccountId)
      set(resource, 'Properties.Environment.Variables.NEW_RELIC_TRUSTED_ACCOUNT_ID', newRelicTrustedAccountId)

      // Set layer
      resource.Properties.Layers = (resource.Properties.Layers) ? resource.Properties.Layers : []
      resource.Properties.Layers.push(newRelicLayer.LatestMatchingVersion.LayerVersionArn)

      // Set policy
      resource.Properties.Policies = (resource.Properties.Policies) ? resource.Properties.Policies : []
      resource.Properties.Policies.push({
        AWSSecretsManagerGetSecretValuePolicy: {
          SecretArn: newRelicLicenseSecretArn
        }
      })
    }
  }
}
