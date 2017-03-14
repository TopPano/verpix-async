var should = require('should');
var assert = require('assert');
var fs = require('fs');
var sizeOf = require('image-size');
var imageDiff = require('image-diff');

var panophoto = require('../src/media.js');

const exec = require('child_process').exec;

describe('Panophoto:', function() {
  describe('Test mediaProcessingPanoPhoto()', function() {



  });

  describe('Unit test createShareImg():', function() {
    it('should return a img smaller than(4000X2000) with -ProjectionType="equirectangular" EXIF Tag', function (done) {
      // read source image and get the size
      var srcFileName = './spec/fixtures/panophoto/src.jpg';
      var srcImage = fs.readFileSync(srcFileName);
      var srcSize = sizeOf(srcFileName);

      // call the function for test
      panophoto.createShareImg(new Buffer(srcImage), srcSize.width, srcSize.height)
        .then((dstImgBuf) => {
          var tmpFileName = './spec/fixtures/panophoto/test_for_createShareImg.jpg';
          // save the precessed buffer to a tmp file
          fs.writeFileSync(tmpFileName, dstImgBuf);
          // check the similarity of dstImage and shared.jpg generated before
          imageDiff.getFullResult({
            actualImage: tmpFileName,
            expectedImage: './spec/fixtures/panophoto/share.jpg'
          }, 
          (err, res) => {
            if(err) {done(err);}
            assert.equal(res.percentage, 0, 'not same with share.jpg');

            // check the exif tag is existed
            exec('exiftool -ProjectionType ' + tmpFileName, (err, stdout) => {
              if(err) {done(err);}
              fs.unlink(tmpFileName);
              stdout.should.endWith('equirectangular\n');
              done();
            });
          });
        });
    });

  });
  
  describe('Unit test addExifTag():', function() {
    it('should return a img with -ProjectionType="equirectangular" EXIF Tag', function (done) {
      // read the image without exif tag "-ProjectionType="equirectangular"
      var imageData = fs.readFileSync('./spec/fixtures/panophoto/share_without_exif.jpg');
      panophoto.addExifTag(new Buffer(imageData), '-ProjectionType=equirectangular')
        .then((exifImgBuf) => {
          var tmpFileName = './spec/fixtures/panophoto/test_for_addExifTag.jpg';
          // save the precessed buffer to a tmp file
          fs.writeFileSync(tmpFileName, exifImgBuf);
          // check the exif tag is existed
          exec('exiftool -ProjectionType ' + tmpFileName, (err, stdout) => {
            if(err) {done(err);}
            fs.unlink(tmpFileName);
            stdout.should.endWith('equirectangular\n');
            done();
          });
        });
    });


  });

  describe('Test deleteMediaImages() for panophoto', function() {



  });



});

