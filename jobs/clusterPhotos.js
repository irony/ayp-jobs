// Cluster photos with k-means
// ===


var Photo = require('AllYourPhotosModels').photo,
    PhotoCopy = require('AllYourPhotosModels').photoCopy,
    Cluster = require('AllYourPhotosModels').cluster,
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

    var lastPhoto;
    var groupCount;
    photos.forEach(function (photo) {
      if (!photo.copies) photo.copies = {};
      if (!photo.copies[user._id]) photo.copies[user._id] = {};

      // default number of groups when there are very few photos are one group per day
      if (lastPhoto && Math.abs(lastPhoto.taken - photo.taken) > 8 * 60 * 60 * 1000) {
        groupCount++;
      }
      lastPhoto = photo;
    });

    // groupCount should be around 24 best photos per big event

    Clusterer.extractGroups(user, photos, Math.min(groupCount, 100), function(err, groups){

      var rankedGroups = groups.reduce(function (a, group) {
        var rankedGroup = Clusterer.rankGroupPhotos(group);
        rankedGroup.userId = user._id;
        //console.log('group', rankedGroup.photos);
        if (rankedGroup) a.push(rankedGroup);
        return a;

      }, []);

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

// returns a summary of the changes in two arrays
Clusterer.diff = function (a,b,id, merge){
  var oldIds = id && _.pluck(a, id) || a;
  var newIds = id && _.pluck(b, id) || b;


  var insert = _.difference(newIds, oldIds);
  var remove = _.difference(oldIds, newIds);
  var summary = {
    insert    : insert, //_.filter(b, function(item){return insert.indexOf(item.id) > -1; }),
    remove    : remove //_.filter(a, function(item){return remove.indexOf(item.id) > -1; })
  };
  
  if (merge){
    summary.remainder = _.filter(a, function(item){return remove.indexOf(item.id) === -1; });
    summary.merged = summary.insert.concat(summary.remainder);
  }

  return summary;
};

var getVector = function(photo, user){
  var vector = [photo.taken.getTime()];
  var mine = photo.copies && photo.copies[user._id] || photo;

  vector._id = photo._id;
  vector.oldCluster = mine.cluster;
  vector.taken = photo.taken;
  vector.vote = mine.vote;
  vector.clicks = mine.clicks;
  vector.interestingness = interestingnessCalculator(mine) || Math.floor(Math.random()*100);
  return vector;
};

Clusterer.extractGroups = function (user, photos, nrClusters, done) {

  console.debug('clustering ' + photos.length + ' photos to ' + nrClusters + ' clusters');
  if (!photos.length) return [];

  var vectors = photos.map(function(photo){ return getVector(photo,user) });

  Cluster.findOne({userId: user._id}, function(err, cluster){

    var kmeans = new clusterfck.kmeans(cluster && cluster.centroids || []);
    if (!cluster){
      cluster = new Cluster();
    }

    var clusters = vectors && kmeans.cluster(vectors.filter(function (a) { return a }), nrClusters) || [];
    var groups = clusters.map(function (cluster,i) {
      var group = {};
      group.index = i;
      group.userId = user._id;
      group.photos = _.compact(cluster);
      return group;
    });
    
    groups = _.compact(groups);
    cluster.groups = groups;
    cluster.userId = user._id;
    cluster.centroids = kmeans.centroids;
    cluster.markModified('groups');
    cluster.markModified('centroids');
    cluster.modified = new Date();
    cluster.save(function(err){
      done(err, groups);
    });

    console.debug('done, ' + groups.length + ' clusters created');
  });
};


Clusterer.classify = function (user, photos, done) {

  Cluster.findOne({userId: user._id}, function(err, snapshot){
    if (err || !snapshot) return done(err);

    var vectors = photos.map(function(photo){ return getVector(photo,user);});
    var kmeans = new clusterfck.kmeans(snapshot.centroids);
    var affectedGroups = vectors.reduce(function(affectedGroups, vector, i){
      var index = kmeans.classify(vector);
      var group = snapshot.groups[index];
      photos[i].cluster = index;
      group.photos.push(vector);
      if (affectedGroups.indexOf(group) < 0) affectedGroups.push(group);
      return affectedGroups;
    }, []);

    snapshot.markModified('groups');
    snapshot.modified = new Date();
    snapshot.save(function(err){
      done(err, affectedGroups);
    });
  });
};

Clusterer.rankGroupPhotos = function (group, nrClusters) {
  //var subClusters = utils.cluster(group.photos, nrClusters);
  var kmeans = new clusterfck.kmeans(group.centroids || null);
  var subClusters = kmeans.cluster(group.photos, nrClusters);
  
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
        photo.cluster=group.index + '.' + subGroup + '.' + i;
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
Clusterer.findOldGroup = function (group, done) {
  Group.findOne({userId: group.userId, index:group.index}, done);
};


Clusterer.saveGroupPhotos = function (group, done) {
  var taken = _.pluck(group.photos, 'taken').sort();
  group.from = taken[0];
  group.to = taken[taken.length-1];

  Clusterer.findOldGroup(group, function (err, oldGroup) {
    if (err) return done(err);

    var newGroup = oldGroup || new Group({ from:group.from, to: group.to, userId: group.userId});

    if (!group.userId) return done(new Error('UserId is not set on group'));
    if (!group.photos.length) return done(new Error('Group photos is empty'));

    var i = 0;
    var now = new Date();
    
    async.map(group.photos, function (photo, next) {

      if (photo.cluster === photo.oldCluster) return next();

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
      
      if (err) return done(err);

      group.photos.sort(function (a,b) {
        return a.order - b.order;
      });
      newGroup.photos = _.pluck(group.photos, '_id').map(function(id){return id && id.toString();});
      
      newGroup.modified = now;

      newGroup.save(function (err) {
        if (err) return done(err);
        done(null, newGroup);
      });
    });
  });
};

module.exports = Clusterer;