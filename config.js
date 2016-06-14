module.exports = {
  servers: process.env.G_SERVERS ? JSON.parse(process.env.G_SERVERS) : [ { host: 'localhost', port: 4730 } ],
  defaultTimeout: 30
};
