var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var rtc = require('./rtc');

app.set('view engine', 'ejs');

exports = module.exports = {};

exports.init = function(){
    // index page
    app.get('/', function(req, res) {
        res.render('pages/index');
    });

    rtc.init(io);

    rtc.event.on('connection', function(){
        console.log('User connected')
    });
    rtc.event.on('disconnect', function(){
        console.log('User disconnected')
    });

    http.listen(3000);
    console.log('3000 is the magic port');
};

exports.init();