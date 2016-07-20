'use strict';
var config = require('../config');

var FB = require('fb');
var fb = new FB.Facebook({
  version: config.facebook.version,
  appId: config.facebook.appId
});
var Twitter = require('twitter');

var linkUrlBase = config.shareLinkBase;

var facebook = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var accessToken = params.accessToken;
    var postId = params.postId;
    fb.setAccessToken(accessToken);
    fb.api('/me/feed/', 'POST', { link: linkUrlBase + postId }, function(res) {
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

var twitter = function(job) {
  try {
    var params = JSON.parse(job.payload);
    var accessTokenKey = params.accessToken.split(';')[0];
    var accessTokenSecret = params.accessToken.split(';')[1];
    var postId = params.postId;
    var twitter = new Twitter({
      consumer_key: config.twitter.consumerKey,
      consumer_secret: config.twitter.consumerSecret,
      access_token_key: accessTokenKey,
      access_token_secret: accessTokenSecret
    });
    twitter.post('statuses/update', { status: linkUrlBase + postId }, function(err) {
      if (err) { return job.reportException(JSON.stringify(err)); }
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
  worker.addFunction('twitter', twitter, { timeout: config.defaultTimeout });
}

module.exports = {
  addTo: addTo
};
