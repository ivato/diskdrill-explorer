var lastMessage = '',
    force_grab = false;

/*
    possible values of processInfos.status :
    IDLE     : nothing is running, awaiting start command images/api/start
    COUNT    : counting images
    READ     : parse folders and inserting into database ( done after counting )
    IDENTIFY : identifying images ( done after read )
    COMPLETE : nothing is running and should not, except on demand

    Now we launch each function in a waterfall.
    we count if required, then…
    we read if required, then…
    we identify if required, then…
    complete : we can check our images
*/

//
mongodb.collection('images').count({status:{$gt:0}},function(err,count){
    processInfos.identify_done = count;
    saveProcessInfos(_.noop);
});
//
module.exports.pending_requests = {};
//
module.exports.parseImageData = function(options,cb){
    var _onComplete = function(err,image){ 
        if ( !image ){
            processInfos.status = 'COMPLETE';
            cb(null,processInfos);
        } else {
            global.processInfos.status = 'IDENTIFY';
            var child = child_process.spawn('identify',[image._id]);
            var response = '',
                errString = '';
            child.stdout.on('close',function(){
                setTimeout(function(){
                    var list = response.length && response.split(image._id).join('path').split(' ');
                    if ( list && list.length ){
                        var format = list[1];
                        if ( format != 'SVG '){
                            var size = list[2].split('x');
                            var updater = {$set:{
                                width   : parseInt(size[0],10) || 0,
                                height  : parseInt(size[1],10) || 0,
                                format  : format,
                                status  : 1
                            }};
                            mongodb.collection('images').update({_id:image._id},updater,{upsert:false},function(err,result){
                                processInfos.identify_done++;
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
                },processInfos.throttleSpeed||settings.throttleSpeed);
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
                } else {
                    console.log('pas d\'err…');
                };
            });
        };
    };
    var _parseNextImage = function(){
        if ( !options || !options._id ){
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
        processInfos.status = 'READ';
        processInfos.grab_done = 0;
        var dispatched = false;
        var _onComplete = function(){
            if ( processInfos.grab_done == processInfos.grab_total && !dispatched ){
                dispatched = true;
                saveProcessInfos(cb);
            };
        }
        var exclusions_regexp = settings.exclusions && new RegExp('('+settings.exclusions.join('|')+')');
        var exec = child_process.spawn('find',[settings.rootPath,'-type','f']);
        var readline = require('readline');
        var rl = readline.createInterface({
            input: exec.stdout,
            output: process.stdout,
            terminal: false
        });
        rl.on('error',function(error){
            console.log('readline error',error);
            if ( !dispatched ){
                dispatched = true;
                cb(error);
            };
        });
        rl.on('line',function(line){
            processInfos.grab_done++;
            lastMessage = line;
            //console.log(processInfos.grab_done,processInfos.grab_total);
            if ( exclusions_regexp && line.match(exclusions_regexp) ){
                _onComplete(null);
            } else {
                // creating the image document, if it does not exists.
                // status : // 0 : no identify , 1 : identify done, 2 : refused, 3 : selected.
                mongodb.collection('images').update({_id:line},{$setOnInsert:{status:0,tags:[]}},{upsert:true},_onComplete);
            };
        });
        rl.on('end',function(){
            console.log('readline end.');
        });
        rl.on('close',function(){
            console.log('readline close.');
            _onComplete(null);
        });
    };
};


// We count the files if we don't have the number.
module.exports.countFiles = function(cb){
    if ( !processInfos.grab_total ){
        console.log('Counting files… '+settings.rootPath);
        processInfos.status = 'COUNT';
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

module.exports.handleApiRequest = function(req,res){
    switch( req.params.action ){
        case 'update'  :
            if ( req.query.image ) {
                mongodb.collection('images').update({_id:req.query.image},{$set:{status:req.query.update=='throw'?4:3,status_date:new Date()}},function(){
                    res.redirect(httpRootPath+'/images');
                });
            } else {
                res.status(404).end();
            };
            break;
        case 'start' :
            if ( processInfos.status === 'IDLE' ){
                module.exports.initProcess(_.noop);
                res.redirect(httpRootPath+'/images');
            } else {
                res.send('Not permitted. processInfos.status should be IDLE but is '+processInfos.status);
            };
            break;
        case 'infos' :
            // get and update processInfos.
            var setter = req.query || req.body;
            if ( _.size(setter) ){
                if ( setter.throttleSpeed ){
                    setter.throttleSpeed = parseInt(setter.throttleSpeed,10);
                    if ( setter.throttleSpeed < 1000 ){
                        delete setter.throttleSpeed;
                    };
                };
            };
            saveProcessInfos(setter,function(){
                res.send(_.extend({success:true},processInfos));
            });
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
            mongodb.collection('images').remove({},function(){
                saveProcessInfos({status:'IDLE',grab_total:0,grab_done:0},function(){
                    res.send({success:true});
                });
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
    var skip = parseInt(req.query.skip||0,10);
    var _onComplete = function(err,result){
        res.send(dots.images({
            httpRootPath: httpRootPath,
            skip        : skip,
            total       : processInfos.grab_total,
            image       : result&&result[0]||{},
            lastMessage : lastMessage || '',
            processInfos: processInfos
        }));
    };
    if ( skip ){
        mongodb.collection('images').find({status:1}).sort({width:-1,height:-1}).skip(skip).limit(1,_onComplete);
    } else {
        mongodb.collection('images').find({status:1}).sort({width:-1,height:-1}).limit(1,_onComplete);
    };
};

module.exports.initProcess = function(cb){
    console.log('initProcess …');
    async.waterfall([module.exports.countFiles,module.exports.grabFiles,module.exports.parseImageData],function(err){
        console.log('initProcess done…');
        if ( err ){
            console.log('Error : ',err);
        } else {
            saveProcessInfos({status:'COMPLETE'},cb);
        };
    });
};
