var async = require('asyncawait/async');
var await = require('asyncawait/await');
var web = require('./webmain');
var config = require('./config');
var login = require('./login');

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
    return;
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
    let ball = this.getBestBall(items, tocatch);
    if(typeof ball === "undefined"){
        this.log("No Pokeballs!");
        return;
    }
    var catchresult = await(pokemon.catchPokemon(encounter, ball));
    this.log("THROW BALL: " + pokeBalls[ball]);
    if(catchdata.status == "CATCH_SUCCESS"){
        this.log('Caught: ' +data.wild_pokemon.pokemon_data.cp+ " CP " + data.wild_pokemon.pokemon_data.pokemon_id + " got " + catchdata.capture_award.xp +"xp " + catchdata.capture_award.candy[0] +"candy " +catchdata.capture_award.stardust[0] +"dust ");
    }else{
        this.log('Did not catch: ' +data.wild_pokemon.pokemon_data.cp+ " CP " + data.wild_pokemon.pokemon_data.pokemon_id);
        this.log('catchdata.status');
    }


});

exports.setLocation = function(latitude, longitude){
    var distance = geolib.getDistance({latitude: latitude, longitude: longitude},pokemon.coords);
    // console.log('moving ' + distance + " meters");
    pokemon.coords.latitude = latitude;
    pokemon.coords.longitude = longitude;
};
exports.getLocation = function(){
    return pokemon.coords;
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

        if (greatBalls > 0 && pokemon_cp >= 500) {
            return 2;
        }

        return 1;
    }
};

exports.init();

