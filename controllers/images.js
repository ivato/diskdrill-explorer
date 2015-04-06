var fs = require('fs'),
    async = require('async'),
    _ = require('lodash');

module.exports.handleGetRequest = function(req,res){

    global.db.collection('images').count(req.params.query,function(err,count){
        var idx = parseInt(req.params.idx||0,10);
        // si idx 0 ou 1, c'est 0.
        var skip = Math.max(0,Math.min(idx,count-1)-1),
            limit = (skip==0 && idx==0) || skip==count-2 ? 2 : 3,
            it = {
                _       : _,
                current : false,
                prev    : idx>0,
                next    : idx<count-1,
                idx     : idx
            };
        global.db.collection('images').find(req.params.query).sort({width:-1,height:-1}).skip(skip).limit(limit,function(err,result){
            if ( !err && result && result.length ){
                // en début : [current,next] idx=0 skip=0 ! 
                // en cours : [prev,current,next] idx=1 skip=0 !
                // en cours : [prev,current,next]
                // au bout  : [prev,current]
                it.current = result[idx==0?0:1];
                res.send(dots.images(it));
            } else {
                res.send('Aucune image trouvée.');
            };
        });
    });

};

module.exports.handlePostRequest = function(req,res){

};



