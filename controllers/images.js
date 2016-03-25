var lastMessage = '',
    force_grab = false;

/*
    possible values of processInfos.grab_status :
    IDLE     : nothing is running but it should start quickly
    COUNT    : counting images
    READ     : parse folders and inserting into database ( done after counting )
    IDENTIFY : identifying images ( done after read )
    COMPLETE : nothing is running and should not, except on demand

    Now we launch each function in a waterfall.
    we count if required then…
    we read if required then…
    we identify if required then…
    complete : we can check our images
*/

module.exports.pending_requests = {};
//
module.exports.parseImageData = function(options,cb){
    setTimeout(function(){
        cb()
    },10000000);
    return;
    var _onComplete = function(err,image){
        if ( !image ){
            processInfos.grab_status = 'COMPLETE';
            cb(null,processInfos);
        } else {
            global.processInfos.grab_status = 'IDENTIFY';
            var child = child_process.spawn('identify',[image._id]);
            var response = '',
                errString = '';
            child.stdout.on('close',function(){
                console.log('identify says',response);
                setTimeout(function(){
                    var list = response.length && response.split(image._id).join('path').split(' ');
                    if ( list && list.length ){
                        var format = list[1];
                        if ( format != 'SVG '){
                            var size = list[2].split('x');
                            var updater = {$set:{
                                width   : parseInt(size[0],10),
                                height  : parseInt(size[1],10),
                                format  : format,
                                status  : 1
                            }};
                            if ( !image.width ){
                                console.log('image sans width ???',response);
                            };
                            mongodb.collection('images').update({_id:image._id},updater,{upsert:false},function(err,result){
                                if ( !options._id ) {
                                    _parseNextImage();
                                } else {
                                    cb(err,result);
                                };
                            });
                        } else {
                            _parseNextImage();
                        };
                    } else {
                        _parseNextImage();
                    };
                },settings.throttleSpeed);
            });
            child.stdout.on('data',function(data){
                response+=data.toString();
            });
            child.stderr.on('data',function(errData){
                errString += errData.toString();
            });
            child.stderr.on('close',function(){
                if ( errString.length ){
                    cb(new Error(errString));
                };
            });
        };
    };
    var _parseNextImage = function(){
        if ( !options._id ){
            mongodb.collection('images').findOne({status:0},_onComplete);
        } else {
            _onComplete(null,options);
        };     
    };
    _parseNextImage();
};

module.exports.grabFiles = function(options,cb){
    if ( processInfos.grab_total && (processInfos.grab_done==processInfos.grab_total) ){
        cb(null,processInfos);
    } else {
        console.log('Grabbing files…');
        processInfos.grab_status = 'READ';
        processInfos.grab_done = 0;
        var exclusions_regexp = new RegExp('('+settings.exclusions.join('|')+')');
        var exec = child_process.spawn('find',[settings.rootPath,'-type','f']);
        var readline = require('readline');
        var rl = readline.createInterface({
            input: exec.stdout,
            output: process.stdout,
            terminal: false
        });
        rl.on('error',function(error){
            console.log('readline error',error);
            cb(error);
        });
        rl.on('line',function(line){
            processInfos.grab_done++;
            lastMessage = line;
            //console.log(processInfos.grab_done,processInfos.grab_total);
            var _onComplete = function(){
                if ( processInfos.grab_done == processInfos.grab_total ){
                    saveProcessInfos(cb);
                };
            }
            if ( line.match(exclusions_regexp) ){
                _onComplete(null);
            } else {
                // creating the image document, if it does not exists.
                // status : // 0 : no identify , 1 : identify done, 2 : refused, 3 : selected.
                mongodb.collection('images').update({_id:line},{$setOnInsert:{status:0,tags:[]}},{upsert:true},_onComplete);
            };
        });
        rl.on('end',function(){
            console.log('readline end.',processInfos);
        });
        rl.on('close',function(){
            console.log('readline close.',processInfos);
            saveProcessInfos(cb);
        });
    };
};


// We count the files if we don't have the number.
module.exports.countFiles = function(cb){
    if ( !processInfos.grab_total ){
        console.log('Counting files… '+settings.rootPath);
        processInfos.grab_status = 'COUNT';
        child_process.exec('find '+settings.rootPath+' -type f -ls | wc -l',function(err,stdout,stderr){
            processInfos.grab_total = parseInt(stdout.toString().trim(),10);
            console.log('Files…',processInfos.grab_total);
            saveProcessInfos(function(err,result){
                if ( err ){
                    console.log('Error while saving process infos.');
                };
                cb(err,processInfos);
            });
        });
    } else {
        cb(null,processInfos);
    };
};

async.waterfall([module.exports.countFiles,module.exports.grabFiles,module.exports.parseImageData],function(err){
    console.log('done');
    if ( err ){
        console.log('Erreur : ',err);
    };
});

module.exports.handleApiRequest = function(req,res){
    switch( req.params.action ){
        case 'grab_infos' :
            res.send(_.extend({success:true},processInfos));
            break;
        case 'pending' :
            if ( req.body.request_id && module.exports.pending_requests[req.body.request_id] ){
                res.send(module.exports.pending_requests);
                if ( module.exports.pending_requests[request_id].status == 'complete' ){
                    delete module.exports.pending_requests[request_id];
                };
            } else {
                res.send({})
            };
            break;
        case 'count' :
            var request_id = mongodb.ObjectId();
            module.exports.pending_requests[request_id] = {status:pending};
            res.send({request_id:request_id,status:pending});
            mongodb.collection('images').count({},function(err,db_total){
            mongodb.collection('images').count({status:{$gt:0}},function(err,db_done){
                module.exports.pending_requests[request_id].status = 'complete';
                module.exports.pending_requests[request_id].total = db_total;
                module.exports.pending_requests[request_id].done = db_done;
            });});
            break;
        case 'file' :
            if ( req.query.path ){
                fs.createReadStream(req.query.path, {
                  bufferSize: 4 * 1024
                }).pipe(res);
            } else {
                res.end();
            };
            break;
        case 'db_reset' :
            mongodb.collection('images').remove(function(){
                res.send({success:true});
            });
            break;
        default :
            res.end();
            break;
    };
};

module.exports.handleGetRequest = function(req,res){

    /*
        Il nous faut
            - le décompte total, le décompte actuellement fait sur la lecture des fichiers
            - idem, sur la base de données : le total, et l'actuellement "coché"
            les décomptes, on va les faire en async.
    */
    mongodb.collection('images').find({status:0}).sort({width:-1,height:-1}).limit(1,function(err,result){
        res.send(dots.images({
            image       : result&&result[0]||{},
            lastMessage : lastMessage || ''
        }));
    });
};



