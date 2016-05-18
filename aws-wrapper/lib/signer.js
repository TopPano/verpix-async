var crypto = require('crypto');
var fs = require('fs');
var URL = require('url');
var querystring = require('querystring');

/**
 * Generate a signed Url for a distribution object.
 */
function genSignedUrl(params) {
  var expires = Math.round((new Date().getTime() + params.life) / 1000);
  var url = URL.resolve(params.distributionUrl, params.key);
  var policy = _genCustomPolicy(url, expires);
  var signature = _genSignature(policy, params.privateKeyFilePath);
  var signedUrl;

  policy = _getUrlSafeString(new Buffer(policy).toString('base64'));
  signedUrl = _genFullUrl(url, {
    'Policy': policy,
    'Signature': signature,
    'Key-Pair-Id': params.keypairId
  });

  return signedUrl;
}

/**
 * Generate signed Urls for a group of distribution objects
 * which have common pattern in their key names.
 */
function genMultiSignedUrls(params) {
  var expires = Math.round((new Date().getTime() + params.life) / 1000);
  var wildcardUrl = URL.resolve(params.distributionUrl, '*' + params.commonPattern + '*');
  var policy = _genCustomPolicy(wildcardUrl, expires);
  var signature = _genSignature(policy, params.privateKeyFilePath);
  var signedUrls = [];

  policy = _getUrlSafeString(new Buffer(policy).toString('base64'));
  params.keys.forEach(function(key) {
    var url = URL.resolve(params.distributionUrl, key);
    var signedUrl = _genFullUrl(url, {
      'Policy': policy,
      'Signature': signature,
      'Key-Pair-Id': params.keypairId
    });
    signedUrls.push(signedUrl);
  });

  return signedUrls;
}

/**
 * Generate a custom policy.
 */
function _genCustomPolicy(url, expires) {
  var policy = {
    'Statement': [{
      'Resource': url,
      'Condition': {
        'DateLessThan': { 'AWS:EpochTime': expires }
      }
    }]
  };

  return JSON.stringify(policy);
}

/**
 * Generate a signature of the policy.
 */
function _genSignature(policy, pkFilePath) {
  var privateKey = fs.readFileSync(pkFilePath).toString('ascii');
  var signer = crypto.createSign('RSA-SHA1');

  signer.update(policy);
  signature = signer.sign(privateKey, 'base64');
  return _getUrlSafeString(signature);
}

/**
 * Replace base64-encoded characters that are invalid
 * in a URL query string with characters that are valid.
 */
function _getUrlSafeString(str) {
  return str.replace(/\+/g, '-')
            .replace(/\=/g, '_')
            .replace(/\//g, '~');
}

/**
 * Genearte a full urls that contains base Url and query strings
 */
function _genFullUrl(baseUrl, queries) {
  return URL.resolve(baseUrl, '?')
            .concat(querystring.stringify(queries));
}

