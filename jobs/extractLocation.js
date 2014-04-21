// Update Rank
// ===
// Based on interestingness get the most interesting photos and convert it to a normalized rank value
// which can be used to filter all photos on


var ObjectId = require('mongoose').Types.ObjectId,
    Photo = require('AllYourPhotosModels').photo,
    User = require('AllYourPhotosModels').user,
    async = require('async'),
    mongoose = require('mongoose');


module.exports = function(user, done){

  if (!done) throw new Error("Callback is mandatory");
  var affectedPhotos = 0;

  // find all their photos and sort them on interestingness
  Photo.find({'owners': user._id}, 'exif location')
  .where({$exists: 'exif'})
  .where({$not: {$exists: 'location'}})
  .exec(function(err, photos){
    if (err) throw err;

    console.debug('found %d photos without normalized gps', photos.length);

    async.map(photos, function(photo, next){
      if (!photo || !photo.copies) return next();

      var setter = {$set : {}};
      setter.$set['location'] = photo.location;

      Photo.update({_id : photo._id}, setter, {upsert: true}, function(err, nr){
        return next(err, photo)
      });
    }, function(err, photos){
      return done(err, user);
    });
  });
};