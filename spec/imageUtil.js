var imageDiff = require('image-diff');
var fs = require('fs');
var P = require('bluebird');
var farmhash = require('farmhash');

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

var getFullResultPromised = function(actualImage, expectedImage){
  // it need to check image existed
  // image-diff doesnt do this check well
  if(!fs.existsSync(actualImage)) {
    return P.reject(new Error(actualImage + ' doesn\'t exist'));
  }
  else if(!fs.existsSync(expectedImage)){
    return P.reject(new Error(expectedImage + ' doesn\'t exist'));
  }
  return new Promise((resolve, reject) => {
    imageDiff.getFullResult({
      actualImage: actualImage,
      expectedImage: expectedImage
    }, (err, result) => {
      if(err){reject(err);}
      else{resolve(result);}
    });
  });
};

var areSamePromised = function(imagePairList){
  var taskList = [];
  for(var i=0; i<imagePairList.length; i++){
    taskList.push(
      getFullResultPromised(imagePairList[i][0], imagePairList[i][1])
    );
  }

  return P.all(taskList)  
  .then(function(resList){
    for(var i=0; i<resList.length; i++){
      if(typeof(resList[i].percentage) !== 'number'){
        return P.reject('something wrong in areSamePromised() in imgUtil.js');
      }
      if((resList[i].percentage) > 0.001){
        return P.resolve(false);
      }
    }
    return P.resolve(true);
  })
  .error(function(e){return P.reject(e);});
};

var areBufEqual = function(bufA, bufB) {
  var len = bufA.length;
  if (len !== bufB.length) {
    return false;
  }
  for (var i = 0; i < len; i++) {
    if (farmhash.hash32(bufA) !== farmhash.hash32(bufB)) {
      return false;
    }
  }
  return true;
};


imageDiff.areSamePromised = areSamePromised; 
imageDiff.areBufEqual = areBufEqual;

var imageUtil = {
  diff: imageDiff,
  exif: {
    hasExifTagSync: hasExifTagSync
  } 
};

module.exports = imageUtil;
