var async = require('asyncawait/async');
var await = require('asyncawait/await');
var web = require('./webmain');
var config = require('./config');
var login = require('./login');
var pokedex = require('./pokedex');

var pokemon = require('./pokemon');
var request = require('request');
var geolib = require('geolib');

var nearbypokemon = [];
var catchable = [];
var pokestops = [];
var gyms = [];

var pokemonSettings;
var pokeBalls = {
    1: 'ITEM_POKE_BALL',
    2: 'ITEM_GREAT_BALL',
    3: 'ITEM_ULTRA_BALL',
    4: 'ITEM_MASTER_BALL'
};

var state = "noauth";

exports = module.exports = {};

exports.log = function(message){
    console.log("[main] " + message);
};

exports.init = async(function(){
    this.setLocation(48.872610, 2.776761);
    web.init();
    var logindata = await(exports.initlogin());
    state = "auth";
    pokemon.ltype = logindata.ltype;
    pokemon.token = logindata.token;
    await(pokemon.init());
    state = "connected";
    this.log("Starting hearbeat loop");
    setTimeout(await(this.doLoop), 0);
});

exports.doLoop = async(function(){
    while(state == "connected"){
        exports.log("Heartbeat");
        await(exports.doHeartbeat()); //Hearbeat done
        await(exports.doCatch());
        await(exports.doSpin());
        await(exports.discardItems());
    }
});

exports.initlogin = async(function(){
    if(login.hasSession() == "google"){
        this.log("Session found, using google");
        //Reuse Old google refresh token
        pokemon.ltype = "google";
        var tokens = await (login.refreshGoogle());
        return {ltype: "google", token: tokens};
    }else{
        this.log("No session found, using google");
        //Get new google token
        var url = login.loginGoogle();
        this.log(url);

        //TODO Hook this into web
        var rl = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        var token = await (new Promise(function(resolve, reject){
            rl.question("paste the activation code here: ", function(answer){
                resolve(answer);
                rl.close();
            });
        }));

        var accesstoken = await (login.useGoogleToken(token));
        return {ltype: "google", token: accesstoken};
    }
});

exports.doHeartbeat = async(function(){
    var hearbeatdata = await(pokemon.Heartbeat());
    var mapdata = hearbeatdata.map_cells;

    nearbypokemon = [];
    catchable = [];
    pokestops = [];

    for(var i=0;i<mapdata.length;i++){
        //Handle wild pokemon <2 steps
        if(mapdata[i].wild_pokemons.length > 0){
            nearbypokemon = nearbypokemon.concat(mapdata[i].wild_pokemons);
        }
        //Handle catchable <1 step
        if(mapdata[i].catchable_pokemons.length > 0){
            nearbypokemon = nearbypokemon.concat(mapdata[i].catchable_pokemons);
            catchable = catchable.concat(mapdata[i].catchable_pokemons);
        }
        //Handle Nearby >2 step
        if(mapdata[i].nearby_pokemons.length > 0){
            nearbypokemon = nearbypokemon.concat(mapdata[i].nearby_pokemons);
        }
        //Handle Forts (pokestop/gym)
        var forts = mapdata[i].forts;
        for(var q = 0;q<forts.length;q++){
            var fort = forts[q];
            if(fort.type == "CHECKPOINT"){
                pokestops.push(fort);
                // //Pokestop
                // var has = false;
                // for(var j = 0;j<pokestops.length;j++){
                //     if(fort.id == pokestops[j].id){
                //         has = true;
                //         break;
                //     }
                // }
                // if(has == false){
                //     pokestops.push(fort);
                // }

            }else{
                //Gym
                gyms.push(fort);
            }
        }
    }
    pokestops = geolib.orderByDistance(exports.getLocation(), pokestops);

    catchable = geolib.orderByDistance(exports.getLocation(), catchable);
    return;
});

exports.discardItems = async(function(){
    var items = await(pokemon.getItems());
    for(var itemi=0;itemi<items.length;itemi++){
        let item = items[itemi];
        let discard = item.count > 50?item.count-50:0;
        if(items.length > itemi-1){
            switch(item.item_id){
                case("ITEM_POTION"):
                    if(items[itemi+1].item_id == "ITEM_SUPER_POTION")
                        discard = item.count;
                    break;
                case("ITEM_SUPER_POTION"):
                    if(items[itemi+1].item_id == "ITEM_HYPER_POTION")
                        discard = item.count;
                    break;
                case("ITEM_HYPER_POTION"):
                    if(items[itemi+1].item_id == "ITEM_MAX_POTION")
                        discard = item.count;
                    break;
            }
        }

        if(discard != 0 && typeof(discard) == "number"){
            var discarded = await(pokemon.discardItem(item, discard));
            console.log("Discarded " + discard + " " + item.item_id);
        }
    }
});

exports.doCatch = async(function(){
    if(catchable.length == 0){
        exports.log("There is nothing to catch");
        return;
    }
    catchable = geolib.orderByDistance(this.getLocation(), catchable);
    let tocatch = catchable[0];
    if(typeof tocatch == "undefined") return;
    //Move to catch location
    this.setLocation(tocatch.latitude, tocatch.longitude);
    //Do Encounter
    let encounter = await(pokemon.encounter(tocatch));
    if(encounter.status != "ENCOUNTER_SUCCESS") return;

    //Move to encounter location
    this.setLocation(tocatch.latitude, tocatch.longitude);

    //Get Best ball
    let items = await(pokemon.getItems());
    let ball = exports.getBestBall(items, encounter);
    if(typeof ball === "undefined"){
        this.log("No Pokeballs!");
        return;
    }
    var catchresult = await(pokemon.catchPokemon(encounter, ball));
    this.log("THROW BALL: " + pokeBalls[ball]);
    if(catchresult.status == "CATCH_SUCCESS"){
        this.log('Caught: ' +encounter.wild_pokemon.pokemon_data.cp+ " CP " + encounter.wild_pokemon.pokemon_data.pokemon_id + " got " + catchresult.capture_award.xp +"xp " + catchresult.capture_award.candy[0] +"candy " +catchresult.capture_award.stardust[0] +"dust ");
        var podedexentry = pokedex.getPokemon(encounter.wild_pokemon.pokemon_data.pokemon_id);
        web.rtc.event.emit('showCatch', {
            name: podedexentry.name,
            id: podedexentry.id,
            cp: encounter.wild_pokemon.pokemon_data.cp,

        });
    }else if(typeof catchresult.status =="undefined") {
        this.log('FAILED: No result from catch')
    }else{
        this.log(catchresult.status + ': ' + encounter.wild_pokemon.pokemon_data.cp+ " CP " + encounter.wild_pokemon.pokemon_data.pokemon_id);
    }

});

exports.doSpin = async(function(){
    let spin = false;
    var left = 0;
    //Spin Pokestops
    for(var stop=0;stop<pokestops.length;stop++){
        let pokestop = pokestops[stop];
        if(typeof(pokestop.cooldown_complete_timestamp_ms) === "undefined" || pokestop.cooldown_complete_timestamp_ms < Date.now()){
            left++;
            if(spin == false){
                //Spin pokestop
                exports.setLocation(pokestop.latitude, pokestop.longitude);
                spin = true;
                var spinresult = await(pokemon.spinPokestop(pokestop));
                exports.log("Pokestop: " + spinresult.result);
                if(spinresult.result == "SUCCESS" || spinresult.result == "INVENTORY_FULL"){
                    exports.log('recieved ' + JSON.stringify(spinresult.items_awarded));
                    if(spinresult.items_awarded.length == 0){
                        pokestop.cooldown_complete_timestamp_ms = Date.now() + 60000 * 1;
                    }else{
                        web.rtc.event.emit('showSpin', {
                            items: spinresult.items_awarded
                        });
                    }
                    pokestop.cooldown_complete_timestamp_ms = Date.now() + 60000 * 5;
                }
                if(spinresult.result == "IN_COOLDOWN_PERIOD"){
                    pokestop.cooldown_complete_timestamp_ms = Date.now() + 60000*3; //Try again in a minute
                }
            }
        }
    }

    console.log('stops left to do ' + left);
});

exports.setLocation = function(latitude, longitude){
    var distance = geolib.getDistance({latitude: latitude, longitude: longitude},pokemon.coords);
    // console.log('moving ' + distance + " meters");
    pokemon.coords.latitude = latitude;
    pokemon.coords.longitude = longitude;
    web.rtc.event.emit('setLocation', pokemon.coords);
};
exports.getLocation = function(){
    return pokemon.coords;
};
exports.getBalls = function(data){
    var balls = {};

    for (var itemi = 0; itemi < data.length; itemi++) {
        switch (data[itemi].item_id) {
            case "ITEM_POKE_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                break;
            case "ITEM_GREAT_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                break;
            case "ITEM_ULTRA_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                break;
            case "ITEM_MASTER_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                break;
        }
    }
    return balls;

};
exports.getBestBall = function(data, pokemon_data){
    if (typeof(pokemon_data) !== 'undefined' &&
        typeof(pokemon_data.wild_pokemon) !== 'undefined' &&
        typeof(pokemon_data.wild_pokemon.pokemon_data) !== 'undefined' &&
        typeof(data) !== 'undefined') {

        var pokeBalls, greatBalls, ultraBalls, masterBalls;
        var balls = [];

        for (var itemi = 0; itemi < data.length; itemi++) {
            switch (data[itemi].item_id) {
                case "ITEM_POKE_BALL":
                    pokeBalls = data[itemi].count;
                    balls.push(data[itemi]);
                    break;
                case "ITEM_GREAT_BALL":
                    greatBalls = data[itemi].count;
                    balls.push(data[itemi]);
                    break;
                case "ITEM_ULTRA_BALL":
                    ultraBalls = data[itemi].count;
                    balls.push(data[itemi]);
                    break;
                case "ITEM_MASTER_BALL":
                    masterBalls = data[itemi].count;
                    balls.push(data[itemi]);
                    break;
            }
        }

        var pokemon_cp = pokemon_data.wild_pokemon.pokemon_data.cp;

        if (masterBalls > 0 && pokemon_cp >= 2000) {
            return 4;
        } else if (ultraBalls > 0 && pokemon_cp >= 2000) {
            return 3;
        } else if (greatBalls > 0 && pokemon_cp >= 2000) {
            return 2;
        }

        if (ultraBalls > 0 && pokemon_cp >= 1000) {
            return 3;
        } else if (greatBalls > 0 && pokemon_cp >= 1000) {
            return 2;
        }

        if (greatBalls > 0 && pokemon_cp >= 400) {
            return 2;
        }

        return 1;
    }
};

exports.init();