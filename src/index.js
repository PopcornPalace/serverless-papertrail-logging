'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
var AdmZip = require('adm-zip');


class PapertrailLogging {
  constructor(serverless) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.loggerFnName = `${this.service.custom.stage}-all-to-papertrail`

    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'before:package:compileEvents': this.beforePackageCompileEvents.bind(this)
    }
  }

  beforePackageCompileEvents() {
    this.serverless.cli.log('Creating log subscriptions...');
    let loggerLogicalId = this.provider.naming.getLambdaLogicalId(this.loggerFnName)
    _.merge(
      this.service.provider.compiledCloudFormationTemplate.Resources,
      {
        LambdaPermissionForSubscription: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: { 'Fn::GetAtt': [loggerLogicalId, 'Arn'] },
            Action: 'lambda:InvokeFunction',
            Principal: { 'Fn::Sub': 'logs.${AWS::Region}.amazonaws.com' },
            SourceArn: { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/*' },
          },
          DependsOn: [loggerLogicalId],
        },
      }
    );

    let functions = this.service.getAllFunctions();
    functions.forEach((functionName) => {
      if (functionName !== this.loggerFnName) {
        const functionData = this.service.getFunction(functionName);
        const normalizedFunctionName = this.provider.naming.getNormalizedFunctionName(functionName);
        _.merge(
          this.service.provider.compiledCloudFormationTemplate.Resources,
          {
            [`${normalizedFunctionName}SubscriptionFilter`]: {
              Type: 'AWS::Logs::SubscriptionFilter',
              Properties: {
                DestinationArn: { 'Fn::GetAtt': [loggerLogicalId, "Arn"] },
                FilterPattern: '',
                LogGroupName: `/aws/lambda/${functionData.name}`,
              },
              DependsOn: ['LambdaPermissionForSubscription'],
            },
          }
        );
      }
    });
  }
}

module.exports = PapertrailLogging;
