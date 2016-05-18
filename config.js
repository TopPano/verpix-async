module.exports = {
  servers: process.env.SERVERS ? [ JSON.parse(process.env.SERVERS) ] : [ { host: 'localhost', port: 4730 } ],
  defaultTimeout: 5
};
