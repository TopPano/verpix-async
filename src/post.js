var P = require('bluebird');
var merge = require('lodash/merge');
var moment = require('moment');
var async = require('async');
var urlencode = require('urlencode');
var gm = require('gm');
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
var DEFAULT_LIVE_LOW_DIMENSION = {
  width: 320,
  height: 240
};

var inflate = P.promisify(require('zlib').inflate);

var processImageAsync = P.promisify(function(params, callback) {
  async.parallel({
    webImages: function(callback) {
      tilizeImageAndCreateObject(params.image, {
        type: 'pan',
        quality: 'high',
        width: params.width,
        height: params.height,
        postId: params.postId,
        timestamp: params.timestamp
      }, function(err, result) {
        if (err) { return callback(err); }
        callback(null, result);
      });
    },
    mobileImages: function(callback) {
      gm(params.image)
      .resize(DEFAULT_PANO_DIMENSION_FOR_MOBILE.width, DEFAULT_PANO_DIMENSION_FOR_MOBILE.height)
      .toBuffer('JPG', function(err, buffer) {
        if (err) { return callback(err); }
        async.parallel({
          downsized: function(callback) {
            var keyArr = [ 'posts', params.postId, 'SHARDING', 'pan', 'src', params.timestamp,
                           params.postId + '_low.jpg' ];
            store.create(keyArr, buffer, function(err, result) {
              if (err) { return callback(err); }
              callback(null, {
                s3Filename: result.key,
                s3Url: result.location,
                cdnFilename: result.key,
                cdnUrl: result.location
              });
            });
          },
          tiled: function(callback) {
            tilizeImageAndCreateObject(params.image, {
              type: 'pan',
              quality: 'low',
              width: DEFAULT_PANO_DIMENSION_FOR_MOBILE.width,
              height: DEFAULT_PANO_DIMENSION_FOR_MOBILE.height,
              postId: params.postId,
              timestamp: params.timestamp
            }, function(err, result) {
              if (err) { return callback(err); }
              callback(null, result);
            });
          }
        }, function(err, results) {
          if (err) { return callback(err); }
          callback(null, results);
        });
      });
    }
  }, function(err, results) {
    if (err) { return callback(err); }
    callback(null, results);
  });

  function tilizeImageAndCreateObject(imgBuf, params, callback) {
    var tiles = calTileGeometries(params.width, params.height)
    async.map(tiles, function(tile, callback) {
      gm(imgBuf)
      .crop(tile.width, tile.height, tile.x, tile.y)
      .toBuffer('JPG', function(err, buffer) {
        if (err) { return callback(err); }
        var filename = params.postId + '_' + (params.projectMethod ? params.projectMethod : 'equirectangular') + '_' + tile.idx + '.jpg'
        var keyArr = [ 'posts', params.postId, 'SHARDING', params.type, params.quality, params.timestamp,
                       filename ];
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

var postProcessingPanoPhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var srcImgBuf = new Buffer(params.image.buffer, 'base64');
    var thumbImgBuf = new Buffer(params.thumbnail.buffer, 'base64');
    var now = moment(new Date()).format('YYYY-MM-DD');
    var response = {
      mediaType: params.mediaType,
      postId: params.postId
    };
    var srcImgKeyArr = [ 'posts', params.postId, 'SHARDING', 'pan', 'src', now,
                         params.postId + (params.image.hasZipped ? '.jpg.zip' : '.jpg') ];
    store.createPromised(srcImgKeyArr, srcImgBuf, {
      contentType: params.image.hasZipped ? 'application/zip' : 'image/jpeg'
    })
    .then(function(result) {
      response = merge({}, response, {
        srcUrl: result.location,
        srcDownloadUrl: result.location
      });
      var thumbImgKeyArr = [ 'posts', params.postId, 'SHARDING', 'pan', 'thumb', now,
                             params.postId + '.jpg' ];
      return store.createPromised(thumbImgKeyArr, thumbImgBuf);
    })
    .then(function(result) {
      response = merge({}, response, {
        thumbUrl: result.location,
        thumbDownloadUrl: result.location
      });
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
        postId: params.postId,
        timestamp: now
      });
    })
    .then(function(result) {
      response = merge({}, response, {
        srcTiledImages: result.webImages,
        srcMobileUrl: result.mobileImages.downsized.s3Url,
        srcMobileDownloadUrl: result.mobileImages.downsized.cdnUrl,
        srcMobileTiledImages: result.mobileImages.tiled
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
  var srcImgKeyArr = [ 'posts', params.postId, 'SHARDING', 'live', 'src', params.timestamp,
                       params.postId + (params.image.hasZipped ? '.jpg.zip' : '.jpg') ];
  var srcImgBuf = new Buffer(params.image.buffer, 'base64');
  store.createPromised(srcImgKeyArr, srcImgBuf, {
    contentType: params.image.hasZipped ? 'application/zip' : 'image/jpeg'
  })
  .then(function(result) {
    response = merge({}, response, {
      srcUrl: result.location,
      srcDownloadUrl: result.location
    });
    if (params.image.hasZipped) {
      return inflate(srcImgBuf);
    }
    return P.resolve(srcImgBuf);
  })
  .then(function(imgBuf) {
    var parsedImgArr = Buffer(imgBuf, 'binary').toString('binary').split(params.image.arrayBoundary);
    return new P(function(resolve, reject) {
      var high = [], low = [];
      async.forEachOf(parsedImgArr, function(image, index, callback) {
        gm(Buffer(image, 'binary'))
        .autoOrient() // Auto-orients the image according to its EXIF data.
        .toBuffer(function(err, buffer) {
          if (err) { return callback(err); }
          async.parallel({
            createObjHigh: function(callback) {
              var keyArr = [ 'posts', params.postId, 'SHARDING', 'live', 'high', params.timestamp,
                             params.postId + '_high_' + index + '.jpg' ];
              store.create(keyArr, buffer, function(err, result) {
                if (err) { return callback(err); }
                high[index] = {
                  srcUrl: result.location,
                  downloadUrl: result.location
                };
                callback();
              });
            },
            createObjLow: function(callback) {
              gm(buffer)
              .resize(DEFAULT_LIVE_LOW_DIMENSION.width, DEFAULT_LIVE_LOW_DIMENSION.height)
              .toBuffer('JPG', function(err, resizedImg) {
                if (err) { return callback(err); }
                var keyArr = [ 'posts', params.postId, 'SHARDING', 'live', 'low', params.timestamp,
                               params.postId + '_low_' + index + '.jpg' ];
                store.create(keyArr, buffer, function(err, result) {
                  if (err) { return callback(err); }
                  low[index] = {
                    srcUrl: result.location,
                    downloadUrl: result.location
                  };
                  callback();
                });
              });
            }
          }, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        });
      }, function(err) {
        if (err) { return reject(err); }
        resolve({ high: high, low: low });
      });
    });
  })
  .then(function(result) {
    response = merge({}, response, {
      srcHighImages: result.high,
      srcLowImages: result.low
    });
    callback(null, response);
  })
  .catch(function(err) {
    callback(err);
  });
}

function processLivePhotoThumb(params, callback) {
  var srcImgBuf = new Buffer(params.image.buffer, 'base64');
  gm(srcImgBuf)
  .autoOrient()
  .toBuffer('JPG', function(err, buffer) {
    if (err) { return callback(err); }
    var keyArr = [ 'posts', params.postId, 'SHARDING', 'live', 'thumb', params.timestamp,
                   params.postId + '.jpg' ];
    store.create(keyArr, buffer, function(err, result) {
      if (err) { return callback(err); }
      callback(null, {
        thumbUrl: result.location,
        thumbDownloadUrl: result.location
      });
    });
  });
}

var postProcessingLivePhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var now = moment(new Date()).format('YYYY-MM-DD');
    var response = {
      mediaType: params.mediaType,
      postId: params.postId
    };
    async.parallel({
      src: function(callback) {
        processLivePhotoSrc({
          postId: params.postId,
          image: params.image,
          timestamp: now
        }, callback);
      },
      thumb: function(callback) {
        processLivePhotoThumb({
          postId: params.postId,
          image: params.thumbnail,
          timestamp: now
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

var deletePostImages = function(job) {
  try {
    var params = JSON.parse(job.payload);
    if (!params.imageList || params.imageList.length === 0) {
      return job.workComplete(JSON.stringify({
        status: 'success'
      }));
    }

    var parsedList = params.imageList.map(function(url) {
      return urlencode.decode(url.split('/').slice(3).join('/'), 'gbk');
    });
    store.delete(parsedList, function(err) {
      if (err) { return job.reportException(err); }
      job.workComplete(JSON.stringify({
        status: 'success'
      }));
    });
  } catch (err) {
    job.reportException(err);
  }
};

function addTo(worker) {
  worker.addFunction('postProcessingPanoPhoto', postProcessingPanoPhoto, { timeout: config.defaultTimeout });
  worker.addFunction('postProcessingLivePhoto', postProcessingLivePhoto, { timeout: config.defaultTimeout });
  worker.addFunction('deletePostImages', deletePostImages, { timeout: config.defaultTimeout });
}

module.exports = {
  addTo: addTo
};
