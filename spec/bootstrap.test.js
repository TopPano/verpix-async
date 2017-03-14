'use strict';
var commandExists = require('command-exists');

// Global before hook
before(function(done) {
  commandExists('exiftool', function(err, command){
    if(err) {
      done(err); 
    }
    else if(!command) {
      done(new Error('exiftool: command not found, plz install'));
    }
    else {
      done();
    }
  });


});


