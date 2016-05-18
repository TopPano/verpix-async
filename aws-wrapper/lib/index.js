var S3Uploader = require('./S3Uploader');
var S3Remover = require('./S3Remover');
var signer = require('./signer');

module.exports = {
  S3Uploader: S3Uploader,
  S3Remover: S3Remover,
  signer: signer
}
