// Importer
// ====
// Helper methods for importing metadata for all active connectors

var Photo = require('ayp-models').photo;
var PhotoCopy = require('ayp-models').photoCopy;
var User = require('ayp-models').user;
var connectors = require('ayp-connectors')();
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
  
  upsertPhoto : function(user, photo, done){
    if (!photo.taken || !photo.bytes) return done('Taken and bytes are required');
    
    Photo.findOne({'taken' : photo.taken})
    .or([
      {'path' : photo.path},
      {$and: [{bytes : photo.bytes}, {bytes : {$gte : photo.bytes}}]},
      {owners: user._id}
    ])
    .sort({'bytes' : -1})
    .exec(function(err, dbPhoto){
      if (err) return done(err);

      if (!dbPhoto){
        delete photo._id;
        dbPhoto = new Photo(photo);
      }

      dbPhoto.taken = photo.taken || photo.modified;
      (photo.owners || [user._id]).forEach(function(owner){
        if (dbPhoto.owners.indexOf(owner) < 0) dbPhoto.owners.push(owner);
      })

      if (!dbPhoto.copies) dbPhoto.copies = {};

      var photoCopy = new PhotoCopy();
      delete photoCopy._id; // prevent mongoose version lookup info

      dbPhoto.set('copies.' + user._id, dbPhoto.copies[user._id] || photoCopy);
      dbPhoto.set('store', _.extend(dbPhoto.store || {}, photo.store || {}));
      dbPhoto.set('exif', _.extend(dbPhoto.exif || {}, photo.exif || {}));
      dbPhoto.ratio = photo.ratio || dbPhoto.ratio;
      dbPhoto.mimeType = photo.mimeType;
      dbPhoto.bytes = dbPhoto.bytes || photo.bytes;
      
      dbPhoto.save(function(err){
        if (err) console.error('Error when saving photo', err, dbPhoto);
        return done(err, dbPhoto);
      })
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

    async.mapLimit(photos, 10, function(photo, next){

      console.debug('Saving photo %s', photo.path, photo.client_mtime, photo.taken, photo.bytes);
      var _user = user;

      importer.upsertPhoto(_user, photo, next);

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
      if (!user) return done(new Error('User not found', err));
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
    console.debug('Looking up user...');
    User.findById(user._id, function(err, user){
      if (err || !user) return done(err || 'no user');

      console.debug('Importing photos from ' + user.displayName);
     
      var connector = connectors[connectorName];
        
      if (!connector || !connector.importNewPhotos)
        return done(new Error('No import connector found with name ' + connectorName));

      connector.importNewPhotos(user, options, function(err, photos){
        if (err) console.debug('import err: ', err);
        else console.debug('import done, found: ' + (photos && photos.length || 0) + ', next: ' + (photos && photos.next || ''));
        done(err, photos || [], photos && photos.next);
      });

    });
  },

  getAllImportConnectorsForUser : function(user, done){
    User.findById(user._id, function(err, user){
      if (err || !user) return done(err);
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