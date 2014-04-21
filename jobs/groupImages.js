// Group Photos
// ===
// Find relevant information to group on. First off is the date.
// Use dayname, month, summer, winter, known holidays etc

var ObjectId = require('mongoose').Types.ObjectId,
    Photo = require('AllYourPhotosModels').photo,
    async = require('async'),
    mongoose = require('mongoose'),
    emit = {};



module.exports = function(done){

  if (!done) throw new Error("Callback is mandatory");

  var map = function(){

    var monthNames = [ "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December" ];
    var self = this;
      // Wed, 05 Dec 2012 20:25:10 GMT
      var datePart = new Date(self.taken).getDate(),
          yearPart = new Date(self.taken).getFullYear(),
          monthPart = monthNames[new Date(self.taken).getMonth()],
          hourPart = new Date(self.taken).getHours(),
          minutePart = new Date(self.taken).getMinutes();

      emit(yearPart + "/" + monthPart + "/" + datePart + "/" + hourPart, self._id);
      emit(yearPart + "/" + monthPart + "/" + datePart, self._id);
      emit(yearPart + "/" + monthPart, self._id);
      emit(yearPart, self._id);
      
      if (monthPart < 3 || monthPart > 10)
        emit(yearPart + "/winter", self._id);

      if (monthPart >= 3 && monthPart < 6)
        emit(yearPart + "/spring", self._id);

      if (monthPart >= 9 && monthPart < 11)
        emit(yearPart + "/autumn", self._id);

      if (monthPart >= 5 && monthPart < 9)
        emit(yearPart + "/summer", self._id);


  };

  var reduce = function(group, photos){

    return photos.sort(function(a,b){
      return b.interestingness - a.interestingness;
    })[0];

  };

  // add query to only reduce modified images
  Photo.mapReduce({map:map, reduce:reduce, out : {replace : 'groups'}, verbose:true}, function(err, model, stats){
    if (err) return done(err);

    console.debug('GroupImages', stats);

    // update all included photos with the new groups
    model.find(function(err, groups){
      async.map(groups, function(group, done){
        Photo.findOneAndUpdate({_id : group.index}, {$set : {groups : group._id.toString().split('/')}}, {safe:true}, done);
      }, done);
    });
  });


};