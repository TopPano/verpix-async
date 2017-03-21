var P = require('bluebird');
var assert = require('assert');
var fs = require('fs');
var sizeOf = require('image-size');
var imageUtil = require('./imageUtil.js');

var config = require('../config');

var livephoto = require('../src/media.js');

describe('Livephoto manipulating', function() {
  describe('Test processLivePhoto()', function() {
    it.only('should store resized & deframed images which path are specified by config', function () {
      // prepare for input test data
      var srcFileName = './spec/fixtures/livephoto/src.jpg';
      var thumbFileName = './spec/fixtures/livephoto/thumb.jpg';
      var metaFileName = './spec/fixtures/livephoto/sample.json';

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
          hasZipped: false,
          imgArrBoundary: metaObj.content.imgArrBoundary
        },
        thumbnail: { buffer: (new Buffer(fs.readFileSync(thumbFileName))).toString('base64') },
        shardingKey : metaObj.content.shardingKey 
      };

      // start testing
      return livephoto.processLivePhoto(params)
      .then((result) => {
        // check the generated metadata is same with sample.json
        assert.deepEqual(result, {quality:metaObj.content.quality, count: metaObj.content.count}, 'generated metadata is not same with sample.json');
        // check the generated images are same with groundtruth
        // gen imagePairList for compare first
        var imagePairList = [];
        var qualities = metaObj.content.quality;
        for(var i in qualities){
          for (var j=0; j<metaObj.content.count; j++){
            imagePairList.push([config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/live/'+qualities[i]+'/'+j.toString()+'.jpg',
            './spec/fixtures/livephoto/'+qualities[i]+'/'+j.toString()+'.jpg']);
          }
        }
        imagePairList.push([config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/live/src.jpg',
          './spec/fixtures/livephoto/src.jpg']);
        imagePairList.push([config.store.mockupBucketPath+'/'+metaObj.content.shardingKey+'/media/'+metaObj._id+'/live/thumb.jpg',
          './spec/fixtures/livephoto/thumb.jpg']);
        // start comparing images in imagePairList
        return imageUtil.diff.areSamePromised(imagePairList);
      })
      .then((areSame) => {
        assert.equal(areSame, true, 'generated images are not same with groundtruth');
        // TODO: delete generated images
      })
      .catch((err) => {
        if(err){
          assert.ok(false, err);
        }
        else{
          assert.ok(false, 'something wrong');
        }
      });


    }); // it
  }); // describe


  describe('Test convertImgsToVideo()', function() {



  });

  describe('Test deleteMediaImages() for livephoto', function() {



  });


});

