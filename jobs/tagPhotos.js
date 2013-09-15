var ObjectId = require('mongoose').Types.ObjectId,
    Photo = require('AllYourPhotosModels').photo,
    async = require('async'),
    mongoose = require('mongoose'),
    emit = {};



module.exports = function(done){

  if (!done) throw new Error("Callback is mandatory");
  
  var map = function(){

    var parts = (this.path || '').split('/');
    parts.pop(); // remove filename
    parts.splice(1,1); // remove /photos or main catalog, it's not that interesting
    if (parts.length)
    {
      var self = this;
        parts.forEach(function(tag){
          if (tag.trim()){
            self.owners.map(function(user){
              emit({photoId : self._id, userId : user}, tag.trim().split('_').join(' '));
            });

          }
        });
    }
  };

  var reduce = function(key, tags){

    return tags.join(',');

  };

  // add query to only reduce modified images
  Photo.mapReduce({map:map, reduce:reduce, out : {replace : 'tags'}, verbose:true}, function(err, model, stats){
  
    // console.debug('tagPhotos', stats);

    if (err) throw err;

    model.find(function(err, photos){
      async.forEach(photos, function(photo, done){
        var photoSet = {copies : {}};
        var key = photo._id;

        var setter = {$set : {}};
        setter.$set['copies.' + key.userId + '.tags'] = photo.value.split(',');
        return Photo.findOneAndUpdate({_id : key.photoId}, setter, {upsert: true, safe:true}, done);
      }, function(err, updated){
        if (done) return done(err, updated);
      });

    });
  });


};