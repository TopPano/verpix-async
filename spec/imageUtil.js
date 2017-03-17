var imageDiff = require('image-diff');
var P = require('bluebird');
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


var areSamePromised = function(imagePairList){
  var taskList = [];

  for(var i=0; i<imagePairList.length; i++){
    taskList.push(
      imageDiff.getFullResultPromised({
        actualImage: imagePairList[i][0],
        expectedImage: imagePairList[i][1]
      })
    );
  }

  return P.all(taskList)  
  .then(function(resList){
    for(var i=0; i<resList.length; i++){
      if((resList[i].percentage) > 0){
        return P.resolve(false);
      }
    }
    return P.resolve(true);
  });
};


imageDiff.getFullResultPromised = P.promisify(imageDiff.getFullResult);
imageDiff.areSamePromised = areSamePromised; 

var imageUtil = {
  diff: imageDiff,
  exif: {
    hasExifTagSync: hasExifTagSync
  } 
};


module.exports = imageUtil;
