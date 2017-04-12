var P = require('bluebird');
var async = require('async');
var urlencode = require('urlencode');
var sharp = require('sharp');
var sizeOf = require('image-size');
var fs = require('fs');
var config = require('../config');
var randomstring = require('randomstring');
const spawn = require('child_process').spawn;
//var ObjectStore = require('../object-store');
var assert = require('assert');
var store;

const RESPONSIVE_PANO_DIMENSIONS = [
  {width: 8000, height: 4000, tiles: 8},
  {width: 4000, height: 2000, tiles: 8},
  {width: 2000, height: 1000, tiles: 2}
];

const inflate = P.promisify(require('zlib').inflate);
  
const tilizeAndCreatePromised = P.promisify(tilizeImageAndCreateObject);
function tilizeImageAndCreateObject(imgBuf, params, callback) {
  var tiles = calTileGeometries(params.width, params.height, params.tiles);
  async.map(tiles, function(tile, callback) {
    sharp(imgBuf)
    .extract({left:tile.x, top:tile.y, width:tile.width, height:tile.height})
    .quality(70)
    .toFormat('jpeg')
    .toBuffer( function(err, buffer) {
      if (err) { return callback(err); }
      var filename = tile.idx + '.jpg';
      var keyArr = [ params.shardingKey, 'media', params.mediaId, params.type, params.width+ 'X' +params.height, filename ];
      store.create(keyArr, buffer, function(err, result) {
        if (err) { return callback(err); }
        callback(null, {
          srcUrl: result.location,
          downloadUrl: result.location
        });
      });
    });
  }, callback);

  function calTileGeometries(imgWidth, imgHeight, tiles) {
    imgWidth = Number(imgWidth);
    imgHeight = Number(imgHeight);
    if (tiles === 8) {
      var tileWidth = imgWidth / 4;
      var tileHeight = imgHeight / 2;
      var tileGeometries = [0, 1, 2, 3, 4, 5, 6, 7].map(function(i) {
        var geometry = {};
        geometry.idx = i;
        geometry.width = tileWidth;
        geometry.height = tileHeight;
        if (i < 4) {
          geometry.x = i * tileWidth;
          geometry.y = 0;
        } else {
          geometry.x = (i % 4) * tileWidth;
          geometry.y = tileHeight;
        }
        return geometry;
      });
      return tileGeometries;
    }
    else if (tiles === 2) {
      var tileWidth = imgWidth / 2;
      var tileHeight = imgHeight;
      var tileGeometries = [0, 1].map(function(i) {
        var geometry = {};
        geometry.idx = i;
        geometry.width = tileWidth;
        geometry.height = tileHeight;
        geometry.x = i * tileWidth;
        geometry.y = 0;
        return geometry;
      });
      return tileGeometries;
    } 
    else { // just only one tiles, that is, no tile
      var tileGeometries = [];
      tileGeometries.push({idx:0, x:0, y:0, width: imgWidth, height: imgHeight});
      return tileGeometries;
    }// if-else
  }
}

/** 
* @function procAndStoreImgPromised
* @params
* @returns
* @description resize, tilize and store panophoto in Promised way
*/
var procAndStoreImgPromised = function(params){
  var compare = function(a, b){
    if(a.width < b.width)
      {return 1;}
    if(a.width > b.width)
      {return -1;}
    return 0;
  };
  RESPONSIVE_PANO_DIMENSIONS.sort(compare);

  return P.map(RESPONSIVE_PANO_DIMENSIONS, (option, index, length) => {
    if(params.width < option.width){
      // if imgWidth is smaller than option, do nothing
      if(index === (length-1)){
        // the last option, the srcImg is smaller than the smallest option
        // so just save src
        // TODO: if the srcImg is too small, need tilize? need to add testcase for small srcImg
        let sizeStr = params.width.toString()+'X'+params.height.toString();
        let imgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano', sizeStr, '0.jpg' ];
        return store.createPromised(imgKeyArr, params.image, {contentType: 'image/jpeg'})
        .then(() => {
          return P.resolve({size: sizeStr, tiles: 1});
        });
      }
    }
    else if(params.width === option.width && params.height === option.height) {
      // do tilize directliy
      return tilizeAndCreatePromised(
        params.image, {
          type: 'pano',
          width: option.width,
          height: option.height,
          tiles: option.tiles,
          mediaId: params.mediaId,
          shardingKey: params.shardingKey
      }).
      then((err) => {
        if (err) { return P.reject(new Error(err)); }
        return P.resolve({size: option.width + 'X' + option.height, tiles: option.tiles});
      });
    }
    else {
      // downsize and tilize
      return sharp(params.image)
      .resize(option.width, option.height)
      .toBuffer()
      .then((buffer) => {
        return tilizeAndCreatePromised(buffer, {
          type: 'pano',
          width: option.width,
          height: option.height,
          tiles: option.tiles,
          mediaId: params.mediaId,
          shardingKey: params.shardingKey
        });
      })
      .then(() => {
        return P.resolve({size: option.width + 'X' + option.height, tiles: option.tiles});
      })
      .catch((err) => {return P.reject(err);});
    }
    // TODO: maybe it should be return P.reject, the process should come here
    // it should be in if-else
    return P.resolve();
  }) // P.map
  .then((result) => {
    for(let i=result.length-1; i>-1; i--){
      if(!result[i])
      {result.splice(i, 1);}
    }
    return P.resolve(result);
  });
};


var addExifTag = P.promisify(function(srcImgBuf, tag, callback) {
  var tmpFilename = '/tmp/'+randomstring.generate(6);
  fs.writeFile(tmpFilename, srcImgBuf, (err) => {
    if(err) {return callback(err);}
    const exiftool = spawn('exiftool', [tag, tmpFilename]);
    exiftool.stderr.on('data', (data) => {return callback(data);});
    exiftool.on('close', (code) => {
      if(code !== 0) {return callback('Exiftool code: '+code.toString());}
      fs.readFile(tmpFilename, (err, data) =>{
        if(err) {return callback(err);}
        fs.unlinkSync(tmpFilename);
        fs.unlinkSync(tmpFilename + '_original');
        callback(null, data);
      });

    });
  });
});

/*
 * create a resized image (smaller than 4000X2000) 
 * with EXIF Tag "ProjectionType=equirectangular" 
 * for sharing to FB 
 */
var createShareImg = P.promisify( function(imgBuf, width, height, callback) {
  var sharpObj;
  if(width > 4000) {
    sharpObj = sharp(imgBuf).resize(4000, 2000);
  }
  else {
    sharpObj = sharp(imgBuf);
  }

  sharpObj.jpeg({quality:90})
   .toBuffer((err, downsizeBuf) => {
     addExifTag(downsizeBuf, '-ProjectionType=equirectangular')
     .then((exifBuf) => { 
       callback(null, exifBuf);
     });
   });
});

var createPano = function(params) {
  // 1. check if srcBuf is zipped
  // 2. TODO check the width:height=2:1?
  // 3. parallel( push independent tasks in taskList to run parallell):
  //   -> save thumb.jpg
  //   -> save src.jpg
  //   -> resize(if needed) -> tilize(if needed) -> save
  //   -> create shared img -> save
  return P.try(() => {
      let srcBuf = new Buffer(params.image.buffer, 'base64');
      if (params.image.hasZipped) {
        return inflate(srcBuf);
      }
      else{
        return P.resolve(srcBuf);
      }
    })
    .then((srcImgBuf) => {
      let imgSize = sizeOf(srcImgBuf);
      let imgWidth = imgSize.width;
      let imgHeight = imgSize.height;
      // TODO: check the width:height = 2:1?

      let thumbImgBuf = new Buffer(params.thumbnail.buffer, 'base64');
      let thumbImgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
        'thumb.jpg' ];
      let srcImgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
        'src.jpg' ];
      let shareKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
                   'share.jpg' ];
      var taskList = [];

      // save thumb.jpg
      taskList.push(store.createPromised(thumbImgKeyArr, thumbImgBuf, {contentType: 'image/jpeg'}));
      // save src.jpg
      taskList.push(store.createPromised(srcImgKeyArr, srcImgBuf, {contentType: 'image/jpeg'}));
      // resize, tilize & save image
      taskList.push(procAndStoreImgPromised({
        image: srcImgBuf, 
        width: imgWidth, height: imgHeight,
        mediaId: params.mediaId,
        shardingKey: params.shardingKey
      }));
      // createShareImg
      taskList.push(createShareImg(srcImgBuf, params.image.width, params.image.height)
                    .then((shareBuf) => {
                          return store.createPromised(shareKeyArr, shareBuf, {contentType: 'image/jpeg'});
                    })
      );
      return P.all(taskList);
    })
    .then((result) => {
      if (result ){
        let quality = result[2];
        return P.resolve(quality);
      }
      else{return P.reject(new Error('result is undefined'));}
    });
};

var jobCreatePano = function(job) {
  try {
    var params = JSON.parse(job.payload);
    createPano(params)
    .then(function(result) {
      var response = {
        type: params.type,
        mediaId: params.mediaId,
        quality: result
      };
      job.workComplete(JSON.stringify(response));
    })
    .catch(function(err) {
      job.reportException(err);
    });
  } catch (err) {
    job.reportException(err);
  }
};

var deleteImages = function(params){
  // TODO: maybe deletImages should be split into pano and live
  var type;  
  if (params.media.type === 'panoPhoto') {
    type = 'pano';
  }  
  else if (params.media.type === 'livePhoto') {
    type = 'live';
  }
  var deleteList = []; 
  var keyPrefix = params.media.content.shardingKey+'/media/'+params.media.sid+'/'+type+'/';

  deleteList.push(keyPrefix+'thumb.jpg');
  deleteList.push(keyPrefix+'src.jpg');
  
  if (type === 'pano'){
    deleteList.push(keyPrefix+'share.jpg');
  }
  else if(type === 'live'){
    deleteList.push(keyPrefix+'src.jpg.zip');
    deleteList.push(keyPrefix+'video.mp4');
  }
  params.media.content.quality.map(function(quality) {
    if (type === 'pano') { 
      for(let i=0; i<quality.tiles; i++) {
        deleteList.push(keyPrefix+quality.size+'/'+i+'.jpg');
      }
    }
    else if(type === 'live') {
       for(let i=0; i<params.media.content.count; i++) {
        deleteList.push(keyPrefix+quality+'/'+i+'.jpg');
      }
    }
  });

  return new Promise((resolve, reject) => {
    store.delete(deleteList, function(err) { 
      if (err) { reject(err); }
      else{resolve();}
    });
  });
};

var jobDeletePano = function(job) {
  try {
    var params = JSON.parse(job.payload);
    if (!params.media) {
      return job.workComplete(JSON.stringify({
        status: 'success'
      }));
    }
    deleteImages(params)
    .then(() => { 
      job.workComplete(JSON.stringify({
        status: 'success'
      }));
    },
    (err) => {
      if (err) { return job.reportException(err); }
    });
  } catch (err) {
    job.reportException(err);
  }
};


store = require('./store.js');
var addTo = function (worker) {
  worker.addFunction('mediaProcessingPanoPhoto', jobCreatePano, { timeout: config.defaultTimeout });
  worker.addFunction('deleteMediaImages', jobDeletePano, { timeout: config.defaultTimeout });
  // TODO: I(@uniray7) plan a naming convention that all exposed function will have prefix "job"
};
module.exports = {
  addTo: addTo
};
