'use strict';
var assert = require('assert');
var merge = require('lodash/merge');

// force the NODE_ENV should be in ['production', 'development', 'test']
var nodeEnvList = ['production', 'development', 'test'];
assert(nodeEnvList.indexOf(process.env.NODE_ENV)>-1,
  'Please set NODE_ENV in ['+nodeEnvList.toString()+']');

var config;
switch (process.env.NODE_ENV) {
  case 'production':
    config = require('./production.js');
    break;
  case 'development':
    config = require('./development.js');
    break;
  case 'test':
    config = require('./test.js');
    break;
  default:
    assert(false, 'Something wrong in config');
}

module.exports = merge({}, config, {
  store: {
    bucket: process.env.STORE_BKT,
    mockupBucketPath: process.env.STORE_MOCKUP_BKTPATH,
    mockupServerPort: process.env.STORE_MOCKUP_PORT
  },
  servers: process.env.G_SERVERS
});
