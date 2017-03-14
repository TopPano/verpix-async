var should = require('should');
var assert = require('assert');
var fs = require('fs');
var panophoto = require('../src/media.js');

const exec = require('child_process').exec;


describe('Panophoto:', function() {
  describe('Test mediaProcessingPanoPhoto()', function() {



  });

  describe('Test createShareImg()', function() {



  });
  
  describe('addExifTag():', function() {
    it('should return a img with -ProjectionType="equirectangular" EXIF Tag', function (done) {
      // read the image without exif tag "-ProjectionType="equirectangular"
      var imageData = fs.readFileSync('./spec/fixtures/panophoto/share_without_exif.jpg');
      panophoto.addExifTag(new Buffer(imageData), '-ProjectionType=equirectangular')
        .then((exifImgBuf) => {
          var tmpFileName = './spec/fixtures/panophoto/tmp.jpg';
          // save the precessed buffer to a tmp file
          fs.writeFileSync(tmpFileName, exifImgBuf);
          // check the exif tag is existed
          exec('exiftool -ProjectionType ' + tmpFileName, (err, stdout) => {
            if(err) {done(err);}
            fs.unlink(tmpFileName);
            if (stdout.indexOf('equirectangular') > -1)
            {done();}
            else {
              done(new Error('addExifTag fail'));
            }
          });
        });
    });


  });

  describe('Test deleteMediaImages() for panophoto', function() {



  });



});

