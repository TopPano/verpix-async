var imageDiff = require('image-diff');
var P = require('bluebird');
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;


var hasExifTagSync = function(imgFileName, tag, value) {
  var result = execSync('exiftool -' + tag + ' ' + imgFileName);
  result = result.toString('utf8');
  if(result.endsWith(value+'\n')){
    return true;
  }
  else{
    return false;
  }
};



imageDiff.getFullResultPromised = P.promisify(imageDiff.getFullResult);

var imageUtil = {
  diff: imageDiff,
  exif: {
    hasExifTagSync: hasExifTagSync
  } 
};


module.exports = imageUtil;
