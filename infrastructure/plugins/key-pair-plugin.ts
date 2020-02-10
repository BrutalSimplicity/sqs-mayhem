import * as Serverless from 'serverless';
import { Options } from 'serverless';
import Plugin = require('serverless/classes/Plugin');
import Aws = require('serverless/plugins/aws/provider/awsProvider')
import AWS = require('aws-sdk');
import { readFileSync } from 'fs';
import { assert } from 'console';
import { homedir } from 'os';

const PLUGIN_NAME = 'key-pair-plugin';

class KeyPairPlugin {
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
      'before:deploy:deploy': this.importKeyPair.bind(this),
      'after:remove:remove': this.deleteKeyPair.bind(this)
    }
  }

  async importKeyPair() {
    const { region } = this.serverless.service.provider;
    const config = this.serverless.service.custom[PLUGIN_NAME];
    if (!config) return;

    this.validateConfig(config);
    const keyPair = config['key-name'];
    let publicKeyPath = config['public-rsa-key'];
    publicKeyPath = publicKeyPath.startsWith('~') ? publicKeyPath.replace('~', homedir()) : publicKeyPath;
    const ec2 = new AWS.EC2({
      region
    });

    try {
      await ec2.importKeyPair({
        KeyName: keyPair,
        PublicKeyMaterial: readFileSync(publicKeyPath, { encoding: 'utf8' })
      }).promise();
    }
    catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
  }

  async deleteKeyPair() {
    const { region } = this.serverless.service.provider;
    const config = this.serverless.service.custom[PLUGIN_NAME];
    if (!config) return;

    this.validateConfig(config);
    const keyPair = this.serverless.service.custom[PLUGIN_NAME]['key-name'];
    const ec2 = new AWS.EC2({
      region
    });

    try {
      await ec2.deleteKeyPair({
        KeyName: keyPair,
      }).promise();
    } catch (err) {
      if (!err.message.includes('does not exist')) {
        throw err;
      }
    }
  }

  validateConfig(config) {
    ['key-name', 'public-rsa-key'].forEach(field => assert(config[field] && config[field] !== '', `${field} is required`));
  }
}

module.exports = KeyPairPlugin;