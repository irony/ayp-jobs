// run tests locally or with test collection
var nconf = require('nconf');
nconf.overrides({
  mongoUrl : 'mongodb://localhost/ayp-test'
});

nconf
  .env() // both use environment and file
  .file({file: 'config.json', dir:'../../', search: true});


var should = require("should");
var async = require('async');
var request = require('supertest');
var fs = require('fs');
var _ = require('lodash');

// Models
var Models = require('AllYourPhotosModels').init();
var ShareSpan = Models.sharespan;
var User = Models.user;
var Photo = Models.photo;
var Group = Models.group;
var auth = Models.auth;
var ObjectId = require('mongoose').Types.ObjectId;

var port = 3333;
process.env.PORT = port;
var host = 'http://0.0.0.0:' + port;
var app; // inits in integration tests

// app.listen(port);

// disgard debug output
 console.debug = function(){};
describe("jobs", function(){

  var photos = require("./fixtures/photos").photos;
  var userA = new User();

  before(function(){
    photos.map(function(photo){
      photo.copies = {};
      photo.taken = new Date(photo.taken);
      photo.owners = [userA];
    });
  });

  describe("clusterer", function(){
    var clusterer = require("../").clusterPhotos;
    it("should extract photo groups", function(done){
      var groups = clusterer.extractGroups(userA, photos, 10);

      should.ok(groups);
      groups.length.should.be.below(11);
      groups.length.should.be.above(0);
      groups = groups.sort(function(a,b){return b.photos.length - a.photos.length});
      var lengths = groups.map(function(group){return group.photos.length});
      // lengths.should.eql([ 30, 18, 14, 10, 10, 6, 5, 4, 2, 1 ]);
      should.ok(groups[0].photos.length > groups.slice(-1).pop().photos.length);
      return done();

    });


    it("should rank each group", function(done){

      var format = function(groups){
        return _(groups).flatten().pluck('value').compact().sortBy().value();
      };

      var groups = clusterer.extractGroups(userA, photos, 10);
      groups.should.not.eql([]);
      var original = format(groups);
      original.should.not.eql([]);
      var rankedGroups = groups.map(clusterer.rankGroupPhotos);

      var extracted = format(rankedGroups);
      extracted.should.eql(original); // same content, no id added, no id duplicated
      extracted.reduce(function(a,b){a.should.not.eql(b); return b});

      //rankedGroups.sort(function(a,b){return b.photos[0].clicks - a.photos[0].clicks});
      //rankedGroups[0].photos[0].clicks.should.eql(10);

      rankedGroups.sort(function(a,b){return b.photos.length - a.photos.length});
      should.ok(rankedGroups[0].photos[0].cluster);
      rankedGroups[0].photos[2].boost.should.be.below(rankedGroups[0].photos[0].boost);
      rankedGroups[1].photos[2].boost.should.be.below(rankedGroups[0].photos[0].boost);
      rankedGroups[2].photos[2].boost.should.be.below(rankedGroups[0].photos[0].boost);
      rankedGroups[3].photos[2].boost.should.be.below(rankedGroups[0].photos[0].boost);
      rankedGroups[0].photos.slice(-1)[0].boost.should.be.below(10);

      return done();

    });


    it("should extract photo groups from 10 000 photos", function(done){
      while(photos.length< 10000){
        photos = photos.concat(JSON.parse(JSON.stringify(photos)));
      }

      this.timeout(20000);

      photos.forEach(function(photo, length, i){
        photo._id = new ObjectId();
        photo.taken = new Date(new Date(photo.taken).getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 25));
      });

      var groups = clusterer.extractGroups(userA, photos, Math.sqrt(photos.length / 2));
      should.ok(groups);
      // groups.length.should.be.above(photos.length / 60);
      groups.length.should.be.below(photos.length / 100);

      return done();

    });

     it("should extract photo groups and subgroups from 10 000 photos", function(done){

      this.timeout(2000);

      photos.forEach(function(photo, i){
        photo._id = new ObjectId();
        photo.taken = new Date(new Date(photo.taken).getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 25));
      });

     

      var groups = clusterer.extractGroups(userA, photos, Math.sqrt(photos.length / 2));
      should.ok(groups);
      // groups.length.should.be.above(photos.length / 60);
      
      var rankedGroups = groups.map(function(group){
        //group.photos.length.should.be.below(200);
        return clusterer.rankGroupPhotos(group, 10).photos;
      });

      rankedGroups.length.should.be.below(photos.length / 100);
      rankedGroups.length.should.be.above(10);

      return done();

    });

    it("should extract cluster and interestingness from empty photos", function(done){


      var emptyPhotos = photos.map(function(photo, i){
        var emptyPhoto = {};
        emptyPhoto._id = new ObjectId();
        emptyPhoto.taken = new Date(new Date(photo.taken).getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 25));
        return emptyPhoto;
      });

     

      var groups = clusterer.extractGroups(userA, emptyPhotos, Math.sqrt(photos.length / 2));
      should.ok(groups);
      // groups.length.should.be.above(photos.length / 60);
      
      var rankedGroups = groups.map(function(group){
        //group.photos.length.should.be.below(200);
        return clusterer.rankGroupPhotos(group, 10).photos;
      });

      rankedGroups.length.should.be.below(photos.length / 100);
      rankedGroups.length.should.be.above(10);

      return done();

    });

    it("should save a group", function(done){

      this.timeout(5000);

      // check for duplicates
      photos.sort(function(a,b){return a._id - b._id}).reduce(function(a,b){a._id.should.not.eql(b._id); return b});
      photos.sort(function(a,b){return a.taken - b.taken}).reduce(function(a,b){a.taken.should.not.eql(b.taken); return b});

      var groups = clusterer.extractGroups(userA, photos, 100).sort(function(a,b){return b.length - a.length});
      var total = groups[0].photos.length;
      total.should.be.above(5);
      groups.length.should.be.above(5);

      var group = clusterer.rankGroupPhotos(groups[0], 5);
      group.photos.length.should.eql(total);


      var setters = {};

      clusterer.findOldGroup = function(group, done){
        console.log('save')
        group.save = function(done) {done()};
        done(group);
      };

      Photo.update = function(key, setter, done){
        should.ok(!setters[key._id], key._id + ' already exists');
        setters[key._id] = setter;
        done();
      };

      group.photos.reduce(function(a,b){
        should.ok(a._id);
        a._id.should.not.eql(b._id); 
        return b
      });

      clusterer.saveGroupPhotos(group, function(err, group){
        if (err) throw err;
        should.ok(group);
        group.photos.length.should.eql(total);
        setters.should.not.eql({});

        async.map(group.photos, function(photoId, done){
          var setter = setters[photoId];
          should.ok(setter, "couldnt find " + photoId);
          //setter.should.eql(group.user);
          should.ok(setter['$set']);
          should.ok(setter['$set']['copies.' + group.userId + '.cluster']);
          done();
        }, function(){
          done();
        });
      });

    });

  });

});