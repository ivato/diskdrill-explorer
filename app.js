/*
  http://stackoverflow.com/questions/21656420/failed-to-load-c-bson-extension

  https://developer.xamarin.com/guides/testcloud/calabash/configuring/osx/install-xcode-command-line-tools/
  
*/

var fs = require('fs'),
    async = require('async'),
    express = require('express'),
    _ = require('lodash'),
    settings = require('./settings.js'),
    mongodb = require('mongojs')(settings.mongodb),
    dots = require("dot").process({path: "./views"}),
    child_process = require('child_process'),
    defaultProcessingInfos = {rootPath:settings.rootPath,identify_done:0,grab_total:0,grab_done:0,status:'IDLE'};

_.extend(global,{
    fs              : fs,
    async           : async,
    _               : _,
    settings        : settings,
    mongodb         : mongodb,
    dots            : dots,
    child_process   : child_process,
    processInfos    : _.clone(defaultProcessingInfos)
});

global.saveProcessInfos = function(data,cb){
  if ( cb ){
    _.extend(processInfos,data);
  } else {
    cb = data || _.noop;
  };
  fs.writeFile('process_infos.json',JSON.stringify(processInfos),function(err){
    cb(err,processInfos);
  });
};

global.loadProcessInfos = function(cb){
  fs.readFile('process_infos.json',function(err,fileData){
    if ( !err && fileData ){
      try {
        _.extend(processInfos,JSON.parse(fileData.toString()));
      } catch (err){
        console.log('Unable to read process infos file',err);
      } finally {
        if ( processInfos.rootPath != settings.rootPath || settings.reset ){
          // check consistency between path and processing infos
          processInfos = _.clone(defaultProcessingInfos);
        }
        cb && cb(err,processInfos);
      };
    } else if ( err && err.code == 'ENOENT' ){
      global.saveProcessInfos({rootPath:settings.rootPath},cb);
    };
  });
};

global.loadProcessInfos(function(err,fileData){

  mongodb.collection('images').ensureIndex({width:1,height:1});
  mongodb.collection('images').ensureIndex({status:1});

  var app = require('express')();

  var imagesController = require('./controllers/images');
  var httpRootPath = settings.http.path||'';

  app.use(httpRootPath+'/static',express.static('static'));

  app.get(httpRootPath+'/', function(req,res){
      res.redirect('/images');
  });

  app.get(httpRootPath+'/images/:id?', imagesController.handleGetRequest);

  app.all(httpRootPath+'/images/api/:action?/:option?',imagesController.handleApiRequest);

  var server = app.listen(settings.http.port, function () {
    console.log('Now listening at http://%s:%s', server.address().address, server.address().port);
  });
});
