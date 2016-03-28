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
    mongodb.collection('images').remove({});
} else if ( argv.reset ){
    mongodb.collection('images').update({},{$set:{status:parseInt(argv.status||0,10)}},{multi:true},console.log);
} else if ( argv.check ){
    mongodb.collection('images').find({},function(err,list){
        list.forEach(function(item){
            console.log(item.status, moment(new Date(item.status_date)).format('DD/MM/YY HH:mm'));
        });
    });
};