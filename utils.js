var fs = require('fs'),
    argv = require('optimist').argv,
    moment = require('moment'),
    async = require('async'),
    express = require('express'),
    _ = require('lodash'),
    settings = require('./settings.js'),
    mongodb = require('mongojs')(settings.mongodb),
    child_process = require('child_process');

if ( argv.remove ){
    mongodb.collection('images').remove({},console.log);
} else if ( argv.reset ){
    mongodb.collection('images').update({},{$set:{status:parseInt(argv.status||0,10)}},{multi:true},console.log);
} else if ( argv.check ){
    mongodb.collection('images').find({},function(err,list){
        list.forEach(function(item){
            console.log(item.status, item.status_date ? moment(new Date(item.status_date)).format('DD/MM/YY HH:mm') : '');
        });
    });
} else if ( argv.identify ){
    var throttleSpeed = parseInt(argv.speed,10) || settings.throttleSpeed || 2000;
    var exec = child_process.spawn('find',[settings.rootPath,'-type','f']);
    var readline = require('readline');
    var lines = [];
    var rl = readline.createInterface({
        input: exec.stdout,
        output: process.stdout,
        terminal: false
    });
    rl.on('error',function(error){
        console.log('readline error',error);
    });
    rl.on('close',function(){
        console.log('readline close');
        async.eachSeries(lines,function(line,cb){
            var dispatched = false;
            var onComplete = function(){
                if ( !dispatched ){
                    dispatched = true;
                    cb();
                };
            };
            var child = child_process.spawn('identify',[line]);
            var response = '',
                errString = '';
            child.stdout.on('close',function(){
                console.log(response);
                setTimeout(function(){
                    onComplete();
                },throttleSpeed);
            });
            child.stdout.on('data',function(data){
                response+=data.toString();
            });
            child.stderr.on('data',function(errData){
                errString += errData.toString();
            });
            child.stderr.on('close',function(){
                if ( errString.length ){
                    console.log(line);
                    console.log(errString);
                    onComplete();
                };
            });            
        },function(){
            console.log('all lines done');
        });
    });
    rl.on('line',function(line){
        lines.push(line);
    });
} else if ( argv.regex ){
    var extensions = _.uniq(settings.extensions.map(function(o){
        return o.toLowerCase();
    }).concat(settings.extensions.map(function(o){
        return o.toUpperCase();
    })));
    var processArguments;
    if ( process.platform == 'darwin' ) {
        var regex = '.*\\.('+extensions.join('|')+')$';
        if ( argv.count ){
            regex = '"' + regex +'"';
        };
        processArguments = ['-E',settings.rootPath,'-regex',regex,'-type','f'];
    } else {
        var regex = '.*\\.\\('+extensions.join('\\|')+'\\)$';
        if ( argv.count ){
            regex = '"'+regex+'"';
        };
        processArguments = [settings.rootPath,'-regex',regex,'-type','f'];
    };
    if ( argv.count ){
        processArguments = 'find '+processArguments.join(' ')+' -ls | wc -l';
        console.log(processArguments);
        child_process.exec(processArguments,function(err,stdout,stderr){
            console.log('err',err);
            console.log(stdout.toString());
            console.log(stderr.toString());
        });
    } else {
        console.log(processArguments);
        var exec = child_process.spawn('find',processArguments);
        exec.stdout.on('data',function(data){
            console.log(data.toString());
        });
        exec.stderr.on('data',function(data){
            console.log('error',data.toString());
        });
    };
};