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
<<<<<<< Updated upstream
  Photo.find({'owners': user._id}, 'taken copies.' + user._id + ' store')
=======
  Photo.find({'owners': user._id}, 'taken copies.' + user._id)
>>>>>>> Stashed changes
//  .where('copies.' + user._id + '.cluster').exists(false)
  // .where('copies.' + user._id + '.clusterOrder').exists(false)
  .sort({ taken : -1 })
  .exec(function(err, photos){
    if (err || !photos || !photos.length) return done(err);

    photos.forEach(function(photo){
      if (!photo.copies) photo.copies = {};
      if (!photo.copies[user._id]) photo.copies[user._id] = {};
    });

    var groups = Clusterer.extractGroups(user, photos, 100);
<<<<<<< Updated upstream

    var rankedGroups = groups.reduce(function(a, group){
      var rankedGroup = Clusterer.rankGroupPhotos(group);
      rankedGroup.userId = user._id;
      //console.log('group', rankedGroup.photos);
      if (rankedGroup) a.push(rankedGroup);
      return a;

    }, []);

    done(null, rankedGroups);
=======
    groups.map(function(group){
      var rankedGroup = Clusterer.rankGroupPhotos(group);
      rankedGroup.userId = user._id;
      return rankedGroup;
    });
>>>>>>> Stashed changes

    return done(null, groups);

  });
}

<<<<<<< Updated upstream

=======
>>>>>>> Stashed changes
/**
 * Take two array (or more) and weave them together into one array so that [1,2,3,4] + [1,2,3,4] => [1,1,2,2,3,3,4,4]
 * @param  {[type]} a [description]
 * @param  {[type]} b [description]
 * @return {[type]}   [description]
 */
Clusterer.weave = function(a,b){
  var arrays = Array.prototype.slice.call(arguments.length === 1 ? arguments[0] : arguments);
  var maxLength = Math.max.apply(Math, arrays.map(function (el) { return el.length; }));

  if (isNaN(maxLength)) return arrays[0].length && arrays[0] || arrays; // no need to weave one single array

  var result = [];
  for(var i=0; i<maxLength; i++){
    var position = i;
    _.each(arrays, function(array){
        if(array[position]) result.push(array[position]);
    });
  }
  return result;
}


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
    
    subClusters = subClusters
      .sort(function(a,b){
        return b.length - a.length; // sort the arrays bigger first, more value toeacho we get the smallest clusters first - less risk of double shots from the same cluster
      })
      .map(function(subCluster, subGroup){

        subCluster = subCluster.sort(function(a,b){
          return b.interestingness - a.interestingness;
        }).map(function(vector, i){
          var photo = {taken : vector[0]};
          photo.oldCluster = vector.cluster;
          photo.cluster=group._id + "." + subGroup + "." + i;
          photo.boost = Math.floor(subCluster.length * 5 / (1+i*2)); // first photos of big clusters get boost
          photo.interestingness = Math.floor(photo.boost + Math.max(0, 100 - (i/subCluster.length) * 100));
          // photo.interestingness = Math.floor(photo.boost + (photo.interestingness || 0));
          // || Math.floor(Math.random()*100)); // ) + photo.boost;
          return photo;
        });
        // subCluster.forEach(function(photo){console.log(photo.cluster, photo.taken, photo._id)})
        return subCluster;

      });
      // console.debug('..done');
    console.log(subClusters[0]);
    group.photos = _.flatten(Clusterer.weave(subClusters));
    console.log(group.photos[0]);
    return group;
};

Clusterer.findOldGroup = function(group, done){
  var oldGroups = group.photos.reduce(function(a,b){
    if (b.oldCluster) {
      var groupId = b.oldCluster.split('.')[0];
      a[groupId] = (a[groupId] || 0) + 1;
    }
    return a;
  }, {});

  var oldGroup = Object.keys(oldGroups).sort(function(a, b){
    return oldGroups[a] - oldGroups[b];
  }).pop();

  if (!oldGroup) return done();

  Group.findOne({_id : oldGroup}, done);
}

Clusterer.saveGroupPhotos = function(group, done){

  if (!group.userId) throw new Error("UserId is not set on group");
<<<<<<< Updated upstream
  async.map(group.photos, function(photo, next) {
=======
  
  var i = 1;
  
  Clusterer.findOldGroup(group, function(err, oldGroup){
>>>>>>> Stashed changes

    async.mapLimit(group.photos, 10, function(photo, next) {

      var setter = {$set : {}};
      //var clusterRank = 100 - (i / group.photos.length) * 100;

<<<<<<< Updated upstream
    Photo.update({_id : photo._id}, setter, function(err,nr){
      next(err,photo);
    });
  }, function(err, photos){
    group.photos = _.pluck(group.photos, 'taken');
    var orderedPhotos = group.photos.sort();
    group.from = orderedPhotos[0];
    group.to = orderedPhotos[orderedPhotos.length-1];
    group.save(function(){
      console.log('saved group:', group._id);
      done(photos.length && group || null);
    });
  });
=======
      setter.$set['copies.' + group.userId + '.clusterOrder'] = i;
      setter.$set['copies.' + group.userId + '.interestingness'] = photo.interestingness;
      // + clusterRank + (photo.interestingness); // || Math.floor(Math.random()*100)); // ) + photo.boost;
      setter.$set['copies.' + group.userId + '.cluster'] = photo.cluster;
      setter.$set['modified'] = new Date();
      i++;
>>>>>>> Stashed changes

      Photo.update({_id : photo._id}, setter, function(err,nr){
        if (err) throw err;
        next(err,photo);
      });
    }, function(err, photos){

      group.photos = _.compact(group.photos).sort();
      group.from = group.photos[0].taken;
      group.to = group.photos[group.photos.length-1].taken;

      Group.findOneAndUpdate({ _id: oldGroup && oldGroup._id}, group, {upsert:true}, function(err, updatedGroup){
        console.log('saved group:', group.from, group.to, updatedGroup &&  updatedGroup._id);
        done(err, photos.length && group || null);
      });

    });

  });
};

module.exports = Clusterer;