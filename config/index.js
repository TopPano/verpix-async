'use strict';

var merge = require('lodash/merge');

var base = require('./base');
var config = (process.env.NODE_ENV === 'production') ?
              require('./production.js') :
              require('./development.js');

module.exports = merge({}, base, config, {
  facebook: {
    appId: process.env.FB_APP_ID
  },
  twitter: {
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET
  },
  store: {
    bucket: process.env.STORE_BKT,
    mockupBucketPath: process.env.STORE_MOCKUP_BKTPATH,
    mockupServerPort: process.env.STORE_MOCKUP_PORT
  },
  servers: process.env.G_SERVERS
});
