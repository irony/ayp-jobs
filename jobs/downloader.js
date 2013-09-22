// Importer
// ====
// Helper methods for downloading all photos for all active connectors

var Photo = require('AllYourPhotosModels').photo;
var PhotoCopy = require('AllYourPhotosModels').photoCopy;
var User = require('AllYourPhotosModels').user;
var connectors = require('AllYourPhotosConnectors')();
var _ = require('lodash');
var async = require('async');


var downloader = {
  
  /**
   * download both original and thumbnail of photo from photos connector
   * @param  {[type]}   user  user
   * @param  {[type]}   photo photo
   * @param  {[object]} options, {original: true, thumbnail:true}
   * @param  {Function} done  callback when both are done
   */
  downloadPhoto : function(user, barePhoto, options, done){

    if (typeof(done) !== "function") throw new Error("Callback is mandatory" + JSON.stringify(done));
    if (!options || (!options.thumbnail && !options.original)) return done('No downloader defined in options');

    User.findById(user._id, function(err, user){
      if(err) return done(err);

      Photo.findById(barePhoto._id, function(err, photo){
        if (err) return done(err);
        if (!photo) return done(new Error('Photo ' + barePhoto._id + 'not found'));

        var connector = connectors[photo.source];

        if (connector.downloadOriginal && user.accounts[photo.source]) {
          
          console.debug('Downloading %s %s from %s', options.thumbnail && "thumbnail", options.original && "and original" || "", photo.source);
          async.parallel({
            original : function(done){

              //TODO: fix the bug here
              if (options.original && (!photo.store || !photo.store.original || !photo.store.original.stored)) {
                console.debug('downloading original...');
                photo.mimeType = photo.mimeType || 'image/jpeg';
                return connector.downloadOriginal(user, photo, function(err, photo){
                  if (err) console.debug('Error original', err);
                  return done(err, photo);
                });
              } else{
                return done();
              }

            },
            thumbnail : function(done){


              if (options.thumbnail && (!photo.store || !photo.store.thumbnail || !photo.store.thumbnail.stored)) {
                console.debug('downloading thumbnail...');
                return connector.downloadThumbnail(user, photo, function(err, photo){
                  if (err) console.debug('Error thumbnail', err);
                  return done(err, photo);
                });
              } else {
                return done();
              }
            }
          }, function(err, result){
            if (err) return done(err);

            photo.markModified('store');
            if (options.save) photo.save(done);
            else done(null, photo);
          });
        }
      });
    });
  },
   

/**
   * Download all new thumbnail photos for all users
   * @param  {Callback} done
   */
  downloadMissingThumbnails : function(done){
    if (!done) throw new Error("Callback is mandatory");

    var photoQuery = Photo.find({}, 'store updated src taken source path mimeType owners')
    .where('store.thumbnail.stored').exists(false)
    .where('store.thumbnail.lastTry').exists(false)
    // .gte(new Date() - 24 * 60 * 60 * 1000) // skip photos with previous download problems
    .where('store.error').exists(false) // skip photos with previous download problems
    .sort({'taken': -1})
    .limit(10);

    var downloadAllResults = function downloadAllResults(err, photos){

      if (photos && photos.length) console.debug('Found %d photos without downloaded thumbnails. Downloading...', photos && photos.length, err);
      
      async.map(photos, function(photo, done){

        Photo.update({ _id: photo._id }, {'store.thumbnail.lastTry':new Date()});

        if (!photo.owners) return photo.remove(done);

        User.find().where('_id').in(photo.owners).exec(function(err, users){

          if (err) {
            console.log('Error thumbnail:', err);
            return done(err);
          }

          if (!users || !users.length) {
            console.debug("Didn't find any user records for any of the user ids:", photo.owners);
            return photo.remove(done);
          }
          // We don't know which user this photo belongs to so we try to download them all
          async.map(users, function(user, done){
            console.debug('Downloading thumbnail for %s for user %s ...', photo._id, user._id, err);

            // photo.store.thumbnail = null;  // force new thumbnail to be downloaded
            downloader.downloadPhoto(user, photo, {thumbnail : true}, function(err){
              console.debug('one tumbnail done');

              if (err) {
                console.debug('Download photo error: ', err);
                photo.store = photo.store || {};
                photo.store.error = {type:'Download error', details: JSON.stringify(err), action: 'skip', date: new Date()};
                photo.markModified('store');
                return photo.save(function(){
                  return done(null, photo); // we have handled the error, we don't want to abort the operation
                });
              }
              photo.modified = new Date();

              return photo.save(function(err,photo){
                return done(err,photo);
              });
            });
          }, done);
        });
      }, function(err, photos){

        // if (err) throw err;

        if (photos.length){
          console.debug('Downloaded %d thumbnails: %s', photos.length, err && err.toString().red || 'Without errors'.green);
          return done(err, _(photos).compact().value());
        }
        else{
          setTimeout(done, 10000); // wait longer before trying again if queue is empty
        }

      });
    };
    
    // first run
    photoQuery.exec(downloadAllResults);

  },

  /**
   * Dpwnload photos for all newly downloaded metadata where the photos haven't been downloaded yet
   * @param  {[type]} options {
   *                             batchSize : 10 // how many should be downloaded in each batch?
   *                             autorestart : true // should this method be automatically restarted when all photos have been downloaded?
   *                          }
   */
  downloadOriginals : function(done){
    if (!done) throw new Error("Callback is mandatory");

    var photoQuery = Photo.find({'store.lastTry' : { $exists: false }, 'store.error': {$exists : false}})
    // .or({'store.lastTry' : {$lte : new Date()-24*60*60*1000}})
    .sort({'taken': -1})
    .limit(500);

    var downloadAllResults = function downloadAllResults(err, photos){
      // console.log('[50]Found %d photos without downloaded images. Downloading...', photos.length);

      async.mapSeries(photos, function(photo, done){
        User.find().where('_id').in(photo.owners).exec(function(err, users){
          
          if (err) return done(err);

          if (!users || !users.length) {
            console.debug("Didn't find any user records for any of the user ids:", photo.owners);
            return photo.remove(done);
          }

          // We don't know which user this photo belongs to so we try to download them all
          async.map(users, function(user, done){
            downloader.downloadPhoto(user, photo,  {original: true}, function(err){
              if (err) {
                

                photo.store = photo.store || {};
                photo.store.error = {type:'Download error', details: err, action: 'skip', date: new Date()};
                console.log('Error while downloading photo and uploading to s3'.red, err);
                photo.markModified('store');
                return photo.save(function(err, photo){
                  return done(null, photo);  // We have handled the error, let's not abort the rest of the operation
                });
              }

              photo.store.lastTry = new Date();
              photo.markModified('store');
              return photo.save(function(err, photo){
                if (err) throw err;

                done(err, photo);
              });
            });
          }, done);
        });
      }, function(err, photos){
        
        if (photos.length){
          console.debug('Downloaded %d photos: %s', _.compact(photos).length, err && err.toString().red || 'Without errors'.green);
          return done(err, photos);
        }
        else{
          setTimeout(done, 10000); // wait longer before trying again if queue is empty
        }
      });
    };
    
    // first run
    photoQuery.exec(downloadAllResults);

  }

};

module.exports = downloader;