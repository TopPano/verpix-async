'use strict';

var config = require('../config');
var worker = require('gearmanode').worker({ servers: JSON.parse(config.servers) });
worker.jobServers.forEach(function(server) {
  // XXX: This is for shutting warning: 'Warning: Possible EventEmitter
  //      memory leak detected. 11 Connect listeners added. Use emitter.
  //      setMaxListeners() to increase limit'.
  //
  //      setMaxListeners(0) will set the max listeners to unlimit.
  server.setMaxListeners(0);
});

var mediaFunc = require('./media');
var userFunc = require('./user');
mediaFunc.addTo(worker);
userFunc.addTo(worker);
