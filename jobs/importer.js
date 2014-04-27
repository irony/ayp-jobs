// Importer
// ====
// Helper methods for importing metadata for all active connectors

var Photo = require('AllYourPhotosModels').photo;
var PhotoCopy = require('AllYourPhotosModels').photoCopy;
var User = require('AllYourPhotosModels').user;
var connectors = require('AllYourPhotosConnectors')();
var _ = require('lodash');
var async = require('async');


var importer = {

  /**
   * Tries to find a photo in the database and return a reference to it or initializes the given photo record with the appropriate values
   * @param  {[type]}   user  [description]
   * @param  {[type]}   photo [description]
   * @param  {Function} done  [description]
   * @return {[type]}         [description]
   */
  
  findOrInitPhoto : function(user, photo, done){
    Photo.find({'taken' : photo.taken}, function(err, photos){
      var dbPhoto = photos.filter(function(existingPhoto){
        // We found a set of photos at the exact same time but before assuming
        // it is the same we want to do some checks to find our own
        var found = _.some(existingPhoto.owners, function(item){return item === user._id}) ||
        existingPhoto.path === photo.path || // or same filename
        photo.bytes > 100000 && existingPhoto.bytes === photo.bytes; // or same file size

        return found;
      }).pop();

      if (!photo.taken) photo.taken = photo.modified;
      // console.debug('found %s', dbPhoto ? "one photo" : "no photos", err);

      if (err) {
        console.log('Error finding photo', err);
        return done(err);
      }

      if (!dbPhoto){
        if (photo._id) {
          dbPhoto = photo;
        } else{
          dbPhoto = new Photo(photo);
        }
      }

      dbPhoto.set('owners', _.uniq(_.union([user._id], dbPhoto.owners)));

      if (!dbPhoto.copies) dbPhoto.copies = {};

      var photoCopy = dbPhoto.copies[user._id];

      if (!photoCopy)
        dbPhoto.copies[user._id] = photoCopy = new PhotoCopy();

      photoCopy.interestingness = photoCopy.interestingness || Math.random() * 100; // dummy value now. TODO: change to real one
      dbPhoto.markModified('copies');
      // dbPhoto.metadata = _.extend(dbPhoto.metadata || {}, photo);

      if (photo.store){
        dbPhoto.store = _.extend(dbPhoto.store || {}, photo.store);
        dbPhoto.markModified('store');
      }

      if (photo.exif){
        dbPhoto.exif = _.extend(dbPhoto.exif || {}, photo.exif);
        dbPhoto.markModified('exif');
      }

      dbPhoto.taken = photo.taken;

      if (photo.ratio)
        dbPhoto.ratio = photo.ratio;

      dbPhoto.mimeType = photo.mimeType;
      dbPhoto.bytes = dbPhoto.bytes || photo.bytes;

      return done(null, dbPhoto);
    });

  },

  /**
   * Save an array of photos fetched elsewhere to the database
   * @param  {[type]} user     a mongoose user model
   * @param  {[type]} photos   array of photos
   * @param  {[type]} progress callback which will be called after save of whole collection with (err, photos)
   */
  savePhotos : function(user, photos, done){
    console.debug('Saving %d photos', photos.length);

    async.mapLimit(photos, 20, function(photo, next){

      console.debug('Saving photo %s', photo.path, photo.client_mtime, photo.taken, photo.bytes);
      var _user = user;

      importer.findOrInitPhoto(_user, photo, function(err, photo){

        photo.save(function(err, photo){
          next(err, photo);
        });
      });

    }, done);
  },

  waitForMoreFromUser : function(user, done){
    User.findById(user._id, function(err, user){
      importer.getAllImportConnectorsForUser(user, function(err, connectorNames){
        connectorNames.forEach(function(connectorName){
          importer.waitForMoreFromConnector(user, connectorName, done);
        });
      });
    });
  },

  /**
   * Wait for changes in a particular connector for a user. If the connector isn't supporting 
   * realtime changes it will immediately return false and let a scheduler take care of scheduling
   * fetching of new changes instead.
   * @param  {[type]}   user          plain user object
   * @param  {[type]}   connectorName name of connector, for example: 'dropbox'
   * @param  {Function} done          callback which will receive three arguments: err, changed and connectorName
   * @return {[type]}                 [description]
   */
  waitForMoreFromConnector : function(user, connectorName, done){
    User.findById(user._id, function(err, user){
      var connector = connectors[connectorName];
      if (connector.wait){
        console.debug('Waiting for new photos at %s for %s', connectorName, user._id);
        connector.wait(user, function(err, changed){
          console.debug('Found change at %s', connectorName, changed, err);
          done(err, changed, connectorName);
        });
      } else {
        // returns true here to signal the scheduler to manually fetch new photos..
        console.debug('No wait feature for ' + connectorName + ' returning...');
        return done(null, false, connectorName);
      }
    });
  },
  
  /**
   * Downloads and saves metadata for all connectors of the provided user
   * @param  {[type]}   user user
   * @param  {Function} done callback when done
   */
  importPhotosFromConnector : function(user, connectorName, options, done){
    User.findById(user._id, function(err, user){
      if (err || !user) return done(err);

      console.debug('Importing photos from ' + user.displayName);
     
      var connector = connectors[connectorName];
        
      if (!connector || !connector.importNewPhotos)
        return done(new Error('No import connector found with name ' + connectorName));

      connector.importNewPhotos(user, options, function(err, photos){
        if (err) console.debug('import err: ', err);
        else console.debug('import done, found: ' + (photos && photos.length || 0) + ', next: ' + photos.next);
        
        if (err) return done(err);
        if (!photos || !photos.length) return done();
        var next = photos.next;

        if (err) return done(err);
        done(null, photos, next);

      });

    });
  },

  getAllImportConnectorsForUser : function(user, done){
    User.findById(user._id, function(err, user){
      if (err) return done(err);
      if (user.accounts){
        var importConnectors = _.map(user.accounts, function(account, connectorName){
          var connector = connectors[connectorName];
          if (connector && connector.importNewPhotos) {
            return connectorName;
          } else{
            return null;
          }
        });
        return done(null, importConnectors.filter(function(connector){
          return connector;
        }));
      }
      return done(null, []);
    });
  },

  importAllNewPhotos : function(done){
    if (!done) throw new Error("Callback is mandatory");
    User.find().where('accounts.dropbox').exists().exec(function(err, users){
      
      if (err || !users.length) done(err);

      async.mapSeries(users, function(user, done){
        importer.importPhotosFromAllConnectors(user, done);
      }, function(err, results){
        done(err, _(results).flatten().compact().value());
      });
    });
  },

};

module.exports = importer;