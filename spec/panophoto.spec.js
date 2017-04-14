var P = require('bluebird');
var assert = require('assert');
var fs = require('fs');
var sizeOf = require('image-size');
var imageUtil = require('./imageUtil.js');
var rewire = require('rewire');

var config = require('../config');
var ObjectStore = require('../object-store');

var panophoto = rewire('../src/panophoto.js');

var store;

describe('Panophoto: ', function() {
  
  before(function(){
    store = P.promisifyAll(new ObjectStore({
      bucket: config.store.bucket,
      mockupBucketPath: config.store.mockupBucketPath,
      mockupServerPort: config.store.mockupServerPort
    }), { suffix: 'Promised'}); 
  });

  describe('Test processPanoPhoto(): ', function() {
    it('should store the resized & tiled panophoto to path specified by config', function () {
      // prepare for input test data
      panophoto.__set__('store', store);

      var srcFileName = './spec/fixtures/panophoto/src.jpg';
      var thumbFileName = './spec/fixtures/panophoto/thumb.jpg';
      var metaFileName = './spec/fixtures/panophoto/sample.json';
      var srcImage = fs.readFileSync(srcFileName);
      var metaObj = JSON.parse(fs.readFileSync(metaFileName));
      var srcSize = sizeOf(srcFileName);
      var params = {
        type: metaObj.type, 
        mediaId: metaObj._id,
        image: {  
          width: srcSize.width,
          height: srcSize.height,
          buffer: (new Buffer(srcImage)).toString('base64'),
          hasZipped: false
        },
        thumbnail: { buffer: (new Buffer(fs.readFileSync(thumbFileName))).toString('base64') },
        shardingKey : metaObj.content.shardingKey 
      };

      // start testing
      var createPanoFunc = panophoto.__get__('createPano');
      return createPanoFunc(params)
      .then(function(result){
        // check the generated metadata is same with sample.json
        assert.deepEqual(result, metaObj.content.quality, 'generated metadata is not same with sample.json');
        return P.resolve();
      })
      .then(function(){
        // check the generated images are same with groundtruth
        // gen imagePairList for compare first
        var imagePairList = [];
        var qualities = metaObj.content.quality;
        for(var i in qualities){
          for (var j=0; j<qualities[i].tiles; j++){
            imagePairList.push([config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/'+qualities[i].size+'/'+j.toString()+'.jpg',
            './spec/fixtures/panophoto/'+qualities[i].size+'/'+j.toString()+'.jpg']);
          }
        }

        imagePairList.push([config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/share.jpg',
          './spec/fixtures/panophoto/share.jpg']);
        imagePairList.push([config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/src.jpg',
          './spec/fixtures/panophoto/src.jpg']);
        imagePairList.push([config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/thumb.jpg',
          './spec/fixtures/panophoto/thumb.jpg']);

        return P.resolve(imagePairList);
      })
      .then(function(imagePairList){
        // start comparing images in imagePairList
        return imageUtil.diff.areSamePromised(imagePairList);
      })
      .then((areSame) => {
        assert.equal(areSame, true, 'generated images are not same with groundtruth');
        // TODO: delete generated images
      })
      .catch((err) => {
        assert.ok(false, 'Error occured: ' + err);
      }); 
    }); // it
  }); // describe



  describe('Test deleteImages() for panophoto: ', function() {
    it('should delete a panophoto after it was created', function () {
      // create a panohoto first
      var srcFileName = './spec/fixtures/panophoto/src.jpg';
      var thumbFileName = './spec/fixtures/panophoto/thumb.jpg';
      var metaFileName = './spec/fixtures/panophoto/sample.json';

      var srcImage = fs.readFileSync(srcFileName);
      var metaObj = JSON.parse(fs.readFileSync(metaFileName));
      var srcSize = sizeOf(srcFileName);
      var createParams = {
        type: metaObj.type, 
        mediaId: metaObj._id,
        image: {  
          width: srcSize.width,
          height: srcSize.height,
          buffer: (new Buffer(srcImage)).toString('base64'),
          hasZipped: false
        },
        thumbnail: { buffer: (new Buffer(fs.readFileSync(thumbFileName))).toString('base64') },
        shardingKey : metaObj.content.shardingKey 
      };

      var createPanoFunc = panophoto.__get__('createPano');
      var deletePanoFunc = panophoto.__get__('deletePano');

      return createPanoFunc(createParams)
      .then(function(result){
        // check images are correctly store in mock-up?
        // dont need: it was checked by last it()
        var deleteParams = {
          media:{
            sid: metaObj._id,
            type: metaObj.type,
            content: {
              shardingKey: metaObj.content.shardingKey,
              quality: result
            }
          }
        };
        // test deleting images
        return deletePanoFunc(deleteParams);
      })
      .then(function(){
        // check image are correctly deleted
        var imgCheckList = [];
        imgCheckList.push();
        var qualities = metaObj.content.quality;
        for(var i in qualities){
          for (var j=0; j<qualities[i].tiles; j++){
            imgCheckList.push(config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/'+qualities[i].size+'/'+j.toString()+'.jpg');
          }
        }

        imgCheckList.push(config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/share.jpg');
        imgCheckList.push(config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/src.jpg');
        imgCheckList.push(config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/pano/thumb.jpg');
        
        for(var path in imgCheckList){
          assert(!fs.existsSync(imgCheckList[path]), 'image ' + imgCheckList[path] + ' should not exist after deleting');
        }
      })
      .catch((err)=>{
        assert.ok(false, 'Error occured: ' + err);
      });

    });
  });

  describe('Unit test createShareImg(): ', function() {
    it('should return a img smaller than(4000X2000) with -ProjectionType="equirectangular" EXIF Tag', function () {
      // read source image and get the size
      var srcFileName = './spec/fixtures/panophoto/src.jpg';
      var srcImage = fs.readFileSync(srcFileName);
      var srcSize = sizeOf(srcFileName);
      var tmpFileName = './spec/fixtures/panophoto/test_for_createShareImg.jpg';

      var createShareImgFunc = panophoto.__get__('createShareImg');
      // call the function for test
      return createShareImgFunc(new Buffer(srcImage), srcSize.width, srcSize.height)
      .then((dstImgBuf) => {
        // save the precessed buffer to a tmp file
        fs.writeFileSync(tmpFileName, dstImgBuf);
        // check the similarity of dstImage and shared.jpg generated before
        var imagePairList = [[tmpFileName, './spec/fixtures/panophoto/share.jpg']];
        return imageUtil.diff.areSamePromised(imagePairList);
      })
      .then((areSame) => {
        assert.equal(areSame, true, 'not same with share.jpg');

        // check the exif tag is existed
        var hasExifTag = imageUtil.exif.hasExifTagSync(tmpFileName, 'ProjectionType', 'equirectangular');
        assert(hasExifTag, 'the exif tag not exist');
        fs.unlink(tmpFileName);
      })
      .catch((err) => {
        assert.ok(false, 'Error occured: ' + err);
      });
    }); // it 
  }); // describe

  describe('Unit test addExifTag():', function() {
    it('should return a img with -ProjectionType="equirectangular" EXIF Tag', function () {
      // read the image without exif tag "-ProjectionType="equirectangular"
      var imageData = fs.readFileSync('./spec/fixtures/panophoto/share_without_exif.jpg');

      var addExifTagFunc = panophoto.__get__('addExifTag');
      return addExifTagFunc(new Buffer(imageData), '-ProjectionType=equirectangular')
      .then((exifImgBuf) => {
        var tmpFileName = './spec/fixtures/panophoto/test_for_addExifTag.jpg';
        // save the precessed buffer to a tmp file
        fs.writeFileSync(tmpFileName, exifImgBuf);
        // check the exif tag is existed
        
        var hasExifTag = imageUtil.exif.hasExifTagSync(tmpFileName, 'ProjectionType', 'equirectangular');
        assert(hasExifTag, 'the exif tag not exist');
      })
      .catch((err) => {
        assert.ok(false, 'Error occured: ' + err);
      });
    });

  });
});

