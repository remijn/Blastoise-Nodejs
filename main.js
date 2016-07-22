
var login = require('./login');
var config = require('./config');
var pokemon = require('./pokemon');
var request = require('request');
var geolib = require('geolib');

var jar = request.jar();

var catchable = [];
var pokestops = [];

var state = "noauth";

var endpoint;
var token;
var ltype = "google";

login.login_google(function(data){
    token = data;
    state = "auth";
    pokemon.coords.latitude = 33.811931;
    pokemon.coords.longitude = -117.918996;
    console.log("Logged in with google");
    pokemon.api_endpoint(token, ltype, function(data){
        endpoint = data;
        state = "endpoint";
        console.log("Got api endpoint");
        pokemon.getProfile(endpoint, token, ltype, function(data){
            console.log("----PROFILE START----");
            console.log("User: " + data.player_data.username);
            console.log("Coin: " + data.player_data.currencies[0].amount);
            console.log("Dust: " + data.player_data.currencies[1].amount);
            console.log("----PROFILE END----");
            doHearbeat();
        });
        pokemon.getPlayerStats(endpoint, token, ltype, function(data){
            console.log(data);
        })


    });
});

var setLocation = function(latitude, longitude){
    var distance = geolib.getDistance({latitude: latitude, longitude: longitude},pokemon.coords);
    // console.log('moving ' + distance + " meters");
    pokemon.coords.latitude = latitude;
    pokemon.coords.longitude = longitude;
};
var getLocation = function(){
    return pokemon.coords;
};

var doHearbeat = function(){
    pokemon.Heartbeat(endpoint, token, ltype, function(data){
        console.log("----HEARTBEAT START----");
        catchable = [];
        for(var i=0;i<data.map_cells.length;i++){
            //Handle wild pokemon <2 steps
            if(data.map_cells[i].wild_pokemons.length > 0){
                var pokemons = data.map_cells[i].wild_pokemons;
            }
            //Handle catchable <1 step
            if(data.map_cells[i].catchable_pokemons.length > 0){
                var pokemons = data.map_cells[i].catchable_pokemons;
                // for(var q = 0;q<pokemons.length;q++){
                //     var has = false;
                //     for(var j = 0;j<catchable.length;j++){
                //         if(catchable[j].encounter_id == pokemons[q].encounter_id){
                //             has = true;
                //             break;
                //         }
                //     }
                //     if(has == false){
                //         console.log("Encountered new pokemon " + pokemons[q].pokemon_id)
                //         catchable.push(pokemons[q]);
                //     }
                //
                // }
                catchable = catchable.concat(data.map_cells[i].catchable_pokemons);
                // console.log(pokemons);
            }
            //Handle Nearby >2 step
            if(data.map_cells[i].nearby_pokemons.length > 0){
                var pokemons = data.map_cells[i].nearby_pokemons;
                // console.log(pokemons);
            }
            //Handle Forts (pokestop/gym)
            var forts = data.map_cells[i].forts;
            for(var q = 0;q<forts.length;q++){
                var fort = forts[q];
                if(fort.type == "CHECKPOINT"){
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
                }
            }
        }
        pokestops = geolib.orderByDistance(getLocation(), pokestops);

        catchable = geolib.orderByDistance(getLocation(), catchable);

        console.log("----HEARTBEAT END----");
    });
};

var spin;
var doSpin = function(){
    spin = false;
    var left = 0;
    //Spin Pokestops
    for(var stop=0;stop<pokestops.length;stop++){
        let pokestop = pokestops[stop];
        if(typeof(pokestop.cooldown_complete_timestamp_ms) === "undefined" || pokestop.cooldown_complete_timestamp_ms < Date.now()){
            left++;
            if(spin == false){
                //Spin pokestop
                setLocation(pokestop.latitude, pokestop.longitude);
                spin = true;
                pokemon.spinPokestop(endpoint, token, ltype, pokestop, function(data){
                    console.log("Pokestop: " + data.result);
                    if(data.result == "SUCCESS" || data.result == "INVENTORY_FULL"){
                        console.log('recieved ' + JSON.stringify(data.items_awarded));
                        if(data.items_awarded.length == 0){
                            pokestop.cooldown_complete_timestamp_ms = Date.now() + 60000 * 1;
                        }
                        pokestop.cooldown_complete_timestamp_ms = Date.now() + 60000 * 5;
                    }
                    if(data.result == "IN_COOLDOWN_PERIOD"){
                        pokestop.cooldown_complete_timestamp_ms = Date.now() + 60000*3; //Try again in a minute
                    }
                });
            }
        }
    }
    console.log('stops left to do ' + left);
};
// var catchnr = 0;
var didcatch = false;
var doCatch = function(){
    if(catchable.length <= 0) return;
    let tocatch = catchable[0];
    if(typeof(tocatch) == "undefined") return;
    // catchnr++;
    // console.log(tocatch);
    setLocation(tocatch.latitude, tocatch.longitude);
    pokemon.encounter(endpoint, token, ltype, tocatch, function(data){
        if(data.status != "ENCOUNTER_SUCCESS") return;
        // console.log(data);

        setLocation(tocatch.latitude, tocatch.longitude);
        pokemon.catchPokemon(endpoint, token, ltype, data, 1, function(catchdata){
            console.log(catchdata);
            if(catchdata.status == "CATCH_SUCCESS"){
                console.log('Caught ' +data.wild_pokemon.pokemon_data.cp+ " CP " + data.wild_pokemon.pokemon_data.pokemon_id + " got " + catchdata.capture_award.xp +"xp " + catchdata.capture_award.candy[0] +"candy " +catchdata.capture_award.stardust[0] +"dust ");
            }
        });
    });
};
var donecleanup = false;
var doCleanup = function(){
    //Transfer Pokemons
    pokemon.getPokemons(endpoint, token, ltype, function(data){
        var byPokemon = {};
        for(var i=0;i<data.length;i++){
            if(typeof(byPokemon[data[i].pokemon_id]) === "undefined") byPokemon[data[i].pokemon_id] = [];
            byPokemon[data[i].pokemon_id].push(data[i])
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
                    console.log("Transfering " + byPokemon[type].cp + "CP " + byPokemon[type].pokemon_id);
                    pokemon.transferPokemon(endpoint, token, ltype, byPokemon[type][i], function(data){
                        console.log(data);
                    });
                }
            }
        }
    })
};

setInterval(function(){
    if(state != "endpoint") return;
    //Do spin
    doSpin();
    //Do catch
    // console.log('nearby: ' + catchable);
    doCatch();
    //Do Cleanup
    doCleanup();
    //Do heartbeat
    doHearbeat();
}, 4000);