// Find users where an import is due
// ====

var User = require('ayp-models').user;
var _ = require('lodash');
var async = require('async');

module.exports= function(done){
  if (!done) throw new Error("Callback is mandatory");
  User.find()
  .select('displayName')
  // TODO: add more filters here - we don't need to query all every time
  // for example - if someone haven't been online for a month..
  .where('accounts').exists()
  .exec(function(err, users){
    console.debug('found ' + users.length);
    return done(err, users);
  });
};