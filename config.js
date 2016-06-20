module.exports = {
  s3: {
    bucket: process.env.S3_BKT,
    mockupBucketPath: process.env.S3_MOCKUP_BKTPATH,
    mockupServerPort: process.env.S3_MOCKUP_PORT
  },
  servers: process.env.G_SERVERS ? JSON.parse(process.env.G_SERVERS) : [ { host: 'localhost', port: 4730 } ],
  defaultTimeout: 30
};
