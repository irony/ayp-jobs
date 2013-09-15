// Photo Copy
// ==========
// A copy of a photo for another user. Even for the owner of a photo they still have a PhotoCopy.

var mongoose = require('mongoose'),
    _ = require('lodash'),
    Schema = mongoose.Schema;


var PhotoCopy = new mongoose.Schema({
      user : {type: Schema.Types.ObjectId},
      interestingness : {type: Number, default: null},
      views : { type: Number, default: 0},
      clicks : { type: Number, default: 0},
      hidden : { type: Boolean, default: false},
      vote : { type: Number, default: null},
      //calculatedVote : { type: Number, default: 5},
      tags : { type: []},
      groups : { type: []},
      clusterOrder : { type: Number},
      top : { type: Number, default: null},
      rank : { type: Number, default: 50},
      cluster : {type : Number}
    });


PhotoCopy.virtual('calculatedInterestingness').get(function () {
  return PhotoCopy.statics.interestingnessCalculator(this);
});


PhotoCopy.statics.interestingnessCalculator = function(){
  var mine = this;
  var count = 0;
  var total = 0;
  var group = {}; // dummy
  
  // to be compatible with mapReduce jobs we use the same syntax here
  var emit = function(dummy, value){
    count++;
    total += value;
  };

  if(mine.views) emit(group, 100 + mine.views * 5);
  // if(mine.clusterOrder) emit(group, Math.min(0, 100-mine.clusterOrder));

  if(mine.clicks) emit(group, 100 + mine.clicks * 10);
  if(mine.hidden) emit(group, 0);
  // if(mine.vote) emit(group, 1000 - vote * 100);

  if (count === 0)
    return mine.interestingness;

  return total / count;

};

module.exports = mongoose.models['PhotoCopy'] || mongoose.model('PhotoCopy', PhotoCopy);
