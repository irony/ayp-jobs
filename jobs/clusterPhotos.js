// Cluster photos with k-means
// ===

var ObjectId = require('mongoose').Types.ObjectId,

    Photo = require('AllYourPhotosModels').photo,
    PhotoCopy = require('AllYourPhotosModels').photoCopy,
    User = require('AllYourPhotosModels').user,
    Group = require('AllYourPhotosModels').group,
    async = require('async'),
    _ = require('lodash'),
    clusterfck = require('clusterfck'),
    interestingnessCalculator = PhotoCopy.interestingnessCalculator;

function Clusterer(user, done){
  var self = this;

  if (!done) throw new Error("Callback is mandatory");

  // find all their photos and sort them on interestingness
  Photo.find({'owners': user._id}, 'taken copies.' + user._id + '.calculatedVote copies.' + user._id + '.vote')
//  .where('copies.' + user._id + '.cluster').exists(false)
  // .where('copies.' + user._id + '.clusterOrder').exists(false)
  .sort({ taken : -1 })
  .exec(function(err, photos){
    if (err || !photos || !photos.length) return done(err);

    photos.forEach(function(photo){
      if (!photo.copies) photo.copies = {};
      if (!photo.copies[user._id]) photo.copies[user._id] = {};
    });

    Group.find({userId:user._id}).remove(function(){
      var groups = Clusterer.extractGroups(user, photos, 100);
      var savedPhotos = async.reduce(groups, [], function(a, group){
        var rankedGroup = Clusterer.rankGroupPhotos(group);
        rankedGroup.userId = user._id;
        Clusterer.saveGroupPhotos(rankedGroup, function(group){
          if (group) a.concat(group.photos);
          done(a);
        });
        return a;
      }, function(err, savedPhotos){
        return done(null, savedPhotos.length ? user : null);
      });
    });

  });
}

  /**
   * Take two array (or more) and weave them together into one array so that [1,2,3,4] + [1,2,3,4] => [1,1,2,2,3,3,4,4]
   * @param  {[type]} a [description]
   * @param  {[type]} b [description]
   * @return {[type]}   [description]
   */
  Clusterer.weave = function(a,b){
    var arrays = Array.prototype.slice.call(arguments.length === 1 ? arguments[0] : arguments);
    var maxLength = Math.max.apply(Math, arrays.map(function (el) { return el.length }));

    if (isNaN(maxLength)) return arrays[0].length && arrays[0] || arrays; // no need to weave one single array

    var result = [];
    for(var i=0; i<maxLength; i++){
      _.each(arrays, function(array){
          if(array[i]) result.push(array[i]);
      });
    }
    return result;
  };


Clusterer.extractGroups = function(user, photos, nrClusters){

  console.debug('clustering ' + photos.length + ' photos to ' + nrClusters + ' clusters');
  if (!photos.length) return [];

  var vectors = photos.map(function(photo){
    
    var vector = [photo.taken.getTime()]; // this is where the magic happens

    var mine = photo.copies && photo.copies[user._id] || photo;

    vector._id = photo._id;
    vector.oldCluster = mine.cluster;
    vector.taken = photo.taken;
    vector.vote = mine.vote;
    vector.clicks = mine.clicks;
    vector.interestingness = interestingnessCalculator(mine) || Math.floor(Math.random()*100);
    return vector;
  });

  var clusters = vectors && clusterfck.kmeans(vectors.filter(function(a){return a}), nrClusters) || [];
  var groups = clusters.map(function(cluster){
    var group = new Group();
    group.userId = user._id;
    group.photos = _.compact(cluster);
    return group;
  });
  
  groups = _.compact(groups);

  console.debug('done, ' + groups.length + ' clusters created');

  return groups;
};

Clusterer.rankGroupPhotos = function(group, nrClusters){
    //var subClusters = utils.cluster(group.photos, nrClusters);
    var subClusters = clusterfck.kmeans(group.photos, nrClusters);
    
    subClusters
      .sort(function(a,b){
        return b.length - a.length; // sort the arrays bigger first, more value toeacho we get the smallest clusters first - less risk of double shots from the same cluster
      })
      .map(function(subCluster, subGroup){

        subCluster.sort(function(a,b){
          return b.interestingness - a.interestingness;
        }).map(function(photo, i){
          photo.oldCluster = photo.cluster;
          photo.cluster=group._id + "." + subGroup + "." + i;
          photo.boost = Math.floor(subCluster.length * 5 / (1+i*2)); // first photos of big clusters get boost
          photo.interestingness = Math.floor(photo.boost + Math.max(0, 100 - (i/subCluster.length) * 100));
          // photo.interestingness = Math.floor(photo.boost + (photo.interestingness || 0));
          // || Math.floor(Math.random()*100)); // ) + photo.boost;
          return photo;
        });
        
        //subCluster.forEach(function(photo){console.log(photo.cluster, photo.taken, photo._id)})
        return subCluster;

      });
      // console.debug('..done');
    group.photos = Clusterer.weave(subClusters);
    return group;
};

Clusterer.saveGroupPhotos = function(group, done){
  var i = 1;

  if (!group.userId) throw new Error("UserId is not set on group");
  async.map(group.photos, function(photo, next) {
    if (photo.oldCluster && photo.cluster === photo.oldCluster) {
      return null;
    }

    var setter = {$set : {}};
    //var clusterRank = 100 - (i / group.photos.length) * 100;

    setter.$set['copies.' + group.userId + '.clusterOrder'] = i;
    setter.$set['copies.' + group.userId + '.interestingness'] = photo.interestingness;
    // + clusterRank + (photo.interestingness); // || Math.floor(Math.random()*100)); // ) + photo.boost;
    setter.$set['copies.' + group.userId + '.cluster'] = photo.cluster;
    setter.$set['modified'] = new Date();
    i++;

    Photo.update({_id : photo._id}, setter, {upsert: true}, function(err,nr){
      next(err,photo);
    });
  }, function(err, photos){

    group.photos = _.compact(group.photos).sort();
    group.from = group.photos[0];
    group.to = group.photos[group.photos.length-1];
    group.save(function(){
      done(photos.length && group || null);
    });
  });


};

module.exports = Clusterer;