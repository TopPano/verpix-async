var P = require('bluebird');
var merge = require('lodash/merge');
var moment = require('moment');
var async = require('async');
var urlencode = require('urlencode');
var sharp = require('sharp');
var ffmpeg = require('fluent-ffmpeg');
var config = require('../config');

var ObjectStore = require('../object-store');
var store;
if (config.store.bucket === 'MOCKUP') {
  store = P.promisifyAll(new ObjectStore({
    bucket: config.store.bucket,
    mockupBucketPath: config.store.mockupBucketPath,
    mockupServerPort: config.store.mockupServerPort
  }), { suffix: 'Promised' });
} else {
  store = P.promisifyAll(new ObjectStore({ bucket: config.store.bucket }), { suffix: 'Promised' });
}

var DEFAULT_PANO_DIMENSION_FOR_MOBILE = {
  width: 4096,
  height: 2048
};

var inflate = P.promisify(require('zlib').inflate);

var processImageAsync = P.promisify(function(params, callback) {
  async.parallel({
    webImages: function(callback) {
      tilizeImageAndCreateObject(params.image, {
        type: 'pano',
        width: params.width,
        height: params.height,
        mediaId: params.mediaId,
        shardingKey: params.shardingKey
      }, function(err, result) {
        if (err) { return callback(err); }
        callback(null, result);
      });
    },
    mobileImages: function(callback) {
      sharp(params.image)
      .resize(DEFAULT_PANO_DIMENSION_FOR_MOBILE.width, DEFAULT_PANO_DIMENSION_FOR_MOBILE.height)
      .toBuffer(function(err, buffer) {
        if (err) { return callback(err); }
        tilizeImageAndCreateObject(buffer, {
          type: 'pano',
          width: DEFAULT_PANO_DIMENSION_FOR_MOBILE.width,
          height: DEFAULT_PANO_DIMENSION_FOR_MOBILE.height,
          mediaId: params.mediaId,
          shardingKey: params.shardingKey
        }, function(err, result) {
          if (err) { return callback(err); }
            callback(null, result);

        });
      });
    }
  }, function(err, results) {
    if (err) { return callback(err); }
    results.quality = [];
    results.quality.push(params.width+ 'X' + params.height);  
    results.quality.push(DEFAULT_PANO_DIMENSION_FOR_MOBILE.width+ 'X' +DEFAULT_PANO_DIMENSION_FOR_MOBILE.height);  
    callback(null, results);
  });

  function tilizeImageAndCreateObject(imgBuf, params, callback) {
    var tiles = calTileGeometries(params.width, params.height)
    async.map(tiles, function(tile, callback) {
      sharp(imgBuf)
      .extract({left:tile.x, top:tile.y, width:tile.width, height:tile.height})
      .quality(70)
      .toFormat('jpeg')
      .toBuffer( function(err, buffer) {
        if (err) { return callback(err); }
        var filename = (params.projectMethod ? params.projectMethod : 'equirectangular') + '_' + tile.idx + '.jpg'
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

    function calTileGeometries(imgWidth, imgHeight) {
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
  }
});

var mediaProcessingPanoPhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var srcImgBuf = new Buffer(params.image.buffer, 'base64');
    var thumbImgBuf = new Buffer(params.thumbnail.buffer, 'base64');
    var response = {
      type: params.type,
      mediaId: params.mediaId
    };
    var srcImgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
                         'src' + (params.image.hasZipped ? '.jpg.zip' : '.jpg') ];
    store.createPromised(srcImgKeyArr, srcImgBuf, {
      contentType: params.image.hasZipped ? 'application/zip' : 'image/jpeg'
    })
    .then(function(result) { // add srcURL and srcDownUrl
//      response = merge({}, response, {
//          src:{
//              srcUrl: result.location,
//              srcDownloadUrl: result.location
//          }
//      });
      var thumbImgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
                             'thumb.jpg' ];
      return store.createPromised(thumbImgKeyArr, thumbImgBuf);
    })
    .then(function(result) {
//      response = merge({}, response, {
//        thumbUrl: result.location,
//        thumbDownloadUrl: result.location
//      });
      if (params.image.hasZipped) {
        return inflate(srcImgBuf);
      }
      return P.resolve(srcImgBuf);
    })
    .then(function(imgBuf) {
      return processImageAsync({
        image: imgBuf,
        width: params.image.width,
        height: params.image.height,
        mediaId: params.mediaId,
        shardingKey: params.shardingKey
      });
    })
    .then(function(result) {
      response = merge({}, response, {
//        srcTiledImages: result.webImages,
//        srcMobileTiledImages: result.mobileImages
        quality: result.quality
      });
      job.workComplete(JSON.stringify(response));
    })
    .catch(function(err) {
      job.reportException(err);
    });
  } catch (err) {
    job.reportException(err);
  }
};

function processLivePhotoSrc(params, callback) {
  var response = {};
  var sizeQualList;  
  var srcImgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'live', 'src' + (params.image.hasZipped ? '.jpg.zip' : '.jpg') ];
  var srcImgBuf = new Buffer(params.image.buffer, 'base64');
  
  function calSizeQualityList(imgMetadata) {
    var list = [];
    var element ;
    var imgWidth, imgHeight;  
    if (imgMetadata.orientation > 4) {    // Exif Orientation Tag ref:http://sylvana.net/jpegcrop/exif_orientation.html
      imgWidth = imgMetadata.height;
      imgHeight = imgMetadata.width;
    }
    else{
      imgWidth = imgMetadata.width;
      imgHeight = imgMetadata.height;
    }
    
    if(imgWidth > 600) {
      list.push({width: 600, height: Math.round((imgHeight * 600) / imgWidth), quality: 70});
      list.push({width: 480, height: Math.round((imgHeight * 480) / imgWidth), quality: 75});
      list.push({width: 360, height: Math.round((imgHeight * 360) / imgWidth), quality: 80});
      list.push({width: 240, height: Math.round((imgHeight * 240) / imgWidth), quality: 90});
    }
    else if((imgWidth <= 600) && (imgWidth > 480)) {
      list.push({width: imgWidth, height: imgHeight, quality: 75})
      list.push({width: 480, height: Math.round((imgHeight * 480) / imgWidth), quality: 75});
      list.push({width: 360, height: Math.round((imgHeight * 360) / imgWidth), quality: 80});
      list.push({width: 240, height: Math.round((imgHeight * 240) / imgWidth), quality: 90});
    }
    else if((imgWidth <= 480) && (imgWidth > 360)) {
      list.push({width: imgWidth, height: imgHeight, quality: 75})
      list.push({width: 360, height: Math.round((imgHeight * 360) / imgWidth), quality: 80});
      list.push({width: 240, height: Math.round((imgHeight * 240) / imgWidth), quality: 90});
    }
    else if((imgWidth <= 360) && (imgWidth > 240)) {
      list.push({ width: imgWidth, height: imgHeight, quality: 80 })
      list.push({ width: 240, height: Math.round((imgHeight * 240) / imgWidth), quality: 90});
    }
    else {  
      list.push({ width: imgWidth, height: imgHeight, quality: 90 })
    }

    // make all height is even, for limits of converting livephotos to video
    for (var i = 0; i < list.length; i++){
      if (list[i].height%2 == 1){
        list[i].height += 1;
      }
    }


    return list;
  }
    
  store.createPromised(srcImgKeyArr, srcImgBuf, {
    contentType: params.image.hasZipped ? 'application/zip' : 'image/jpeg'
  })
  .then(function(result) {
    if (params.image.hasZipped) {
      return inflate(srcImgBuf);
    }
    return P.resolve(srcImgBuf);
  })
  .then(function(srcImgBuf) {
    return new P(function(resolve, reject) {
      var parsedImgArr = Buffer(srcImgBuf, 'binary').toString('binary').split(params.image.imgArrBoundary);
      sharp(Buffer(parsedImgArr[0],'binary'))
        .metadata(function(err, metadata) {
          if(err) { return reject(err); }
          sizeQualList = calSizeQualityList(metadata);
          resolve(parsedImgArr);  
      })
    });
  })  
  .then(function(parsedImgArr) {
    return new P(function(resolve, reject) {
      async.forEachOf(parsedImgArr, function(image, imgIndex, asyncParsedImgCb) {
        var imgObj = sharp(Buffer(image, 'binary'));
        var rotatedImgObj = imgObj.rotate();
        async.forEachOf(sizeQualList, function(sizeQual, listIndex, asyncSizeQualCb) {
          rotatedImgObj
          .resize(sizeQual.width, sizeQual.height)
          .quality(sizeQual.quality)
          .toBuffer(function(err, outputBuf) {
            var keyArr = [ params.shardingKey, 'media', params.mediaId, 'live', sizeQual.width+ 'X' +sizeQual.height, imgIndex + '.jpg' ];
            store.create(keyArr, outputBuf, function(err, result) {
              if (err) { return asyncSizeQualCb(err); }
              asyncSizeQualCb();
            }); // store.create
          }); // .toBuffer
        },
        function(err) {
          if (err) { return reject(err); }
          asyncParsedImgCb();  
        }); // async.forEachOf
      },function(err) {
        if (err) { return reject(err); }
        var imgSizeList = sizeQualList.map(function(sizeQual) {
          return sizeQual.width + 'X' + sizeQual.height;
        });
        resolve({ count: parsedImgArr.length, 
                  quality: imgSizeList});
      });
    });
  })
  .then(function(result) {
    response = merge({}, response, result);
    callback(null, response);
  })
  .catch(function(err) {
    callback(err);
  });
}

function processLivePhotoThumb(params, callback) {
  var srcImgBuf = new Buffer(params.image.buffer, 'base64');
  sharp(srcImgBuf)
  .rotate()
  .toFormat('jpeg')  
  .toBuffer(function(err, buffer) {
    if (err) { return callback(err); }
    var keyArr = [ params.shardingKey, 'media', params.mediaId, 'live', 'thumb.jpg' ];
    store.create(keyArr, buffer, function(err, result) {
      if (err) { return callback(err); }
      callback(null);
    });
  });
}

var mediaProcessingLivePhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var response = {
      type: params.type,
      mediaId: params.mediaId
    };
    async.parallel({
      src: function(callback) {
        processLivePhotoSrc({
          mediaId: params.mediaId,
          image: params.image,
          shardingKey: params.shardingKey,
        }, callback);
      },
      thumb: function(callback) {
        processLivePhotoThumb({
          mediaId: params.mediaId,
          image: params.thumbnail,
          shardingKey: params.shardingKey
        }, callback);
      }
    }, function(err, results) {
      if (err) { return job.reportException(err); }
      response = merge({}, response, results.src, results.thumb);
      job.workComplete(JSON.stringify(response));
    });
  } catch (err) {
    job.reportException(err);
  }
};

var deleteMediaImages = function(job) {
  try {
    var params = JSON.parse(job.payload);
    if (!params.media) {
      return job.workComplete(JSON.stringify({
        status: 'success'
      }));
    }
    
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
    deleteList.push(keyPrefix+'src.jpg.zip');
    
    params.media.content.quality.map(function(quality) {
      for(var i=0; i<params.media.content.count; i++) {
        deleteList.push(keyPrefix+quality+'/'+i+'.jpg');
      }
    });
    store.delete(deleteList, function(err) {
      if (err) { return job.reportException(err); }
      job.workComplete(JSON.stringify({
        status: 'success'
      }));
    });
  } catch (err) {
    job.reportException(err);
  }
};

var convertImgsToVideo = function(job) {
  try {
    var params = JSON.parse(job.payload);



  } catch (err) {
    job.reportException(err);
  }
};



function addTo(worker) {
  worker.addFunction('mediaProcessingPanoPhoto', mediaProcessingPanoPhoto, { timeout: config.defaultTimeout });
  worker.addFunction('mediaProcessingLivePhoto', mediaProcessingLivePhoto, { timeout: config.defaultTimeout });
  worker.addFunction('deleteMediaImages', deleteMediaImages, { timeout: config.defaultTimeout });
  worker.addFunction('convertImgsToVideo', convertImgsToVideo, { timeout: config.defaultTimeout });
}

module.exports = {
  addTo: addTo
};
