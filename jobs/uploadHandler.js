var connectors = require('AllYourPhotosConnectors')();
var importer = require('./importer');
var multiparty = require('multiparty');
var Photo = require('AllYourPhotosModels').photo;
var _ = require('lodash');
var connector = new connectors.base();


/**
 * Parses and uploads the photo to S3 based on a request coming from a browser.
 * @param  {[type]}   req  [description]
 * @param  {Function} done [description]
 * @return {[type]}        [description]
 */
connector.handleRequest = function(req, done){
  var form = new multiparty.Form();
  var self = this;
  var photo = new Photo();
  var parts = 0;

  form.on('field', function (field) {
    if (field.name === 'exif')
      photo.exif = field.value;
    if (field.name === 'path')
      photo.path = field.value;
  });

  form.on('part', function (part) {
    if (!part.filename) {
      return;
    }
    // console.log('part name', part.name);
    var quality = part.name.split('|')[0];
    var taken = part.name.split('|')[1];
    part.length = part.name.split('|')[2]; // hack, should be set elsewhere?
    photo.source = 'upload';
    photo.bytes = part.length;
    photo.path = !photo.path && part.filename !== 'blob' && part.filename;
    photo.modified = new Date();
    photo.owners = [req.user._id];
    photo.store = {};
    
    parts++; // keep track on how many parts we have to handle

    if (taken){
      // convert 2012:04:01 11:12:13 to ordinary datetime
      photo.taken = new Date(taken.slice(0,10).split(':').join('-') + taken.slice(10));
    } else {
      // photo.taken = photo.modified;
    }

    // photo.bytes = file.length;
    photo.mimeType = part.mimeType || 'image/jpeg';
    self.upload(quality, photo, part, function(err, uploadedPhoto){
      if(err) return done(err);

      photo.store = _.extend(photo.store, uploadedPhoto.store);
      photo.markModified('store');
      if (uploadedPhoto.exif){
        photo.exif = uploadedPhoto.exif;
        photo.markModified('exif');
        photo.markModified('ratio');
      }

      parts--;
      // the last part is parsed
      if (parts === 0){
        importer.upsertPhoto(req.user, photo, done);
      }

    });

    /*importer.savePhotos(req.user, [photo], function(err, photos){
      console.log('save');
    });*/
  });

  form.on('error', function(err){
    return done(err);
  });
  //form.on('end', function(){done});
  //
  form.parse(req);
};

module.exports = connector;
