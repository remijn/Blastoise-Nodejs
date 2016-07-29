var eventemitter = require('events');
var config = require('./config');
var fs = require('fs');
if (config.telegram){
    var TelegramBot = require('node-telegram-bot-api');
    var telegram = require('./telegram');
}
var pokedex = require('./pokedex');

exports = module.exports = {};

var io;

exports.event = new eventemitter();

var loc;

exports.init = function(socketio){
    var self = this;

    if(config.telegram){
        var bot = new TelegramBot(config.telegram_token, {polling: true});

        if(telegram.chatid == "" || typeof telegram.chatid === "undefined"){
            console.log("Register with telegram bot: http://telegram.me/Blastoise_bot");
        }

        bot.onText(/\/start/, function(msg, match){
            telegram.chatid = msg.chat.id;
            fs.writeFile("telegram.json", JSON.stringify(telegram), function(){
                bot.sendMessage(telegram.chatid, "Registered with Blastoise");
            });
        })
    }

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
    this.event.on('showCatch', function(data){
        io.emit('showCatch', data);
        if(config.telegram) bot.sendMessage(telegram.chatid, "Caught " + data.cp +"CP " + data.name);

    });
    this.event.on('showSpin', function(data){
        var items = [];
        for(item in data.items){
            items.push(data.items[item].item_id)
        }
        io.emit('showSpin', items);
        if(config.telegram) bot.sendMessage(telegram.chatid, "Spin \n" + JSON.stringify(data));
    });

    var lastempty = false;
    this.event.on('displayPokemon', function(catchable){

        if(catchable.length < 1 && lastempty) return;
        if(catchable.length < 1 && !lastempty) {
            lastempty = true;
        }else{
            lastempty = false;
        }

        let display = [];
        for(let p in catchable){
            let data = catchable[p];
            let pokedexentry = pokedex.getPokemon(data.pokemon_id);

            display.push({
                name: pokedexentry.name,
                id: pokedexentry.id,
                loc: {
                    lat: data.latitude,
                    lng: data.longitude
                }
            });
        }

        io.emit('displayPokemon', display);
        console.log('sent pokemon');
    });

};