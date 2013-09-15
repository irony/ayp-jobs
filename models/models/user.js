
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var passportLocalMongoose = require('passport-local-mongoose');



// if (mongoose.models.User) return module.exports = mongoose.models.User;

var AccountSchema = new mongoose.Schema({
	displayName : {type: String},
	// TODO etc
});

var UserSchema = new mongoose.Schema({
  id  :  { type: Schema.ObjectId},
  displayName : { type: String},
  username : { type: String},
  password : { type: String},
  emails : { type: []},
  accounts : {type :  Schema.Types.Mixed},
  subscription : {type: Number, default:0 },
  maxRank : {type : Number},
  updated : {type: Date}
});


UserSchema.plugin(passportLocalMongoose);

module.exports = mongoose.models['User'] || mongoose.model('User', UserSchema);
