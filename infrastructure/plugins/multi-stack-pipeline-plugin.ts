import * as Plugin from 'serverless/classes/Plugin';
import Serverless = require('serverless');
import { Options } from 'serverless';
import { execSync } from 'child_process';
import AWS = require('aws-sdk');
import Aws = require('serverless/plugins/aws/provider/awsProvider');

const PLUGIN_NAME = 'multi-stack-pipeline-plugin';

interface Properties {
  [props: string]: string;
}

interface StacksConfig {
  [stackName: string]: {
    [props: string]: string;
  }
}

interface Config {
  name: string;
  stacks: StacksConfig;
  regions: {
    [region: string]: StacksConfig;
  }
}

function applyRegionalOverrides(stackProps: Properties, regionProps: Properties): Properties {
  return {
    ...stackProps,
    ...regionProps
  };
}

function exec(cmd: string) {
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf8' });
}

async function stackExists(stack: string, serverless: Serverless): Promise<boolean> {
  const { region, stage } = serverless.service.provider;
  const cfn = new AWS.CloudFormation({
    region: region
  });

  const yaml = await serverless.yamlParser.parse(stack);
  const stackName = yaml.provider.stackName || yaml.service.name + '-' + stage;

  try {
    await cfn.describeStacks({
      StackName: stackName
    }).promise();
  } catch (err) {
    if (err.message.includes('does not exist')) {
      return false;
    }
    throw err;
  }

  return true;
}

class MultiStackPipelinePlugin {
  commands: Plugin.Commands;
  hooks: Plugin.Hooks;
  serverless: Serverless;
  options: Options;
  provider: Aws;

  constructor(serverless: Serverless, options: Options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.hooks = {
      'after:deploy:deploy': this.deployStacks.bind(this),
      'before:remove:remove': this.destroyStacks.bind(this)
    }
  }

  async deployStacks() {
    const config = this.serverless.service.custom[PLUGIN_NAME] as Config;
    const stage = this.serverless.service.provider.stage;
      for (const stack of Object.keys(config.stacks)) {
        for (const region of Object.keys(config.regions)) {
          
          const stackProps = applyRegionalOverrides(config.stacks[stack] || {}, config.regions[region]?.[stack] || {});
          let cmd = `sls deploy -v -c ${stack} -r ${region} -s ${stage} --force`;
          cmd = !stackProps ?
            cmd
            :
            `${cmd} ${Object.keys(stackProps).map(prop => `--${prop} ${stackProps[prop]}`).join(' ')}`

          this.serverless.cli.log(`Deploying ${stack}`);
          exec(cmd);
          this.serverless.cli.log(`${stack} deployed`);
        }
      }
  }

  async destroyStacks() {
    const config = this.serverless.service.custom[PLUGIN_NAME] as Config;
    const stage = this.serverless.service.provider.stage;
    for (const stack of Object.keys(config.stacks).reverse()) {
      for (const region of Object.keys(config.regions)) {
        const exists = await stackExists(stack, this.serverless);
        if (exists) {
          let cmd = `sls remove -v -c ${stack} -s ${stage} -r ${region}`;

          this.serverless.cli.log(`Removing ${stack}`);
          exec(cmd);
          this.serverless.cli.log(`${stack} removed`);
        }
      }
    }
  }
}

module.exports = MultiStackPipelinePlugin;