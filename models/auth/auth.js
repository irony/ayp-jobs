// User initializations
// ====
// Handles updates of user record in database
// TODO: rewrite this with upsert
//

var User = require('../models/user'),
    _ = require('lodash');

var updateProfile = function(user, profile, done){

  if (!user)
  {
    throw new Error("User must have a value");
  }

  var accounts = (user.accounts || {});
  var emails = (user.emails || []);

  accounts[profile.provider] = profile;

  user.updated = new Date();

  user.set('emails', _.uniq(_.union(emails, profile.emails)));

  user.displayName = profile.displayName;
//   user.set('emails', emails);
  user.set('accounts', accounts);
  user.markModified('accounts');

  return user.save(done);
};

var findOrCreateAndUpdateUser = function (user, profile, done)
{

  // even if we have the serialized user object, we still want to use the db user so we can save and update it correctly
  if (user && user._id){
    return User.findById(user._id, function(err, foundUser){

      if (!foundUser){
        foundUser = new User(user);
      }

      return updateProfile(foundUser, profile, done);
  
    });
  }

  // we will use many providers but still want's to connect them to the same account,
  // therefore we will search for this user according to it's id for this particular provider,
  // if no one is found we will create it. If found we will update the accounts.

  return User.findOne({ '$where' : 'this.accounts && this.accounts["' + profile.provider + '"] && this.accounts["' + profile.provider + '"].id == ' + profile.id })
     .sort({'maxRank' : -1})
     .exec(function (err, foundUser) {

      if (err){
        return done(err, null);
      }

      if (!foundUser) {
        profile.emails = (profile.emails || []).filter(function(a){
          return a && a.length > 3;
        }); // remove empty rows

        if (profile.emails.length)
        {
          // if we can find this user by his email, we will connect the accounts together instead. Security issue.
          User.findOne({emails : {$in : profile.emails}})
          .sort({'maxRank' : -1})
          .exec(function(err, emailUser){
            // console.log('found user via email', profile.emails,emailUser);
            return updateProfile(emailUser || new User(), profile, done);
          });

        } else {
          //console.log('couldnt find user and not via email', profile);
          return updateProfile(new User(), profile, done);
        }
      } else {
//        console.log('found user via provider. Updating profile...', profile);
        return updateProfile(foundUser, profile, done);
      }



  });
};


exports.findOrCreateAndUpdateUser = findOrCreateAndUpdateUser;
exports.updateProfile = updateProfile;
