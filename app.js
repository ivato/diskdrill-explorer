var fs = require('fs'),
    async = require('async'),
    express = require('express'),
    _ = require('lodash'),
    settings = global.settings = require('./settings.js'),
    db = global.db = require('mongojs')(settings.mongodb),
    dots = global.dots = require("dot").process({path: "./views"});
    child_process = require('child_process');

var exts = ['jpg','jpeg','png','gif','tiff','mpo'];

var rootPath = settings.rootPath;//'/Volumes/Petit Gris/Backup Macbook Pro/diskdrill/Photos';

global.towalk = 0;
global.walked = 0;

db.collection('images').ensureIndex({width:1,height:1});

var walk = function(dir, done) {
    var results = [];
    fs.readdir(dir, function(err, list) {
        if (err) return done(err);
        var i = 0;
        (function next() {
            var file = list[i++];
            if (!file) return done(null, results);
            file = dir + '/' + file;
            fs.stat(file, function(err, stat) {
                if (stat && stat.isDirectory()) {
                    walk(file, function(err, res) {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                };
            });
        })();
    });
};

var app = require('express')();

app.use('/static',express.static('static'));

app.get('/', function(req,res){
    res.redirect('/images');
});

app.get( '/images/:idx?', require('./controllers/images').handleGetRequest);

app.post('/images/:id', require('./controllers/images').handlePostRequest);

/*
    Helpers
*/

// clears database
app.get('/clear-database', function(req,res){
    console.log('clearing database');
    db.collection('images').remove(function(){
        res.send({});
    });
});

app.get('/start', function(req,res){
    walk(rootPath,function(err,files){
        global.towalk = files.length;
        global.walked = 0;
        async.eachSeries(files,function(file,cb){
            var child = child_process.spawn('identify',[file]);
            var response = '';
            ++global.walked;
            child.stdout.on('close',function(){
                var list = response.length && response.split(file).join('path').split(' ');
                if ( list && list.length ){
                    var size = list[2].split('x');
                    var image = {
                        _id     : file,
                        width   : parseInt(size[0],10),
                        height  : parseInt(size[1],10),
                        format  : list[1],
                        keep    : true,
                        tags    : []
                    };
                    if ( !image.width){
                        console.log(response);
                    };
                    db.collection('images').findOne({_id:image._id},function(err,one){
                        if ( !one ){
                            db.collection('images').save(image,cb);
                        } else {
                            setImmediate(cb);
                        };
                    });
                } else {
                    setImmediate(cb);
                };
            });
            child.stdout.on('data',function(data){
                response+=data.toString();
            });
            child.stderr.on('data',_.noop);
        },function(){
            console.log('terminé',arguments);
            db.collection('images').count(console.log)
        });
    });
});

// indicates progression of recursive folder walking;
app.get('/progress', function(req,res){
    res.send({ratio:global.walked/global.towalk,towalk:global.towalk,walked:global.walked});
});

// serve local file
app.get('/file', function(req,res){
    fs.createReadStream(req.query.path, {
      'bufferSize': 4 * 1024
    }).pipe(res);
});

var server = app.listen(80, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('App listening at http://%s:%s', host, port);
});
