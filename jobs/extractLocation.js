// Update Location
// ===

var Photo = require('AllYourPhotosModels').photo,
    async = require('async');

module.exports = function(user, done){
  console.debug('starting location extraction for user', user);

  if (!done) throw new Error('Callback is mandatory');
  // find all their photos and sort them on interestingness
  Photo.find({'owners': user._id}, 'exif.gps')
  .exists('exif.gps.GPSLongitude')
  .exists('location', false)
  .sort({taken : - 1})
  .exec(function(err, photos){
    if (err) throw err;

    console.debug('found %d photos without normalized gps', photos.length);

    async.map(photos, function(photo, next){
      console.log('before', photo.location);
      var setter = {$set : {}};
      setter.$set.location = photo.getLocation();

      // TODO: get timezone, place names etc from google API:s
      // https://developers.google.com/maps/documentation/timezone/
      console.debug('saving location', setter.$set);
      Photo.update({_id : photo._id}, setter, {upsert: false}, function(err, nr){
        return next(err, nr);
      });
    }, function(err, nrs){
      return done(err, nrs.length);
    });
  });
};