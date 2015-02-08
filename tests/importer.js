var nconf = require('nconf');
nconf.defaults(require('./test.json'));
nconf.env();
var should = require('should');

// Models
var Models = require('ayp-models').init(nconf);
var importer = require('../').importer;

var User = Models.user;
var Photo = Models.photo;

console.debug = console.log;

describe('importer', function() {
  it('should not add duplicate users to a photo', function(done){
    var userA = new User();
    var now = new Date();
    var photoA = new Photo({taken: now, bytes: 3333333, owners: [userA]})
    photoA.save(function(){
      var photoB = new Photo({taken: now, bytes: 3333333, owners: [userA]})
      importer.upsertPhoto(userA, photoB, function(err, savedPhoto){
        should.not.exist(err);
        savedPhoto.owners.should.have.length(1);
        savedPhoto._id.should.eql(photoA._id);
        done();
      });
    });
  });

  it('should import new properties to an existing photo', function(done) {

    var taken = new Date();
    var size = Math.floor(Math.random() * 30000);
    var userA = new User();

    var photoA = new Photo({
      taken: taken,
      bytes: size,
      ratio: 1.5,
      owners: [userA]
    });

    photoA.save(function(err) {

      should.not.exist(err, 'error when saving photoA', err);

      var photoB = new Photo({
        taken: taken,
        bytes: size,
        store: {
          thumbnail: {
            url: 'test'
          }
        }
      });

      importer.upsertPhoto(userA, photoB, function(err, photo) {
        should.not.exist(err, 'error when initing photo', err);

        photo.taken.toString().should.equal(photoA.taken.toString());

        photo.should.have.property('store');
        photo.should.have.property('ratio');
        photo.should.have.property('src');
        photo.store.should.have.property('thumbnail');
        photo.store.thumbnail.should.have.property('url');
        photo.src.should.equal(photo.store.thumbnail.url);
        // TODO: check thhat owners are not changed
        done();
      });
    });
  });


  it('should be possible to add a photo which already exists and resulting in two owners of the existing photo.', function(done) {

    var userA = new User();
    var userB = new User();

    var taken = new Date();
    var size = Math.floor(Math.random() * 30000);

    userA.save(function(err, userA) {
      should.not.exist(err, 'Error when saving user A', err);
      userB.save(function(err, userB) {

        should.not.exist(err, 'Error when saving user B', err);

        var photoA = new Photo({
          taken: taken,
          bytes: size,
          owners: [userA] // only one user
        });

        photoA.save(function(err, photo) {

          should.not.exist(err, 'error when saving photoA', err);

          photo.owners.should.include(userA._id, 'UserA does not exist', err);

          var photoB = new Photo({
            taken: taken,
            bytes: size,
            owners: [userB] // only one user
          });

          importer.upsertPhoto(userB, photoB, function(err, photoB) {

            photoB.taken.should.equal(taken);

            should.not.exist(err);

            should.not.exist(err, 'error when saving photoB');
            photoB.owners.should.include(userA._id, 'UserA does not exist before saving');
            photoB.owners.should.include(userB._id, 'UserB does not exist before saving');

            // since we already have a photo with this taken date we will add users to it
            Photo.findOne({
              _id: photoA._id
            }, function(err, photo) {
              photo.owners.should.include(userA._id, 'UserA does not exist');
              photo.owners.should.include(userB._id, 'UserB does not exist');
              should.not.exist(err);
              should.exist(photo);
              done();
            });
          });
        });
      });
    });
  });
});