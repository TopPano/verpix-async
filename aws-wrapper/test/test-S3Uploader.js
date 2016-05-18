var S3Uploader = require('../lib/S3Uploader');
var fs = require('fs');

var uploader = new S3Uploader();
// Test for File as string
var params0 = {
  File: 'Path to your first uploaded file', /* Required */
  Bucket: 'Your first destination bucket name', /* Required */
  Key: 'Your first destination object key', /* Requred */
  options: {
    ACL: 'public-read',
    ContentType: 'image/jpeg',
    StorageClass: 'STANDARD'
  }
};
// Test for File as Buffer
var params1 = {
  File: new Buffer(0), /* Required */
  Bucket: 'Your second destination bucket name', /* Required */
  Key: 'Your second destination object key', /* Requred */
  options: {
    ACL: 'public-read',
    ContentType: 'image/jpeg',
    StorageClass: 'STANDARD'
  }
};

uploader.on('success', function(data) {
  console.log('Success uploading: ', data);
}).on('error', function(err) {
  console.log('Erro occuring while uploading: ', err);
}).on('progress', function(progress) {
  var loaded = progress.loaded,
      total = progress.total;
  console.log('Uploading progress: ' + (loaded / total * 100) + '%, ' + loaded + '/' + total + ' bytes');
});

uploader.send(params0);

var buf = [];
var readStream = fs.createReadStream('Path to your second uploaded file');
readStream.on('data', function(chunk) {
  buf.push(chunk);
}).on('end', function() {
  params1['File'] = Buffer.concat(buf);
  uploader.send(params1);
});

