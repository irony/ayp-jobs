// Share Span
// ==========
// A share span is a timeframe that connects all included members. All photos added within this timeframe
// from any users will be copied to all members.
// - - -
// TODO: Add a one-way option or active-flag per member


var mongoose = require('mongoose'),
    User = require('./user')(mongoose).Schema,
    Photo = require('./photo'),
    Schema = mongoose.Schema;

var ShareSpanSchema = new mongoose.Schema({
  added : { type: Date, default: Date.now()},
  startDate: {type : Date},
  stopDate: {type : Date},
  photos : [Schema.Types.ObjectId],
  members : [Schema.Types.ObjectId]
});



ShareSpanSchema.pre('save', function (next) {
  
  var span = this,
    _ = require('lodash'),
    Photo = require('./photo');


  Photo.find()
  .where('owners').in(span.members)
  .where('photos').nin(span.photos)
  .where('taken').gte(span.startDate).lte(span.stopDate)
  .exec(function(err, photos){
//     console.log('sharespan save');
    (photos || []).forEach(function(photo){
      photo.set('owners', _.uniq(_.union(photo.owners, span.members)));
      photo.save();
    });
    next();
  });
});

module.exports = mongoose.model('ShareSpan', ShareSpanSchema);