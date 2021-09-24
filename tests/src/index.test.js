const fs = require('fs')
const { schema } = require('yaml-cfn')
const yaml = require('js-yaml')

const event = { requestId: 'abcdef12-3456-7890-abcd-ef1234567890' }
const context = {}

const fetch = require('node-fetch')

describe('New Relic Instrumentation', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules() // Most important - it clears the cache
    process.env = { ...OLD_ENV } // Make a copy
  })

  afterAll(() => {
    process.env = OLD_ENV // Restore old environment
  })

  it('Enabled', async () => {
    process.env.NEW_RELIC_ACCOUNT_ID = 1
    process.env.NEW_RELIC_TRUSTED_ACCOUNT_ID = 2
    process.env.NEW_RELIC_LICENSE_SECRET_ARN = 'arn:aws:ssm:eu-west-2:451483290750:xxx'
    process.env.AWS_REGION = 'eu-west-2'

    const layerArn = 'arn:aws:lambda:eu-west-2:451483290750:layer:NewRelicNodeJS14X:21'

    // Setup
    const templateFile = fs.readFileSync('tests/fixtures/template.cfn.yaml')
    event.fragment = yaml.load(templateFile, { schema: schema })

    const newRelicLayers = JSON.parse(fs.readFileSync('tests/fixtures/new-relic-layers.json'))
    fetch.mockResponse(JSON.stringify(newRelicLayers), { status: 200 })

    // Execute
    const { handler } = require('../../src')
    await handler(event, context)
    for (const [, resource] of Object.entries(event.fragment.Resources)) {
      if (resource.Type === 'AWS::Serverless::Function') {
        expect(resource.Properties.Handler).toBe('newrelic-lambda-wrapper.handler')
        expect(resource.Properties.Environment.Variables.NEW_RELIC_ACCOUNT_ID).toBe(process.env.NEW_RELIC_ACCOUNT_ID)
        expect(resource.Properties.Environment.Variables.NEW_RELIC_TRUSTED_ACCOUNT_ID).toBe(process.env.NEW_RELIC_TRUSTED_ACCOUNT_ID)

        expect(resource.Properties.Layers.length).toBeGreaterThan(0)
        expect(resource.Properties.Layers.some((layer) => {
          return layerArn.startsWith(layer)
        })).toBe(true)

        expect(resource.Properties.Policies.length).toBeGreaterThan(0)
        expect(resource.Properties.Policies).toContainEqual({
          AWSSecretsManagerGetSecretValuePolicy: {
            SecretArn: process.env.NEW_RELIC_LICENSE_SECRET_ARN
          }
        })
      }
    }
  })

  it('Disabled', async () => {
    process.env.NEW_RELIC_ACCOUNT_ID = undefined
    process.env.NEW_RELIC_TRUSTED_ACCOUNT_ID = undefined
    process.env.NEW_RELIC_LAMBDA_LAYER_ARN = undefined
    process.env.NEW_RELIC_LICENSE_SECRET_ARN = undefined

    const { handler } = require('../../src')
    const result = await handler(event, context)
    expect(result).toBeUndefined()
  })

  it('New Relic Layers API Error', async () => {
    process.env.NEW_RELIC_ACCOUNT_ID = 1
    process.env.NEW_RELIC_TRUSTED_ACCOUNT_ID = 2
    process.env.NEW_RELIC_LICENSE_SECRET_ARN = 'arn:aws:ssm:eu-west-2:451483290750:xxx'
    process.env.AWS_REGION = 'eu-west-2'

    const newRelicLayers = JSON.parse(fs.readFileSync('tests/fixtures/new-relic-layers.json'))
    fetch.mockResponse(JSON.stringify(newRelicLayers), { status: 500 })

    const { handler } = require('../../src')
    await expect(handler(event, context)).rejects.toThrow('New Relic Serverless Instrumentation: Could not retrieve layers from New Relic API.')
  })

  it('Cannot identify Runtime Error', async () => {
    process.env.NEW_RELIC_ACCOUNT_ID = 1
    process.env.NEW_RELIC_TRUSTED_ACCOUNT_ID = 2
    process.env.NEW_RELIC_LICENSE_SECRET_ARN = 'arn:aws:ssm:eu-west-2:451483290750:xxx'
    process.env.AWS_REGION = 'eu-west-2'

    // Setup
    const templateFile = fs.readFileSync('tests/fixtures/template.cfn.yaml')
    event.fragment = yaml.load(templateFile, { schema: schema })

    // Remove global runtime
    event.fragment.Globals.Function.Runtime = undefined

    const newRelicLayers = JSON.parse(fs.readFileSync('tests/fixtures/new-relic-layers.json'))
    fetch.mockResponse(JSON.stringify(newRelicLayers), { status: 200 })

    // Execute
    const { handler } = require('../../src')
    await expect(handler(event, context)).rejects.toThrow('New Relic Serverless Instrumentation: Cannot identify Global or AWS::Serverless::Function level runtime.')
  })

  it('Cannot identify New Relic Layer Error', async () => {
    process.env.NEW_RELIC_ACCOUNT_ID = 1
    process.env.NEW_RELIC_TRUSTED_ACCOUNT_ID = 2
    process.env.NEW_RELIC_LICENSE_SECRET_ARN = 'arn:aws:ssm:eu-west-2:451483290750:xxx'
    process.env.AWS_REGION = 'eu-west-2'

    // Setup
    const templateFile = fs.readFileSync('tests/fixtures/template.cfn.yaml')
    event.fragment = yaml.load(templateFile, { schema: schema })

    const newRelicLayers = JSON.parse(fs.readFileSync('tests/fixtures/new-relic-layers.json'))

    // Remove layer
    const resourceRunTime = 'nodejs14.x'
    const layerArn = 'arn:aws:lambda:eu-west-2:451483290750:layer:NewRelicNodeJS14X:21'

    newRelicLayers.Layers.splice(newRelicLayers.Layers.findIndex(layer => layer.LatestMatchingVersion.LayerVersionArn === layerArn), 1)

    fetch.mockResponse(JSON.stringify(newRelicLayers), { status: 200 })

    // Execute
    const { handler } = require('../../src')
    await expect(handler(event, context)).rejects.toThrow(`New Relic Serverless Instrumentation: Cannot identify New Relic layer for runtime ${resourceRunTime}.`)
  })
})
