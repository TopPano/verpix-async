'use strict';
var config = require('../config');
var ObjectStore = require('../object-store');
var store;
if (config.store.bucket === 'MOCKUP') {
  store = new ObjectStore({
    bucket: config.store.bucket,
    mockupBucketPath: config.store.mockupBucketPath,
    mockupServerPort: config.store.mockupServerPort
  });
} else {
  store = new ObjectStore({ bucket: config.store.bucket });
}

var replaceUserPhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var imgBuf = new Buffer(params.image, 'base64');
    var oldPhotoKey = params.oldUrl.slice(params.oldUrl.indexOf('users'));
    var newPhotoIdx = (parseInt(params.oldUrl.split('_')[2].split('.')[0], 10) + 1) % 1024;
    store.delete(oldPhotoKey, function(err) {
      var keyArr = ['users', params.userId, 'photo', params.userId + '_profile_' + newPhotoIdx + '.jpg'];
      store.create(keyArr, imgBuf, function(err, result) {
        if (err) { return job.reportException(err); }
        job.workComplete(JSON.stringify({
          srcUrl: result.location,
          downloadUrl: result.location
        }));
      });
    });
  } catch (err) {
    job.reportException(err);
  }
};

var createUserPhoto = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var imgBuf = new Buffer(params.image, 'base64');
    var photoIdx = 1;
    var keyArr = ['users', params.userId, 'photo', params.userId + '_profile_' + photoIdx + '.jpg'];
    store.create(keyArr, imgBuf, function(err, result) {
      if (err) { return job.reportException(err); }
      job.workComplete(JSON.stringify({
        srcUrl: result.location,
        downloadUrl: result.location
      }));
    });
  } catch (err) {
    job.reportException(err);
  }
}

function addTo(worker) {
  worker.addFunction('replaceUserPhoto', replaceUserPhoto, { timeout: config.defaultTimeout });
  worker.addFunction('createUserPhoto', createUserPhoto, { timeout: config.defaultTimeout });
}

module.exports = {
  addTo: addTo
};
