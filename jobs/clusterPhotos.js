// Cluster photos with k-means
// ===


var Photo = require('AllYourPhotosModels').photo,
    PhotoCopy = require('AllYourPhotosModels').photoCopy,
    ObjectId = require('mongoose').Types.ObjectId,
    Group = require('AllYourPhotosModels').group,
    async = require('async'),
    _ = require('lodash'),
    clusterfck = require('clusterfck'),
    interestingnessCalculator = PhotoCopy.interestingnessCalculator;

function Clusterer(user, done) {
  if (!done) throw new Error('Callback is mandatory');

  // find all their photos and sort them on interestingness
  Photo.find({'owners': user._id}, 'taken copies.' + user._id + ' store')
//  .where('copies.' + user._id + '.cluster').exists(false)
  // .where('copies.' + user._id + '.clusterOrder').exists(false)
  .sort({ taken : -1 })
  .exec(function (err, photos) {
    if (err || !photos || !photos.length) return done(err);

    photos.forEach(function (photo) {
      if (!photo.copies) photo.copies = {};
      if (!photo.copies[user._id]) photo.copies[user._id] = {};
    });

    var groups = Clusterer.extractGroups(user, photos, 100);

    var rankedGroups = groups.reduce(function (a, group) {
      var rankedGroup = Clusterer.rankGroupPhotos(group);
      rankedGroup.userId = user._id;
      //console.log('group', rankedGroup.photos);
      if (rankedGroup) a.push(rankedGroup);
      return a;

    }, []);

    // TODO: remove this line
    Group.remove({userId : user._id}, function(){
      done(null, rankedGroups);
    });

  });
}


/**
 * Take two array (or more) and weave them together into one array so that [1,2,3,4] + [1,2,3,4] => [1,1,2,2,3,3,4,4]
 * @param  {[type]} a [description]
 * @param  {[type]} b [description]
 * @return {[type]}   [description]
 */
Clusterer.weave = function () {
  var arrays = Array.prototype.slice.call(arguments.length === 1 ? arguments[0] : arguments);
  var maxLength = Math.max.apply(Math, arrays.map(function (el) { return el.length; }));

  if (isNaN(maxLength)) return arrays[0].length && arrays[0] || arrays; // no need to weave one single array

  var result = [];
  for (var i = 0; i < maxLength; i++) {
    var position = i;
    _.each(arrays, function (array) {
      if (array[position]) result.push(array[position]);
    });
  }
  return result;
};


Clusterer.extractGroups = function (user, photos, nrClusters) {

  console.debug('clustering ' + photos.length + ' photos to ' + nrClusters + ' clusters');
  if (!photos.length) return [];

  var vectors = photos.map(function (photo) {
    
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

  var clusters = vectors && clusterfck.kmeans(vectors.filter(function (a) {return a}), nrClusters) || [];
  var groups = clusters.map(function (cluster,i) {
    var group = {};
    group.value = i;
    group.userId = user._id;
    group.photos = _.compact(cluster);
    group.date = group.photos[0];
    return group;
  }).sort(function(a,b){return a.date - b.date; });
  
  groups = _.compact(groups);

  console.debug('done, ' + groups.length + ' clusters created');

  return groups;
};

Clusterer.rankGroupPhotos = function (group, nrClusters) {
  //var subClusters = utils.cluster(group.photos, nrClusters);
  var subClusters = clusterfck.kmeans(group.photos, nrClusters);
  
  subClusters = subClusters
    .sort(function (a, b) {
      return b.length - a.length; // sort the arrays bigger first, more value toeacho we get the smallest clusters first - less risk of double shots from the same cluster
    })
    .map(function (subCluster, subGroup) {

      subCluster = subCluster.sort(function (a,b) {
        return b.interestingness - a.interestingness;
      }).map(function (vector, i) {
        var photo = {taken : vector[0]};
        photo.oldCluster = vector.cluster;
        photo._id = vector._id;
        photo.cluster=group.value + '.' + subGroup + '.' + i;
        photo.boost = Math.floor(subCluster.length * 5 / (1+i*2)); // first photos of big clusters get boost
        photo.interestingness = Math.floor(photo.boost + Math.max(0, 100 - (i/subCluster.length) * 100));
        // photo.interestingness = Math.floor(photo.boost + (photo.interestingness || 0));
        // || Math.floor(Math.random()*100)); // ) + photo.boost;
        return photo;
      });
      // subCluster.forEach(function (photo) {console.log(photo.cluster, photo.taken, photo._id)})
      return subCluster;

    });
    // console.debug('..done');
  group.photos = Clusterer.weave(subClusters);
  return group;
};

/*
        old:
           ----         ------
        new:
        ----  ---  -  ---  - --  --
        ---------------------------

        old.from > group.from && old.from < group.to
        old.to > group.from && old.to < group.to
        old.from < group.from && old.to > group.to
*/
Clusterer.removeOldGroups = function (group, done) {
  if (!group.from || !group.to) return done();
  Group.find({
    userId: group.userId,
    // and?
    $or: [
      {from: {$gte : group.from, $lte: group.to}},
      {to: {$gte : group.from, $lte: group.to}},
      {from: {$lte: group.from}, to: { $gte : group.to}}
    ]
  })
  .remove(done);
};


Clusterer.saveGroupPhotos = function (group, done) {
  var taken = _.pluck(group.photos, 'taken').sort();
  group.from = taken[0];
  group.to = taken[taken.length-1];

  Clusterer.removeOldGroups(group, function (err) {
    if (err) throw err;

    var newGroup = new Group();
    newGroup.value = group.value;
    newGroup.userId = group.userId;

    // TODO: serialize old and new to check for changes

    if (!group.userId) throw new Error('UserId is not set on group');
    if (!group.photos.length) throw new Error('Group photos is empty');

    var i = 0;
    var now = new Date();
    
    async.map(group.photos, function (photo, next) {

      var setter = {$set : {}};
      photo.order = i;
      setter.$set['copies.' + group.userId + '.clusterOrder'] = i;
      setter.$set['copies.' + group.userId + '.interestingness'] = photo.interestingness;
      // + clusterRank + (photo.interestingness); // || Math.floor(Math.random()*100)); // ) + photo.boost;
      setter.$set['copies.' + group.userId + '.cluster'] = photo.cluster;
      setter.$set.modified = now;
      i++;

      if (photo.oldCluster === photo.cluster) return next(null, photo);

      Photo.update({_id : photo._id}, setter, next);
    }, function (err) {
      
      if (err) throw err;

      group.photos.sort(function (a,b) {
        return a.order - b.order;
      });
      newGroup.photos = _.pluck(group.photos, '_id').map(function(id){return id.toString();});
      
      newGroup.modified = now;

      newGroup.save(function (err) {
        if (err) throw err;
        done(null, newGroup);
      });
    });
  });
};

module.exports = Clusterer;