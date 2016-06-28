var P = require('bluebird');
var merge = require('lodash/merge');
var moment = require('moment');
var S3Uploader = require('../aws-wrapper').S3Uploader;
var S3Remover = require('../aws-wrapper').S3Remover;
var genShardingKey = require('./utils/sharding-key-gen');
var assert = require('assert');
var request = require('request');
var async = require('async');
var urlencode = require('urlencode');
var gm = require('gm');
var config = require('../config');

var DefaultPanoDimensionForMobile = {
  width: 4096,
  height: 2048
};
var DefaultLiveLowDimension = {
  width: 320,
  height: 240
};

var inflate = P.promisify(require('zlib').inflate);

var s3Uploader, s3Remover;
if (config.s3.bucket === 'MOCKUP') {
  s3Uploader = new S3Uploader({
    Bucket: config.s3.bucket,
    MockupBucketPath: config.s3.mockupBucketPath,
    MockupServerPort: config.s3.mockupServerPort
  });
  s3Remover = new S3Remover({ Bucket: config.s3.bucket });
} else {
  s3Uploader = new S3Uploader({ Bucket: config.s3.bucket });
  s3Remover = new S3Remover({ Bucket: config.s3.bucket });
}

function uploadS3(params, callback) {
  if (!s3Uploader) {
    return callback(new Error('S3 uploader is not ready yet!'));
  }
  var shardingKey = genShardingKey();
  try {
    var fileKey = 'posts/'+params.postId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp+'/'+params.imageFilename;
    s3Uploader.send({
      File: params.image,
      Key: fileKey,
      options: {
        ACL: 'public-read'
      }
    }, function(err, data) {
      if (err) { return callback(err); }
      assert(data.hasOwnProperty('Location'), 'Unable to get location proerty from S3 response object');
      assert((data.hasOwnProperty('key') || data.hasOwnProperty('Key')), 'Unable to get key property from S3 response object');
      var s3Filename = data.key || data.Key;
      var s3Url = data.Location;
      // TODO: use real CDN download url
      var cdnFilename = data.key || data.Key;
      var cdnUrl = data.Location;
      callback(null, {
        cdnFilename: cdnFilename,
        cdnUrl: cdnUrl,
        s3Filename: s3Filename,
        s3Url: s3Url
      });
    });
  } catch (err) {
    callback(err);
  }
}
var uploadS3Async = P.promisify(uploadS3);

function processImage(params, callback) {
  async.parallel({
    webImages: function(callback) {
      tilizeImageAndUploadS3(params.image, {
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
      .resize(DefaultPanoDimensionForMobile.width, DefaultPanoDimensionForMobile.height)
      .toBuffer('JPG', function(err, buffer) {
        if (err) { return callback(err); }
        async.parallel({
          downsized: function(callback) {
            uploadS3({
              type: 'pan',
              quality: 'src',
              postId: params.postId,
              timestamp: params.timestamp,
              imageFilename: params.postId+'_low.jpg',
              image: buffer
            }, function(err, result) {
              if (err) { return callback(err); }
              callback(null, result);
            });
          },
          tiled: function(callback) {
            tilizeImageAndUploadS3(params.image, {
              type: 'pan',
              quality: 'low',
              width: DefaultPanoDimensionForMobile.width,
              height: DefaultPanoDimensionForMobile.height,
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

  function tilizeImageAndUploadS3(imgBuf, params, callback) {
    var tiles = calTileGeometries(params.width, params.height)
    async.map(tiles, function(tile, callback) {
      gm(imgBuf)
      .crop(tile.width, tile.height, tile.x, tile.y)
      .toBuffer('JPG', function(err, buffer) {
        if (err) { return callback(err); }
        uploadS3({
          type: params.type,
          quality: params.quality,
          postId: params.postId,
          timestamp: params.timestamp,
          imageFilename: params.postId + '_' + (params.projectMethod ? params.projectMethod : 'equirectangular') + '_' + tile.idx + '.jpg',
          image: buffer
        }, function(err, result) {
          if (err) { return callback(err); }
          callback(null, {
            srcUrl: result.s3Url,
            downloadUrl: result.cdnUrl
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
}

var handlePanoPhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var srcImgBuf = new Buffer(params.image.buffer, 'base64');
    var now = moment(new Date()).format('YYYY-MM-DD');
    var response = {
      postId: params.postId,
      thumbUrl: params.thumbnail.srcUrl,
      thumbDownloadUrl: params.thumbnail.downloadUrl
    };
    uploadS3Async({
      type: 'pan',
      quality: 'src',
      postId: params.postId,
      timestamp: now,
      imageFilename: params.postId + (params.image.hasZipped ? '.jpg.zip' : '.jpg'),
      image: srcImgBuf
    }).then(function(result) {
      response = merge({}, response, {
        srcUrl: result.s3Url,
        srcDownloadUrl: result.cdnUrl
      });
      if (params.image.hasZipped) {
        return inflate(srcImgBuf);
      }
      return P.resolve(srcImgBuf);
    })
    .then(function(imgBuf) {
      return new P(function(resolve, reject) {
        processImage({
          image: imgBuf,
          width: params.image.width,
          height: params.image.height,
          postId: params.postId,
          timestamp: now
        }, function(err, result) {
          if (err) { reject(err); }
          else {
            resolve(result);
          }
        });
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

var handleLivePhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var srcImgBuf = new Buffer(params.image.buffer, 'base64');
    var arrayBoundary = params.image.arrayBoundary;
    var now = moment(new Date()).format('YYYY-MM-DD');
    var response = {
      postId: params.postId,
      thumbUrl: params.thumbnail.srcUrl,
      thumbDownloadUrl: params.thumbnail.downloadUrl
    };
    uploadS3Async({
      type: 'live',
      quality: 'src',
      postId: params.postId,
      timestamp: now,
      imageFilename: params.postId + (params.image.hasZipped ? '.jpg.zip' : '.jpg'),
      image: srcImgBuf
    }).then(function(result) {
      response = merge({}, response, {
        srcUrl: result.s3Url,
        srcDownloadUrl: result.cdnUrl
      });
      if (params.image.hasZipped) {
        return inflate(srcImgBuf);
      }
      return P.resolve(srcImgBuf);
    }).then(function(imgBuf) {
      var parsedImgArr = Buffer(imgBuf, 'binary').toString('binary').split(arrayBoundary);
      return new P(function(resolve, reject) {
        var high = [], low = [];
        async.forEachOf(parsedImgArr, function(image, index, callback) {
          async.parallel({
            uploadHighToS3: function(callback) {
              uploadS3({
                type: 'live',
                quality: 'high',
                postId: params.postId,
                timestamp: now,
                imageFilename: params.postId + '_high_' + index + '.jpg',
                image: Buffer(image, 'binary')
              }, function(err, result) {
                if (err) { return callback(err); }
                high[index] = {
                  srcUrl: result.s3Url,
                  downloadUrl: result.cdnUrl
                };
                callback();
              });
            },
            uploadLowToS3: function(callback) {
              gm(Buffer(image, 'binary'))
              .resize(DefaultLiveLowDimension.width, DefaultLiveLowDimension.height)
              .toBuffer('JPG', function(err, buffer) {
                if (err) { return callback(err); }
                uploadS3({
                  type: 'live',
                  quality: 'low',
                  postId: params.postId,
                  timestamp: now,
                  imageFilename: params.postId + '_low_' + index + '.jpg',
                  image: buffer
                }, function(err, result) {
                  if (err) { return callback(err); }
                  low[index] = {
                    srcUrl: result.s3Url,
                    downloadUrl: result.cdnUrl
                  };
                  callback();
                });
              });
            }
          }, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        }, function(err) {
          if (err) { return reject(err); }
          resolve({ high: high, low: low });
        });
      });
    }).then(function(result) {
      response = merge({}, response, {
        srcHighImages: result.high,
        srcLowImages: result.low
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

var deletePostImages = function(job) {
  try {
    var params = JSON.parse(job.payload);
    if (!params.imageList || params.imageList.length === 0) {
      return job.workComplete(JSON.stringify({
        status: 'success'
      }));
    }
    if (!s3Remover) {
      return job.reportException(new Error('S3 remover is not ready yet!'));
    }

    var parsedList = params.imageList.map(function(url) {
      return urlencode.decode(url.split('/').slice(3).join('/'), 'gbk');
    });
    s3Remover.remove({
      Key: parsedList
    }, function(err) {
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
  worker.addFunction('handlePanoPhoto', handlePanoPhoto, { timeout: config.defaultTimeout });
  worker.addFunction('handleLivePhoto', handleLivePhoto, { timeout: config.defaultTimeout });
  worker.addFunction('deletePostImages', deletePostImages, { timeout: config.defaultTimeout });
}

module.exports = {
  addTo: addTo
};
