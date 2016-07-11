'use strict';
var config = require('../config');

var FB = require('fb');
var fb = new FB.Facebook({
  version: config.facebook.version,
  appId: config.facebook.appId
});

var linkUrlBase = config.shareLinkBase;

var facebook = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var accessToken = params.accessToken;
    var postId = params.postId;
    fb.setAccessToken(accessToken);
    fb.api('/me/feed/', 'POST', { link: linkUrlBase + '@' + postId }, function(res) {
      if (!res || res.error) {
        return job.reportException(!res ? 'Error occurred' : JSON.stringify(res.error));
      }
      job.workComplete(JSON.stringify({
        status: 'success'
      }));
    });
  } catch (err) {
    return job.reportException(err);
  }
}

function addTo(worker) {
  worker.addFunction('facebook', facebook, { timeout: config.defaultTimeout });
}

module.exports = {
  addTo: addTo
};
