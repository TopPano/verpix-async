'use strict';

var config = require('../config');
var worker = require('gearmanode').worker({ servers: config.servers });

var postFunc = require('./post');
postFunc.addTo(worker);
