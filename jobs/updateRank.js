// Update Rank
// ===
// Based on interestingness get the most interesting photos and convert it to a normalized rank value
// which can be used to filter all photos on


var ObjectId = require('mongoose').Types.ObjectId,
    Photo = require('AllYourPhotosModels').photo,
    User = require('AllYourPhotosModels').user,
    async = require('async'),
    emit = {}, // fool jsLint
    mongoose = require('mongoose');


module.exports = function(user, done){

  if (!done) throw new Error("Callback is mandatory");
  var affectedPhotos = 0;

  // find all their photos and sort them on interestingness
  Photo.find({'owners': user._id}, 'copies.' + user._id + '.rank copies.' + user._id + '.interestingness')
  .exec(function(err, photos){
    if (err) throw err;

    photos.sort(function(a,b){
      return a.copies[user._id].interestingness - b.copies[user._id].interestingness;
    });
  
    var rank = 0;
    
    // no meaning to rank too few photos
    if (photos.length < 30) return done();

    photos = photos.map(function(photo){
      if (!photo || !photo.copies) return null;

      // closure
      var newRank = rank++;
      var mine = photo.copies[user._id];

      // No noticable different (less than 1% change)
      if (!mine || Math.round(newRank / 10) === Math.round(mine.rank / 10)){
        return null;
      }

      affectedPhotos++;
      // console.log('updating rank', photo._id, newRank / 100, mine.rank / 100);

      var setter = {$set : {}};
      setter.$set['copies.' + user._id + '.rank'] = newRank;
      setter.$set['copies.' + user._id + '.calculatedVote'] = Math.min(10, Math.round(newRank / photos.length * 15)); // 15 is to allow fewer pictures in "the best"
      setter.$set['copies.' + user._id + '.calculated'] = new Date();
      setter.$set['modified'] = new Date();

      Photo.update({_id : photo._id}, setter, {upsert: true});

      return photo._id;

    });

    return done(err, user);

  });


};