var User = require('../../models/user');
var async = require('async');
var ObjectId = require('mongoose').Types.ObjectId;
var _ = require('underscore');

module.exports = function(app){


  app.get('/api/user/exist', function(req, res){

    User.find({'emails.value':req.query.q}).count(function(err, result){

      return res.json(result > 0);

    });

  });


};