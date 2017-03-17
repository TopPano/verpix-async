var should = require('should');
var assert = require('assert');
var fs = require('fs');
var sizeOf = require('image-size');
var imageUtil = require('./imageUtil.js');

var config = require('../config');

var panophoto = require('../src/media.js');
const exec = require('child_process').exec;

describe('Panophoto:', function() {
  //describe('Test processPanoPhoto()', function() {
  //  it('should store resized & tiled panophoto path specified by config', function (done) {
  //    // prepare for input test data
  //    var srcFileName = './spec/fixtures/panophoto/src.jpg';
  //    var thumbFileName = './spec/fixtures/panophoto/thumb.jpg';
  //    var metaFileName = './spec/fixtures/panophoto/sample.json';

  //    var srcImage = fs.readFileSync(srcFileName);
  //    var metaObj = JSON.parse(fs.readFileSync(metaFileName));
  //    var srcSize = sizeOf(srcFileName);
  //    var params = {
  //      type: metaObj.type, 
  //      mediaId: metaObj._id,
  //      image: {  
  //                width: srcSize.width,
  //                height: srcSize.height,
  //                buffer: (new Buffer(srcImage)).toString('base64'),
  //                hasZipped: false
  //             },
  //      thumbnail: { buffer: (new Buffer(fs.readFileSync(thumbFileName))).toString('base64') },
  //      shardingKey : metaObj.content.shardingKey 
  //    };
  //    
  //    // start testing
  //    panophoto.processPanoPhoto(params)
  //    .then(function(result){
  //      // check the generated metadata is same with sample.json
  //      assert.deepEqual(result[1], metaObj.content.quality, 'generated metadata is not same with sample.json');

  //      // check the generated imgs are same with groundtruth
  //      
  //      console.log(params.shardingKey);
  //      done(); 
  //    });
  //  });
  //});

 // describe('Test deleteMediaImages() for panophoto', function() {
 //   it('should store resized & tiled panophoto path specified by config', function (done) {

 //   });

 // });

  describe('Unit test createShareImg():', function() {
    it('should return a img smaller than(4000X2000) with -ProjectionType="equirectangular" EXIF Tag', function (done) {
      // read source image and get the size
      var srcFileName = './spec/fixtures/panophoto/src.jpg';
      var srcImage = fs.readFileSync(srcFileName);
      var srcSize = sizeOf(srcFileName);
      var tmpFileName = './spec/fixtures/panophoto/test_for_createShareImg.jpg';

      // call the function for test
      panophoto.createShareImg(new Buffer(srcImage), srcSize.width, srcSize.height)
        .then((dstImgBuf) => {
          // save the precessed buffer to a tmp file
          fs.writeFileSync(tmpFileName, dstImgBuf);
          // check the similarity of dstImage and shared.jpg generated before
          imageUtil.diff.getFullResultPromised({
            actualImage: tmpFileName,
            expectedImage: './spec/fixtures/panophoto/share.jpg'
          })
          .then((res) => {
            assert.equal(res.percentage, 0, 'not same with share.jpg');
            // check the exif tag is existed
            var hasExifTag = imageUtil.exif.hasExifTagSync(tmpFileName, 'ProjectionType', 'equirectangular');
            assert(hasExifTag, 'the exif tag not exist');
            fs.unlink(tmpFileName);
            done();
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
});

