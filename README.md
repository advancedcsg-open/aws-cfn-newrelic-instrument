# aws-cfn-newrelic-instrument

The macro can be used to automatically instrument New Relic against any `AWS::Serverless::Function` resource.

## Configuration

The first step is to follow the [Link your AWS and New Relic accounts](https://docs.newrelic.com/docs/serverless-function-monitoring/aws-lambda-monitoring/enable-lambda-monitoring/account-linking/) page.

Once that has been done then the 
`NewRelicLicenseKeySecret-NewRelic-LicenseKeySecretARN` value is exposed via CloudFormation and can be used by the macro to fetch the New Relic license. 

The macro needs to be deployed against each AWS account that wishes to use it. When performing the SAM Deploy the following parameters must be specified if you wish to enable New Relic.

```yaml
  NewRelicAccountId:
    Description: New Relic Account Id
    Type: String
    Default: ""
  NewRelicTrustedAccountId:
    Description: New Relic Trusted Account Id
    Type: String
    Default: ""
```

The macro automatically detects the Function Runtime e.g `nodejs14.x`. 

Firstly, it checks to see if it exists at a Global level. It then checks each `AWS::Serverless::Function` as they are processed. If set at a `AWS::Serverless::Function` level this takes precedence. 

The Function Runtime is then used to determine the correct layer from the New Relic layers API that will be applied.

## Usage

Once the macro has been deployed in order to use it, you need to update your Cloudformation template.

You need to change the transform property from

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Example
```

to

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: [NewRelicLambdaInstrumentation, AWS::Serverless-2016-10-31]
Description: Example
```

This will ensure the macro is applied prior to the Cloudformation being deploy.