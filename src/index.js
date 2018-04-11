'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
var AdmZip = require('adm-zip');


class PapertrailLogging {
  constructor(serverless) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'before:package:compileEvents': this.beforePackageCompileEvents.bind(this)
    }
  }

  beforePackageCompileEvents() {
    this.serverless.cli.log('Creating log subscriptions...');
    let logFnArn = this.service.custom.papertrail.log_function_arn
    _.merge(
      this.service.provider.compiledCloudFormationTemplate.Resources,
      {
        LambdaPermissionForSubscription: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: logFnArn,
            Action: 'lambda:InvokeFunction',
            Principal: { 'Fn::Sub': 'logs.${AWS::Region}.amazonaws.com' },
            SourceArn: { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/*' },
          }
        },
      }
    );

    let functions = this.service.getAllFunctions();
    functions.forEach(functionName => {
      let functionData = this.service.getFunction(functionName);
      let normalizedFunctionName = this.provider.naming.getNormalizedFunctionName(functionName);
      _.merge(
        this.service.provider.compiledCloudFormationTemplate.Resources,
        {
          [`${normalizedFunctionName}SubscriptionFilter`]: {
            Type: 'AWS::Logs::SubscriptionFilter',
            Properties: {
              DestinationArn: logFnArn,
              FilterPattern: '',
              LogGroupName: `/aws/lambda/${functionData.name}`,
            },
            DependsOn: ['LambdaPermissionForSubscription'],
          },
        }
      );
    });
  }
}

module.exports = PapertrailLogging;
