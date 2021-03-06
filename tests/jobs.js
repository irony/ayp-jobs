// run tests locally or with test collection
var nconf = require('nconf');
nconf.defaults(require('./test.json'));
nconf.env('__');

var should = require('should');
var async = require('async');
var _ = require('lodash');

// Models
var Models = require('ayp-models').init();
var User = Models.user;
var Photo = Models.photo;
var Cluster = Models.cluster;
var ObjectId = require('mongoose').Types.ObjectId;

var port = 3333;
process.env.PORT = port;

// app.listen(port);

// disgard debug output
console.debug = function(){};
describe('jobs', function(){

  var photos = require('./fixtures/photos').photos;
  var userA;

  beforeEach(function(){
    userA = new User();
    photos = require('./fixtures/photos').photos;
    while(photos.length < 1000){
      photos = photos.concat(JSON.parse(JSON.stringify(photos)));
    }
    photos.map(function(photo){
      photo._id = new ObjectId();
      photo.taken = new Date(new Date(photo.taken).getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 25));
      photo.copies = {};
      photo.owners = [userA];
    });

  });

  describe('clusterer', function(){
    var clusterer = require('../').clusterPhotos;
    it('should extract photo groups', function(done){
      clusterer.extractGroups(userA, photos, 10, function(err, groups){

        should.ok(groups);
        groups.length.should.be.below(11);
        groups.length.should.be.above(0);
        groups = groups.sort(function(a,b){return b.photos.length - a.photos.length});
        var lengths = groups.map(function(group){return group.photos.length});
        //lengths.should.eql([ 235, 222, 200, 197, 172, 147, 146, 134, 121, 26 ]);
        should.ok(groups[0].photos.length > groups.slice(-1).pop().photos.length);
        return done();
      });

    });


    it('should rank each group', function(done){

      var format = function(groups){
        return _(groups).flatten().pluck('index').compact().sortBy().value();
      };

      clusterer.extractGroups(userA, photos, 10, function(err, groups){
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
        rankedGroups[0].photos[5].boost.should.be.below(rankedGroups[0].photos[0].boost);
        rankedGroups[1].photos[5].boost.should.be.below(rankedGroups[0].photos[0].boost);
        rankedGroups[2].photos[5].boost.should.be.below(rankedGroups[0].photos[0].boost);
        rankedGroups[3].photos[5].boost.should.be.below(rankedGroups[0].photos[0].boost);
        rankedGroups[0].photos.slice(-1)[0].boost.should.be.below(10);

        return done();
      });

    });


    it('should extract photo groups from 1000 photos', function(done){

      this.timeout(20000);

      clusterer.extractGroups(userA, photos, 30, function(err, groups){
        should.ok(groups);
        groups.length.should.be.above(25);
        groups.length.should.be.below(35);

        return done();
      });
    });

    it('should extract photo groups and subgroups from 1000 photos', function(done){

      this.timeout(2000);

      photos.forEach(function(photo, i){
        photo._id = new ObjectId();
        photo.taken = new Date(new Date(photo.taken).getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 25));
      });

     

      clusterer.extractGroups(userA, photos, 30, function(err, groups){
        should.ok(groups);
        // groups.length.should.be.above(photos.length / 60);
        
        var rankedGroups = groups.map(function(group){
          //group.photos.length.should.be.below(200);
          return clusterer.rankGroupPhotos(group, 10).photos;
        });

        rankedGroups.length.should.be.below(31);
        rankedGroups.length.should.be.above(25);

        return done();
      });

    });

    it('should extract cluster and interestingness from empty photos', function(done){


      var emptyPhotos = photos.map(function(photo, i){
        var emptyPhoto = {};
        emptyPhoto._id = new ObjectId();
        emptyPhoto.taken = new Date(new Date(photo.taken).getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 25));
        return emptyPhoto;
      });

      clusterer.extractGroups(userA, emptyPhotos, 30, function(err, groups){
        should.ok(groups);
        // groups.length.should.be.above(photos.length / 60);
        
        var rankedGroups = groups.map(function(group){
          //group.photos.length.should.be.below(200);
          return clusterer.rankGroupPhotos(group, 10).photos;
        });

        rankedGroups.length.should.be.below(31);
        rankedGroups.length.should.be.above(25);

        return done();
      });

    });

    it('should save a group', function(done){

      this.timeout(5000);

      // check for duplicates
      photos.sort(function(a,b){ return a._id - b._id; }).reduce(function(a,b){a._id.should.not.eql(b._id); return b});
      photos.sort(function(a,b){ return a.taken - b.taken; }).reduce(function(a,b){a.taken.should.not.eql(b.taken); return b});

      clusterer.extractGroups(userA, photos, 100, function(err, groups){
        groups.sort(function(a,b){return b.length - a.length});
        groups.length.should.be.above(5);
        var group = groups[0];
        var rankedGroup = clusterer.rankGroupPhotos(group, 5);
        rankedGroup.photos.length.should.eql(group.photos.length);


        var setters = {};

        Photo.update = function(key, setter, done){
          should.ok(!setters[key._id], key._id + ' already exists');
          setters[key._id] = setter;
          done();
        };

        group.photos.reduce(function(a,b){
          should.ok(a._id);
          a._id.should.not.eql(b._id);
          return b;
        });

        clusterer.saveGroupPhotos(group, function(err, group){
          if (err) throw err;
          should.ok(group);
          setters.should.not.eql({});

          async.map(group.photos, function(photoId, done){
            var setter = setters[photoId];
            should.ok(setter, 'couldnt find ' + photoId);
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
    
    describe('additions', function(){
      var groups;
      var newPhoto;
      beforeEach(function(done){
        clusterer.extractGroups(userA, photos, 30, function(err, _groups){
          if (err) throw err;
          groups = _groups;
          newPhoto = _.clone(groups[3].photos[0]);
          newPhoto.taken = groups[3].photos[0].taken+1000;
          done();
        });
      });

      it('should save clusters to cluster collection', function(done){
        Cluster.findOne({userId: userA._id}, function(err, cluster){
          should.ok(cluster);
          cluster.centroids.length.should.be.above(0);
          done();
        });
      });

      it('should be able to classify new photos to existing groups', function(done){
        this.timeout(300);
        clusterer.classify(userA, [newPhoto], function(err, affectedGroups){
          if (err) throw err;
          affectedGroups.length.should.eql(1);
          var affectedGroup = affectedGroups[0];
          affectedGroup.photos.slice(-1)[0].taken.should.eql(newPhoto.taken);
          //group.index.should.eql(3);
          //groups[group.index].photos.length.should.eql(group.photos.length-1);
          done();
        });
      });

      it('should be able to move photos between groups', function(done){
        this.timeout(300);
        newPhoto.taken = 0;
        clusterer.classify(userA, [newPhoto], function(err, affectedGroups){
          if (err) throw err;
          affectedGroups.length.should.eql(1);
          var affectedGroup = affectedGroups[0];
          affectedGroup.photos.slice(-1)[0].taken.should.eql(newPhoto.taken);
          affectedGroup.index.should.eql(0);
          affectedGroup.index.should.not.eql(3);
          //groups[group.index].photos.length.should.eql(group.photos.length-1);
          done();
        });
      });

      it('should be able to classify many photos to existing groups', function(done){
        this.timeout(300);
        clusterer.classify(userA, photos, function(err, affectedGroups){
          if (err) throw err;
          affectedGroups.length.should.eql(30);
          done();
        });
      });

      it('should be able to rank a modified group', function(done){
        this.timeout(300);
        clusterer.classify(userA, [newPhoto], function(err, affectedGroups){
          var group = affectedGroups[0];
          var ranked = clusterer.rankGroupPhotos(group, 10);
          should.ok(ranked);
          ranked.photos.map(function(photo){
            photo.cluster.split('.').length.should.be.above(2);
          });
          var found = ranked.photos.some(function(photo){
            return new Date(photo.taken).getTime() === new Date(newPhoto.taken).getTime();
          });
          return found.should.be.true && done();
        });
      });

      it('should be able to identify modified photos', function(done){
        this.timeout(300);
        clusterer.classify(userA, [newPhoto], function(err, affectedGroups){
          var group = affectedGroups[0];
          var ranked = clusterer.rankGroupPhotos(group, 10);
          should.ok(ranked);
          ranked.photos.slice(-1)[0].should.not.eql(newPhoto);
          var changed = ranked.photos.reduce(function(a, photo){
            a = a + photo.cluster !== photo.oldCluster ? 1 : 0;
            return a;
          }, 0);
          changed.should.eql(1);
          done();
        });
      });
    });
  });

});
