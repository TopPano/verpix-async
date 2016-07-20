'use strict';

var config = require('../config');
var worker = require('gearmanode').worker({ servers: config.servers });
worker.jobServers.forEach(function(server) {
  // XXX: This is for shutting warning: 'Warning: Possible EventEmitter
  //      memory leak detected. 11 Connect listeners added. Use emitter.
  //      setMaxListeners() to increase limit'.
  //
  //      setMaxListeners(0) will set the max listeners to unlimit.
  server.setMaxListeners(0);
});

var postFunc = require('./post');
var userFunc = require('./user');
var shareFunc = require('./share');
postFunc.addTo(worker);
userFunc.addTo(worker);
shareFunc.addTo(worker);
