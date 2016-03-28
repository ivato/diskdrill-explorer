var fs = require('fs'),
    async = require('async'),
    express = require('express'),
    _ = require('lodash'),
    settings = require('./settings.js'),
    mongodb = require('mongojs')(settings.mongodb),
    dots = require("dot").process({path: "./views"}),
    child_process = require('child_process');

mongodb.collection('images').update({},{$set:{state:0}},{multi:true},console.log);