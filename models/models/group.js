// Group
// =====
// Not used anymore?

var mongoose = require('mongoose'),
    Photo = require('./photo')(mongoose).Schema,
    _ = require('lodash'),
    Schema = mongoose.Schema;

var GroupSchema = new mongoose.Schema({
      value : { type: {}},
      user : {type: Schema.Types.ObjectId},
      photos : { type: {}}
    });


GroupSchema.virtual('from').get(function () {
  return _(this.photos).sortBy('taken').first().value();
});


GroupSchema.virtual('to').get(function () {
  return _(this.photos).sortBy('taken').last().value();
});


module.exports = mongoose.model('Group', GroupSchema);