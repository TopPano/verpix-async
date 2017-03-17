'use strict';



module.exports = {
  store: {
    bucket: 'MOCKUP',
    mockupBucketPath: '/tmp',
    mockupServerPort: 6559
  },
  servers: JSON.stringify([ { host: 'localhost', port: 4730 } ]),
  defaultTimeout: 30

};
