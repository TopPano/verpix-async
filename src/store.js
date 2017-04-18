var P = require('bluebird');
var config = require('../config');
var ObjectStore = require('../object-store');
var store;


if (config.store.bucket === 'MOCKUP') {
  store = P.promisifyAll(new ObjectStore({
    bucket: config.store.bucket,
    mockupBucketPath: config.store.mockupBucketPath,
    mockupServerPort: config.store.mockupServerPort
  }), { suffix: 'Promised' });
}
else {
  store = P.promisifyAll(new ObjectStore({ bucket: config.store.bucket }), { suffix: 'Promised' });
}



module.exports = store;
