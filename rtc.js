var eventemitter = require('events');
exports = module.exports = {};

var io;

exports.event = new eventemitter();

var loc;

exports.init = function(socketio){
    var self = this;
    io = socketio;

    io.on('connection', function(socket){
        self.event.emit('connection', socket);
        io.emit('setInitialLocation', loc)
    });
    io.on('disconnect', function(socket){
        self.event.emit('disconnect', socket);
    });
    this.event.on('setLocation', function(data){
        loc = {
            lat: data.latitude,
            lng: data.longitude
        };
        io.emit('setLocation', loc);
    });
};