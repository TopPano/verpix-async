module.exports = {
  s3Bucket: process.env.S3_BKT,
  servers: process.env.G_SERVERS ? JSON.parse(process.env.G_SERVERS) : [ { host: 'localhost', port: 4730 } ],
  defaultTimeout: 30
};
