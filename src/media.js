var P = require('bluebird');
var merge = require('lodash/merge');
var moment = require('moment');
var async = require('async');
var urlencode = require('urlencode');
var sharp = require('sharp');
var ffmpeg = require('fluent-ffmpeg');
var fs = require('fs');
var config = require('../config');
var randomstring = require('randomstring');
const spawn = require('child_process').spawn;
var ObjectStore = require('../object-store');
var assert = require('assert');
var store;

// force the NODE_ENV should be in ['production', 'development', 'test']
var nodeEnvList = ['production', 'development', 'test'];
assert(nodeEnvList.indexOf(process.env.NODE_ENV)>-1, 
  'Please set NODE_ENV in ['+nodeEnvList.toString()+']');

if (config.store.bucket === 'MOCKUP') {
  store = P.promisifyAll(new ObjectStore({
    bucket: config.store.bucket,
    mockupBucketPath: config.store.mockupBucketPath,
    mockupServerPort: config.store.mockupServerPort
  }), { suffix: 'Promised' });
}
else {
  store = P.promisifyAll(new ObjectStore({ bucket: config.store.bucket }), { suffix: 'Promised' });
}

var RESPONSIVE_PANO_DIMENSIONS = [
  {width: 8000, height: 4000, tiles: 8},
  {width: 4000, height: 2000, tiles: 8},
  {width: 2000, height: 1000, tiles: 2}
];

var inflate = P.promisify(require('zlib').inflate);

var processImageAsync = P.promisify(function(params, callback) {
  var results = [];
  var processQ = async.queue(function(task, cb) {
    if (task.cmd === 'tilize') {
      tilizeImageAndCreateObject(task.image, {
        type: 'pano',
        width: task.width,
        height: task.height,
        tiles: task.tiles,
        mediaId: task.mediaId,
        shardingKey: task.shardingKey
      }, function(err, result) {
        if (err) { return cb(err); }
        results.push({size: task.width + 'X' + task.height, tiles: task.tiles});
        cb();
      });
     }
    else if (task.cmd === 'resizeAndTilize') {
      sharp(task.image)
      .resize(task.width, task.height)
      .toBuffer(function(err, buffer) {
        if (err) { return cb(err); }
        tilizeImageAndCreateObject(buffer, {
          type: 'pano',
          width: task.width,
          height: task.height,
          tiles: task.tiles,
          mediaId: task.mediaId,
          shardingKey: task.shardingKey
        }, function(err, result) {
          if (err) { return cb(err); }
          results.push({size: task.width + 'X' + task.height, tiles: task.tiles});
          cb();
        });
      });
    }
  }, 2); 

  processQ.drain = function(result) {
    results.sort(function(a, b) {
      var keyA = a.size,
          keyB = b.size;
      if(keyA < keyB) return 1;
      if(keyA > keyB) return -1;
      return 0;
    });
    callback(null, results);
  };

  /** 
   * Determine which tilize and resize options in RESPONSIVE_PANO_DIMENSIONS should be chosen.
   * It depends on image's size.
   */
  RESPONSIVE_PANO_DIMENSIONS.forEach(function(defaultDim, index, array) {
    var task = {};
    task.image = params.image;
    task.type = 'pano';      
    task.width = defaultDim.width;
    task.height = defaultDim.height;
    task.tiles = defaultDim.tiles;
    task.mediaId = params.mediaId;
    task.shardingKey = params.shardingKey;
    if (params.width < defaultDim.width){
      // if the photo is smaller than 2048
      if (index === (array.length-1)) {
        task.width = params.width;
        task.height = params.height;
        task.cmd = 'tilize';
        processQ.push(task, function(err) {
          if(err) {callback(err);}
        });
      }
      // TODO: maybe have to check the img is 2:1? if not, resize.
      // and think about when the img is too small, how should be tilized?
    }
    else if(params.width === defaultDim.width && params.height === defaultDim.height) {
      // do tilize directliy
      task.cmd = 'tilize';
      processQ.push(task, function(err) {
        if(err) {callback(err);}
      });
    }
    else {
      // downsize and tilize
      task.cmd = 'resizeAndTilize';
      processQ.push(task, function(err) {
        if(err) {callback(err);}
      });
    }
  });  

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
});

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

var processPanoPhoto = function(params) {
    var srcImgBuf = new Buffer(params.image.buffer, 'base64');
    var thumbImgBuf = new Buffer(params.thumbnail.buffer, 'base64');

    var thumbImgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
                           'thumb.jpg' ];


    return store.createPromised(thumbImgKeyArr, thumbImgBuf)
    .then(function() {
      if (params.image.hasZipped) {
        return inflate(srcImgBuf);
      }
      return P.resolve(srcImgBuf);
    })
    .then(function(imgBuf) {
      var imgKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
                         'src.jpg' ];
      var shareKeyArr = [ params.shardingKey, 'media', params.mediaId, 'pano',
                         'share.jpg' ];
      return P.all([
        store.createPromised(
          imgKeyArr, 
          imgBuf, 
          {contentType: 'image/jpeg'}),
        processImageAsync({
          image: imgBuf,
          width: params.image.width,
          height: params.image.height,
          mediaId: params.mediaId,
          shardingKey: params.shardingKey
        }),
        createShareImg(imgBuf, params.image.width, params.image.height)
          .then((shareBuf) => {
            return store.createPromised(shareKeyArr, shareBuf, {contentType: 'image/jpeg'});
        })
      ]);
    });
};


var mediaProcessingPanoPhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    processPanoPhoto(params)
    .then(function(result) {
      var response = {
        type: params.type,
        mediaId: params.mediaId,
        quality: result[1]
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
      list.push({width: imgWidth, height: imgHeight, quality: 75});
      list.push({width: 480, height: Math.round((imgHeight * 480) / imgWidth), quality: 75});
      list.push({width: 360, height: Math.round((imgHeight * 360) / imgWidth), quality: 80});
      list.push({width: 240, height: Math.round((imgHeight * 240) / imgWidth), quality: 90});
    }
    else if((imgWidth <= 480) && (imgWidth > 360)) {
      list.push({width: imgWidth, height: imgHeight, quality: 75});
      list.push({width: 360, height: Math.round((imgHeight * 360) / imgWidth), quality: 80});
      list.push({width: 240, height: Math.round((imgHeight * 240) / imgWidth), quality: 90});
    }
    else if((imgWidth <= 360) && (imgWidth > 240)) {
      list.push({ width: imgWidth, height: imgHeight, quality: 80 });
      list.push({ width: 240, height: Math.round((imgHeight * 240) / imgWidth), quality: 90});
    }
    else {  
      list.push({ width: imgWidth, height: imgHeight, quality: 90 });
    }

    // make all height is even, for limits of converting livephotos to video
    for (var i = 0; i < list.length; i++){
      if (list[i].height%2 === 1){
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
    var mediaObj = JSON.parse(job.payload);
    var keyPrefix = mediaObj.content.shardingKey+'/media/'+mediaObj.sid+'/';
    if (mediaObj.type === 'livePhoto'){
      keyPrefix += 'live/';
    }
    keyPrefix = keyPrefix + mediaObj.content.quality[0] + '/';  
    var cdnUrl = mediaObj.content.cdnUrl;  
    var tmpFilename = randomstring.generate(4) + '_' + mediaObj.sid;

    
    var convertJpgToVideo = function(params, callback) {
      var originalStream = fs.createWriteStream(params.oriFilename);
      ffmpeg()
      .input(params.input)
      .inputFPS(25)
      .fps(25)
      .videoCodec('libx264')
      .format('avi')
      .on('end', function() {
        callback(null, params);
      })
      .pipe(originalStream);
    };
    
    var createReverseVideo = function(params, callback) {
      var reversedStream = fs.createWriteStream(params.revFilename);
      ffmpeg()
      .input(params.oriFilename)
      .inputFPS(25)
      .videoCodec('libx264')
      .videoFilters('reverse')
      .fps(25)
      .format('avi')
      .on('end', function() {
        callback(null, params);
      })
      .pipe(reversedStream);
    };
    
    var concatVideo = function(params, callback) {
      ffmpeg()
      .input(params.oriFilename)
      .input(params.revFilename)
      .format('mp4')
      .on('end', function(){
        callback(null, params);
      })
      .mergeToFile(params.outFilename, './');
    };
 
    var uploadS3 = function(params, callback) {
      fs.readFile(params.outFilename, function(err, data){
        if(err){ return job.reportException(err); }  
        var keyArr = [ mediaObj.content.shardingKey, 'media', mediaObj.sid, 'live', 'video.mp4' ];
        store.create(keyArr, data, {contentType: 'video/mp4'}, function(err, result) {
          if (err) {return callback(err);}
          callback(null, params);
        });
      });
    };
 
    var deleteTmps = function(params, callback) {
      async.parallel([
        (cb) => { 
          fs.unlink(params.oriFilename, function(err, data){
            if (err) { return cb(err);}
            cb(null);
          });  
        },
        (cb) => { 
          fs.unlink(params.revFilename, function(err, data){
            if (err) { return cb(err);}
            cb(null);
          });  
        },
        (cb) => { 
          fs.unlink(params.outFilename, function(err, data){
            if (err) { return cb(err);}
            cb(null);
          });  
        }],

        (err, res) =>{
          if(err) {return callback(err);}
          callback(null);
        });
    };
   
    var flow = async.seq(convertJpgToVideo, createReverseVideo, concatVideo, uploadS3, deleteTmps); 
    flow({
          outFilename: tmpFilename+'.mp4',
          oriFilename: tmpFilename+'Ori',
          revFilename: tmpFilename+'Rev',
          input: cdnUrl+keyPrefix+'%d.jpg'
        }, 
        function(err, res){
          if(err){return job.reportException(err);}
          job.workComplete(JSON.stringify({
            status: 'success',
            videoType: 'mp4'  
          }));
    });

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

if (process.env.NODE_ENV === 'test') {
  module.exports = {
    mediaProcessingPanoPhoto: mediaProcessingPanoPhoto,
    mediaProcessingLivePhoto: mediaProcessingLivePhoto,
    deleteMediaImages: deleteMediaImages,
    convertImgsToVideo: convertImgsToVideo,
    createShareImg: createShareImg,
    addExifTag: addExifTag,
  };
 
}

