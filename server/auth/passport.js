var conf = require('../../conf'),
    callbackBaseUrl = conf.baseUrl,
    passport = require('passport'),
    InstagramStrategy = require('passport-instagram').Strategy,
    FlickrStrategy = require('passport-flickr').Strategy,
    TwitterStrategy = require('passport-twitter').Strategy,
    FacebookStrategy = require('passport-facebook').Strategy,
    DropboxStrategy = require('passport-dropbox').Strategy,
    LocalStrategy = require('passport-local').Strategy,
    User = require('../../models/user.js'),
    auth = require('./auth.js');


var cache = {};

  passport.serializeUser(function(user, done) {
    cache[user._id] = user;
    done(null, user._id);
  });

  passport.deserializeUser(function(id, done) {
    var cachedUser = cache[id];

    // since loading a fresh record of the user takes a while we will refresh the user record in the background for the next load
    User.findById(id, function(err, user){
      if (err || !user) return done(err, false);

      cache[user._id] = user;
      if (!cachedUser) return done(err, user);
    });

    if (cachedUser) return done(null, cachedUser);
  });
  passport.use(new LocalStrategy(User.authenticate()));

  // Use the InstagramStrategy within Passport.
  //   Strategies in Passport require a `verify` function, which accept
  //   credentials (in this case, an accessToken, refreshToken, and Instagram
  //   profile), and invoke a callback with a user object.
  passport.use(new TwitterStrategy({
      consumerKey: conf.twitter.consumerKey,
      consumerSecret: conf.twitter.consumerSecret,
      clientSecret: conf.instagram.clientSecret,
      callbackURL: callbackBaseUrl + "/auth/twitter/callback",
      passReqToCallback: true
    },
    function(req, accessToken, refreshToken, profile, done) {

      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      
      return auth.findOrCreateAndUpdateUser(req.user, profile, done);
    }
  ));

  // Use the InstagramStrategy within Passport.
  //   Strategies in Passport require a `verify` function, which accept
  //   credentials (in this case, an accessToken, refreshToken, and Instagram
  //   profile), and invoke a callback with a user object.
  passport.use(new InstagramStrategy({
      clientID: conf.instagram.clientId,
      clientSecret: conf.instagram.clientSecret,
      callbackURL: callbackBaseUrl + "/auth/instagram/callback",
      passReqToCallback: true
    },
    function(req, accessToken, refreshToken, profile, done) {

      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      
      return auth.findOrCreateAndUpdateUser(req.user, profile, done);
    }
  ));

  // Use the DropboxStrategy within Passport.
  //   Strategies in passport require a `verify` function, which accept
  //   credentials (in this case, a token, tokenSecret, and Dropbox profile), and
  //   invoke a callback with a user object.
  passport.use(new DropboxStrategy({
      consumerKey: conf.dbox.app_key,
      consumerSecret: conf.dbox.app_secret,
      callbackURL: callbackBaseUrl + "/auth/dropbox/callback",
      passReqToCallback: true
    },
    function(req, token, tokenSecret, profile, done) {

      profile.token = token;
      profile.tokenSecret = tokenSecret;

      return auth.findOrCreateAndUpdateUser(req.user, profile, done);
    }
  ));

  passport.use(new FlickrStrategy({
      consumerKey: conf.flickr.consumerKey,
      consumerSecret: conf.flickr.consumerSecret,
      callbackURL: callbackBaseUrl + "/auth/flickr/callback",
      passReqToCallback: true
    },
    function(req, token, tokenSecret, profile, done) {

      return auth.findOrCreateAndUpdateUser(req.user, profile, done);

    }
  ));

  passport.use(new FacebookStrategy({
    clientID: conf.facebook.appId,
    clientSecret: conf.facebook.appSecret,
    callbackURL: callbackBaseUrl + "/auth/facebook/callback"
  },
  function(req, accessToken, refreshToken, profile, done) {

      profile.token = accessToken;
      profile.refreshToken = refreshToken;

      return auth.findOrCreateAndUpdateUser(req.user, profile, done);

  }
));

module.exports = passport;