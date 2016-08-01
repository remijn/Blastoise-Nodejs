var async = require('asyncawait/async');
var await = require('asyncawait/await');
var web = require('./webmain');
var config = require('./config');
var login = require('./login');
var pokedex = require('./pokedex');

var pokemon = require('./pokemon');
var request = require('request');
var geolib = require('geolib');

var cluster = require('cluster');

var nearbypokemon = [];
var wildpokemon = [];
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
var totalballs = 0;

var nextspin = {};

var state = "noauth";

var movestate = "catching";

// var startlocation = [34.009474, -118.497046]; //Santa monica pier
// var startlocation = [48.872610, 2.776761]; //Disneyland Paris
var startlocation = [51.503480, -0.152062]; // Hyde parke london


exports = module.exports = {};

exports.log = function(message){
    console.log("[main] " + message);
};

exports.init = async(function(){
    this.setLocation(startlocation);
    web.init();
    var logindata = await(exports.initlogin());
    state = "auth";
    pokemon.ltype = logindata.ltype;
    pokemon.token = logindata.token;
    await(pokemon.init());
    state = "connected";
    this.log("Starting hearbeat loop");
    setTimeout(this.doHearbeatLoop, 0);
    setTimeout(this.doLoop, 0);
});

exports.doLoop = function(){
    setTimeout(async(function(){
        while(state == "connected"){
            var areaempty = false;
            await(exports.doCatch());
            await(exports.doSpin());
            await(exports.discardItems());
            await(exports.transferPokemon());
            if(areaempty == true){
                exports.log ("area empty, returning to start");
                await(exports.walkLocation(startlocation));
            }
        }
    }), 1);

};
exports.doHearbeatLoop = function(){
    setTimeout(async(function(){
        while (state == "connected") {
            exports.log("Heartbeat");
            await(exports.doHeartbeat()); //Hearbeat done
        }
    }), 1);
};

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

var lastHearbeat;

exports.doHeartbeat = async(function() {
    if(typeof lastHearbeat == "undefined" || Date.now() - lastHearbeat < config.hearbeatDelay){
        console.log("Running hearbeat now");
        return await(exports.doHeartbeatNoThrottle());
    }else{
        await(new Promise(function(resolve, reject){
            let time = (config.hearbeatDelay*1000) - (Date.now() - lastHearbeat);
            setTimeout(function(){
                resolve();
            }, time);
            console.log("Wainting: " + time + "ms for hearbeat");
        }));
        return await(exports.doHeartbeatNoThrottle());
    }

});
exports.doHeartbeatNoThrottle = async(function(){
    lastHearbeat = Date.now();
    var hearbeatdata = await(pokemon.Heartbeat());
    if(hearbeatdata instanceof Error) return hearbeatdata;
    var mapdata = hearbeatdata.map_cells;

    nearbypokemon = [];
    catchable = [];
    wildpokemon = [];
    pokestops = [];

    for(var i=0;i<mapdata.length;i++){
        //Handle wild pokemon <2 steps
        if(mapdata[i].wild_pokemons.length > 0){
            wildpokemon = wildpokemon.concat(mapdata[i].wild_pokemons);
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
                //Pokestop
                var has = false;
                for(var j = 0;j<pokestops.length;j++){
                    if(fort.id == pokestops[j].id){
                        has = true;
                        break;
                    }
                }
                if(has == false){
                    pokestops.push(fort);
                }

            }else{
                //Gym
                gyms.push(fort);
            }
        }
    }
    pokestops = geolib.orderByDistance(exports.getLocation(), pokestops);

    catchable = geolib.orderByDistance(exports.getLocation(), catchable);

    web.rtc.event.emit('displayPokemon', catchable);
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
                case("ITEM_REVIVE"):
                    if(items[itemi+1].item_id == "ITEM_MAX_REVIVE")
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

exports.transferPokemon = async(function(){
    var pokemons = await(pokemon.getPokemons());
    var byPokemon = {};
    for(var i=0;i<pokemons.length;i++){
        if(typeof(byPokemon[pokemons[i].pokemon_id]) === "undefined") byPokemon[pokemons[i].pokemon_id] = [];
        byPokemon[pokemons[i].pokemon_id].push(pokemons[i])
    }
    for(var type in byPokemon){
        if(byPokemon.hasOwnProperty(type)){
            byPokemon[type].sort(function (a, b) {
                if (a.cp > b.cp) {
                    return -1;
                }
                if (a.cp < b.cp) {
                    return 1;
                }
                // a must be equal to b
                return 0;
            });
            for(var i=1;i<byPokemon[type].length;i++){
                if(byPokemon[type][i].cp < config.max_cp_transfer)
                {
                    console.log("Transfering " + byPokemon[type][i].cp + "CP " + byPokemon[type][i].pokemon_id);
                    var data = await(pokemon.transferPokemon(byPokemon[type][i]));
                    if(data.result != "SUCCESS") console.log(data);
                }
            }
        }
    }
});

exports.doCatch = async(function(){
    if(movestate == "collecting") return;
    if(catchable.length == 0){
        areaempty = true;
        exports.log("There is nothing to catch");
        return;
    }
    catchable = geolib.orderByDistance(geolib.getCenter([this.getLocation(), {latitude: startlocation[0], longitude: startlocation[1]}]), catchable);
    let tocatch = catchable[0];
    if(typeof tocatch == "undefined") return;
    await(exports.walkLocation(tocatch));
    //Move to catch location
    //Do Encounter
    let encounter = await(pokemon.encounter(tocatch));
    if(encounter.status != "ENCOUNTER_SUCCESS") return;

    //Get Best ball
    let items = await(pokemon.getItems());
    let ball = exports.getBestBall(items, encounter);
    if(ball == null){
        this.log("No Pokeballs!");
        movestate = "collecting";
        return;
    }
    if(totalballs < 20) movestate = "collecting";
    var berries = 0;
    for (var itemi = 0; itemi < items.length; itemi++) {
        if(items[itemi].item_id == "ITEM_RAZZ_BERRY") {
            berries = items[itemi].count;
        }
    }
    if(berries > 0 && encounter.wild_pokemon.pokemon_data.cp > 400){
        var berryresult = await(pokemon.useBerry(encounter));
        console.log(berryresult);
    }

    var catchresult = await(pokemon.catchPokemon(encounter, ball));
    this.log("THROW BALL: " + pokeBalls[ball]);
    if(catchresult.status == "CATCH_SUCCESS"){
        this.log('Caught: ' +encounter.wild_pokemon.pokemon_data.cp+ " CP " + encounter.wild_pokemon.pokemon_data.pokemon_id + " got " + catchresult.capture_award.xp +"xp " + catchresult.capture_award.candy[0] +"candy " +catchresult.capture_award.stardust[0] +"dust ");
        var pokedexentry = pokedex.getPokemon(encounter.wild_pokemon.pokemon_data.pokemon_id);
        if(typeof pokedexentry === "undefined"){
            web.rtc.event.emit('showCatch', {
                name: pokedexentry.name,
                id: pokedexentry.id,
                cp: encounter.wild_pokemon.pokemon_data.cp
            });
        }else{
            web.rtc.event.emit('showCatch', {
                name: pokedexentry.name,
                id: pokedexentry.id,
                cp: encounter.wild_pokemon.pokemon_data.cp
            });
        }
    }else if(typeof catchresult.status =="undefined") {
        this.log('FAILED: No result from catch')
    }else{
        this.log(catchresult.status + ': ' + encounter.wild_pokemon.pokemon_data.cp+ " CP " + encounter.wild_pokemon.pokemon_data.pokemon_id);
    }
    web.rtc.event.emit('displayPokemon', catchable);
});

exports.doSpin = async(function(){
    //Get totalballs
    var items = await(pokemon.getItems());
    exports.getBalls(items);

    if(totalballs < 20 || catchable.length == 0 || movestate == "collecting"){
        if(totalballs < 20 && movestate != "collecting"){

            movestate = "collecting";
            console.log("Switching to collect mode");
        }
        if(movestate == "collecting" && totalballs > 49){
            movestate = "catching";
            console.log("Switching to catch mode");
        }

        let spin = false;
        var left = 0;
        pokestops = geolib.orderByDistance(geolib.getCenter([exports.getLocation(), {latitude: startlocation[0], longitude: startlocation[1]}]), pokestops);
        //Spin Pokestops
        for(var stop=0;stop<pokestops.length;stop++){
            let pokestop = pokestops[stop];
            if(typeof nextspin[pokestop.id] === "undefined" || nextspin[pokestop.id] < Date.now()){
                // if(typeof(pokestop.cooldown_complete_timestamp_ms) === "undefined" || pokestop.cooldown_complete_timestamp_ms < Date.now()){
                left++;
                if(spin == false){
                    //Spin pokestop

                    await(exports.walkLocation(pokestop));
                    spin = true;
                    var spinresult = await(pokemon.spinPokestop(pokestop));
                    exports.log("Pokestop: " + spinresult.result);
                    if(spinresult.result == "SUCCESS" || spinresult.result == "INVENTORY_FULL"){
                        exports.log('recieved ' + JSON.stringify(spinresult.items_awarded));

                        if(spinresult.items_awarded.length > 0){
                            web.rtc.event.emit('showSpin', {
                                items: spinresult.items_awarded
                            });
                        }
                    }
                    if(spinresult.result == "SUCCESS" && spinresult.items_awarded.length == 0) nextspin[pokestop.id] = Date.now() + (2*60*1000); //Wait 2 minutes for next spin
                    else nextspin[pokestop.id] = Date.now() + (7*60*1000); //Wait 6 minutes for next spin

                    // nextspin[pokestop.id] = Date.now() + (6*60*1000); //Wait 6 minutes for next spin
                }
            }
        }

        console.log('stops left to do ' + left);
        if(left < 1) {
            areaempty = true;
        }
    }
});

exports.walkLocation = async(function(loc){
    await(new Promise(function(resolve, reject){
        let distance = geolib.getDistance(exports.getLocation(), loc);
        if(distance < config.radius) resolve();

        let lazypoint = geolib.computeDestinationPoint(loc, config.radius, geolib.getBearing(loc, exports.getLocation()));

        distance = geolib.getDistance(exports.getLocation(), lazypoint);
        let speed = config.moveSpeed; // km/h
        let mps = speed * 1000 / 60 / 60; // meter/second
        let time = distance / mps;
        setTimeout(function(){
            exports.setLocation(lazypoint);
            resolve();
        }, time*1000);
        console.log("Walking: " + time + "sec");
    }));
    return loc;
});

exports.setLocation = function(latitude, longitude){
    if(typeof latitude === "object"){
        if(typeof latitude.latitude != "undefined"){
            pokemon.coords.latitude = latitude.latitude;
            pokemon.coords.longitude = latitude.longitude;
        }else{
            pokemon.coords.latitude = latitude[0];
            pokemon.coords.longitude = latitude[1];
        }
        web.rtc.event.emit('setLocation', pokemon.coords);
    }else if(typeof latitude === "undefined"){
        console.error('what the?');
        return;
    }else{
        pokemon.coords.latitude = latitude;
        pokemon.coords.longitude = longitude;
        web.rtc.event.emit('setLocation', pokemon.coords);
    }
};
exports.getLocation = function(){
    return pokemon.coords;
};
exports.getBalls = function(data){
    var balls = {};
    totalballs = 0;

    for (var itemi = 0; itemi < data.length; itemi++) {
        switch (data[itemi].item_id) {
            case "ITEM_POKE_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                totalballs += data[itemi].count;
                break;
            case "ITEM_GREAT_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                totalballs += data[itemi].count;
                break;
            case "ITEM_ULTRA_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                // totalballs += data[itemi].count;
                break;
            case "ITEM_MASTER_BALL":
                balls[data[itemi].item_id] = data[itemi].count;
                // totalballs += data[itemi].count;
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
        totalballs = 0;

        for (var itemi = 0; itemi < data.length; itemi++) {
            switch (data[itemi].item_id) {
                case "ITEM_POKE_BALL":
                    pokeBalls = data[itemi].count;
                    totalballs += data[itemi].count;
                    balls.push(data[itemi]);
                    break;
                case "ITEM_GREAT_BALL":
                    greatBalls = data[itemi].count;
                    totalballs += data[itemi].count;
                    balls.push(data[itemi]);
                    break;
                case "ITEM_ULTRA_BALL":
                    ultraBalls = data[itemi].count;
                    // totalballs += data[itemi].count;
                    balls.push(data[itemi]);
                    break;
                case "ITEM_MASTER_BALL":
                    masterBalls = data[itemi].count;
                    // totalballs += data[itemi].count;
                    balls.push(data[itemi]);
                    break;
            }
        }

        var pokemon_cp = pokemon_data.wild_pokemon.pokemon_data.cp;

        if(pokemon_cp >= 2000 && masterBalls > 0) return 4;
        if(pokemon_cp >= 500 && ultraBalls > 0) return 3;
        if(pokemon_cp >= 200 && greatBalls > 0) return 2;
        if(pokeBalls > 0) return 1;
        return null;

        // if (masterBalls > 0 && pokemon_cp >= 2000) {
        //     return 4;
        // } else if (ultraBalls > 0 && pokemon_cp >= 2000) {
        //     return 3;
        // } else if (greatBalls > 0 && pokemon_cp >= 2000) {
        //     return 2;
        // }
        //
        // if (ultraBalls > 0 && pokemon_cp >= 1000) {
        //     return 3;
        // } else if (greatBalls > 0 && pokemon_cp >= 1000) {
        //     return 2;
        // }
        //
        // if (greatBalls > 0 && pokemon_cp >= 200) {
        //     return 2;
        // }
        //
        // return 1;
    }
};

exports.init();
setTimeout(function() {
    console.log('restart');
    process.exit(0);
    // console.log('Killing worker');
}, 60 * 60 * 1000);
// }, 20*1000);

// if(cluster.isMaster){
//     var worker = cluster.fork();
//     cluster.on('exit', function(worker, code, signal){
//         console.log('Restarting worker');
//         worker = cluster.fork();
//     });
//     process.on('SIGINT', function(){
//         console.log('Shutting down workers');
//         worker.kill();
//     });
// }else{
//     exports.init();
//     console.log('Starting worker');
//     setTimeout(function() {
//         process.exit(0);
//         console.log('Killing worker');
//         // }, 60 * 60 * 1000);
//     }, 20*1000);
// }
// console.log('Started Master');
