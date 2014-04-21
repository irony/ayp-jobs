// Cluster photos with k-means
// ===


var Photo = require('AllYourPhotosModels').photo,
    PhotoCopy = require('AllYourPhotosModels').photoCopy,
    Group = require('AllYourPhotosModels').group,
    async = require('async');

function ChangeAnalyzer(user, done) {

  async.parallel({
    photo: function(next){
      Photo.findOne({ owners:user._id }, 'modified')
      .sort({modified:-1})
      .exec(next);
    },
    group: function(next){
      Group.findOne({ userId:user._id }, 'modified')
      .sort({modified:-1})
      .exec(next);
    },
  }, function(err, result){
    if (err) throw err;
    if (result.photo.modified > result.group.modified){
      // We have to do something
      done(null, true);
    } else {
      done();
    }
  });
  
}

module.exports = ChangeAnalyzer;