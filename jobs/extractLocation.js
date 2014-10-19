// Update Location
// ===

var Photo = require('AllYourPhotosModels').photo,
    Place = require('AllYourPhotosModels').place,
    async = require('async');

module.exports = function(user, photos, done){
  console.debug('starting location extraction for user', user);

  if (!done) throw new Error('Callback is mandatory');
  // find all their photos and sort them on interestingness

  if (!photos || !photos.length) return done();

  console.debug('found %d photos without normalized gps', photos.length);

  async.mapSeries(photos || [], function(dbPhoto, next){
    Photo.findById(dbPhoto._id, function(err, photo){
      var setter = {$set : {}};
      var location = setter.$set.location = photo.getLocation();
      if (!location) return done();

      console.error('looking up %s %s', location.lng, location.lat);

      new Place().lookup(location.lng, location.lat, function(err, place){
        if (err) return next(err);
        location.place = place;

        console.error('place found', place);
        // TODO: get timezone, place names etc from geonames API:s
        // http://api.geonames.org/timezoneJSON?lat=47.01&lng=10.2&username=demo
        // or:
        // https://developers.google.com/maps/documentation/timezone/
        // console.debug('saving location', setter.$set);
        Photo.update({_id : photo._id}, setter, {upsert: true}, function(err, nr){
          console.error('saved', photo._id);
          return next(err, nr);
        });
      });
    });
  }, function(err, nrs){
    if (err) console.log('location error', err);
    return done(err, nrs.reduce(function(a,b){return a+b}));
  });
};