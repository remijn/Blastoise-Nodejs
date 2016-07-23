var eventemitter = require('events');
exports = module.exports = {};

var io;

exports.event = new eventemitter();

exports.init = function(socketio){
    var self = this;
    this.io = socketio;

    this.io.on('connection', function(socket){
        self.event.emit('connection', socket);
    });
    this.io.on('disconnect', function(socket){
        self.event.emit('disconnect', socket);
    });
};