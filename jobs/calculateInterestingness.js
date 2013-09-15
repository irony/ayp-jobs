// Calculate Interestingness
// ===
// A job to calculate interestingness for all photos by all users

var ObjectId = require('mongoose').Types.ObjectId,
    Photo = require('AllYourPhotosModels').photo,
    async = require('async'),
    emit = {}; // fool jsLint



module.exports = function(done){
  if (!done) throw new Error("Callback is mandatory");

  // Emit each relevant source of information
  var map = function(){

    var self = this;

    for(var user in self.copies){
      if (user && self.copies && self.copies[user]){

        var group = user + "/" + self._id;
        var mine = self.copies[user];

        //if (!mine.interesting || mine.interesting === 50) emit(group, Math.floor(Math.random()*100));

        // if(self.tags && self.tags.length) emit(group, 50 + (self.tags.length));

        if(mine.hidden) emit(group, 0);

        if(mine.starred) emit(group, 500);

        if(mine.views) emit(group, 100 + mine.views * 5);
        if(mine.clusterOrder) emit(group, Math.min(0, 100-mine.clusterOrder));
        

        //if(self.exif && self.exif.) emit(group, 100 + 5);

        
        if(mine.clicks) emit(group, 100 + mine.clicks * 10);

        // if(mine.groups && mine.groups.length) emit(group, 100 + mine.groups.length * 10);

      }
    }

  };

  // Calculate a sum per photo
  var reduce = function(group, actions){

    var returnValue = 0;
    var count = 0;
    actions.forEach(function(action){
      if (action.value) {
        returnValue += action.value;
        count++;
      }
    });

    return parseFloat(returnValue / count);
  };


  var lastRun = new Date() - 24 * 60 * 60 * 1000;

  // Start the map / reduce job
  // - - -
  // TODO: add query to only reduce modified images
  Photo.mapReduce({map:map, query: {modified : {$gte : lastRun}}, reduce:reduce, out : {replace : 'interestingness'}, verbose: true}, function(err, model, stats){

    if (err) return done && done(err);

    // console.log(stats);

    // Query the results
    model.find(function(err, photos){
      if (err || !photos || !photos.length) return done(err, photos);

        console.log(photos.slice(0,10))

      async.map(photos, function(photo, done){
        var userId = photo._id.split('/')[0];
        var photoId = photo._id.split('/')[1];

        var setter = {$set : {}};
        var interestingness = photo.value; // >= 100 ? photo.value : Math.floor(Math.random()*100);
        
        setter.$set['copies.' + userId + '.interestingness'] = interestingness;
        setter.$set['copies.' + userId + '.calculated'] = new Date();

        Photo.update({_id : photoId}, setter, function(err, photo){
          if (err) console.log('err, setter ', err,setter);
          return done(err);
        });

      }, done);

    });
  });
};