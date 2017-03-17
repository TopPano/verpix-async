'use strict';
var commandExists = require('command-exists').sync;
var assert = require('assert');

// Global before hook
before(function(done) {
  // confirm the checker(dependent to command) are installed
  assert.equal(commandExists('exiftool'), true, 'exiftool: command not found, plz install exiftool');
  assert.equal(commandExists('compare'), true, 'compare: command not found, plz install ImageMagick');

  done();
});


