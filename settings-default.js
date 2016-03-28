module.exports = {
    mongodb  		: 'disk-drill',
    rootPath 		: '/opt/diskdrill-explorer/test',
    exclusions		: false, // ['some_string_to_exclude','another_one'],
    extensions		: ['jpg','jpeg','png','gif','tiff','mpo'],
    throttleSpeed	: 2000,
    reset       	: true,
    http		: {
	path : '/diskdrill',
        port : 80
    }
}
