var async  = require("async");
var passport = require('passport');
var Photo = require('AllYourPhotosModels').photo;
var User = require('AllYourPhotosModels').user;
var Connectors = require('AllYourPhotosConnectors');
var _ = require('lodash');
var ObjectId = require('mongoose').Types.ObjectId;
var fs = require('fs');
var config = require('../../conf');


module.exports = function (app) {

  var self = this;

  /*
    Set up all routes to the connectors
  */

  _.each(Connectors.connectors, function(connector){
    connector = connector(config);
    app.get('/auth/' + connector.name, passport.authenticate(connector.name, {scope : connector.scope}));
    app.get('/auth/' + connector.name + '/callback', passport.authenticate(connector.name, { failureRedirect: '/' }),
      function(req, res) {
        // connector.connect();
        res.redirect('/me/wall');
      });
  });

  app.get('/img/thumbnails/:connector/:id', function(req,res){
    var id = req.params.id,
        connector = require('../connectors/' + req.params.connector);

    Photo.findById(id, function(err, photo){

      if ( err || !photo ) {
        console.log('error when serving thumbnail', id, req.user._id, err, photo);
        return res.send(403, err);
      }

      console.log('Downloading thumbnail', req.params);

      connector.downloadThumbnail(req.user, photo, function(err, thumbnail){
        if (err) {
        console.error('Error downloading thumbnail', err);

          return res.send(404, new Error(err));
        }

        return res.end(thumbnail);
      });

    });
  });

  app.get('/img/originals/:connector/:id', function(req,res){
    var id = req.params.id,
        connector = require('../connectors/' + req.params.connector);

    console.log('Downloading original', id);

    Photo.findOne({'_id': id, 'owners':req.user._id}, function(err, photo){

      if ( err || !photo ) return res.send(403, err);

      if (photo.store && photo.store.original && photo.store.original.url)
        return res.redirect(photo.store.original.url);

      connector.downloadOriginal(req.user, photo, function(err, original){
        if (err || !original) {
          return res.send(404, new Error(err));
        }

        else return res.end(original);

      });

    });
  });

};
