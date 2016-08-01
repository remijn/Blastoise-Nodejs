var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);


app.set('view engine', 'ejs');
app.use(express.static('public'));

exports = module.exports = {};
exports.rtc = require('./rtc');

var location;


exports.init = function(){
    // index page
    app.get('/', function(req, res) {
        res.render('pages/index');
    });

    this.rtc.init(io);

    //RTC Events from Website
    this.rtc.event.on('connection', function(){
        console.log('User connected')
    });
    this.rtc.event.on('disconnect', function(){
        console.log('User disconnected')
    });

    http.listen(8000);
    console.log('8000 is the magic port');
};