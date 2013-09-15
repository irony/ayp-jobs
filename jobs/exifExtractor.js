// Extract EXIF information
// ===
// This job will use BlitLine to extract all missing EXIF information from the S3 bucket
// - - - -
// TODO:
// Make it work

var blitline = require('blitline'),
    Photo = require('AllYourPhotosModels').photo,
    callbackBaseUrl = "http://" + (process.env.HOST || "dev.allyourphotos.org:3000");

module.exports = {


  extractExifFromNewPhotos : function(autoRestart){

    var photoQuery = Photo.find()
    .where('store.original.stored').exists()
    .where('exif').exists(false)
    .sort('-taken')
    .limit(50);
    var parseAllResults = function parseAllResults(err, photos){
      // console.log('[50]Found %d photos without downloaded images. Downloading...', photos.length);

      async.map(photos, function(photo, done){
        process.stdout.write('.');
        done(null, photo); // ignore errors since we want to continue
      }, function(err, photos){
        
          var blitline = new Blitline(); // TODO: move app_id to conf
          var job = blitline.addJob("5EUcAOhUpehEGs6uXQzz_Sg", photo.store.original.url);

          //blitline.callbackUrl = callbackBaseUrl + "/"; //TODO add callback here;

          // var blur_function = job.addFunction("blur", null, "my_blurred_image");

          blitline.postJobs(function(response) {
            console.log(response);
          });

        console.log('Downloaded Exif information for %d photos', _.compact(photos).length);
  
        if(autoRestart)
          photoQuery.exec(parseAllResults);
      });
    };
    
    photoQuery.exec(parseAllResults);

  }

};