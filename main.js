
var login = require('./login');
var config = require('./config');
var pokemon = require('./pokemon');
var request = require('request');
var geolib = require('geolib');

var jar = request.jar();

var catchable = [];
var pokestops = [];

var pokemonSettings;
var pokeBalls = {
    1: 'ITEM_POKE_BALL',
    2: 'ITEM_GREAT_BALL',
    3: 'ITEM_ULTRA_BALL',
    4: 'ITEM_MASTER_BALL'
};

var state = "noauth";

var endpoint;
var token;
var ltype = "google";

// login.login_pokemon(function(data){
//     token = data;
//     console.log(token);
//     return false;
//     state = "auth";
//     // pokemon.coords.latitude = 48.872610; //Disneyland Paris
//     // pokemon.coords.longitude = 2.776761;
//     pokemon.coords.latitude = 33.811931;
//     pokemon.coords.longitude = -117.918996;
//     console.log("Logged in with pokemon");
//     pokemon.api_endpoint(token, ltype, function(data){
//
//         // endpoint = data;
//         // state = "endpoint";
//         // console.log("Got api endpoint");
//         // pokemon.getProfile(endpoint, token, ltype, function(data){
//         //     console.log("----PROFILE START----");
//         //     console.log("User: " + data.player_data.username);
//         //     console.log("Coin: " + data.player_data.currencies[0].amount);
//         //     console.log("Dust: " + data.player_data.currencies[1].amount);
//         //     console.log("----PROFILE END----");
//         //     doHearbeat();
//         // });
//         // pokemon.getPlayerStats(endpoint, token, ltype, function(data){
//         //     console.log(data);
//         // })
//
//
//     });
// });

login.login_google(function(data){
    token = data;
    state = "auth";
    // pokemon.coords.latitude = 48.872610; //Disneyland Paris
    // pokemon.coords.longitude = 2.776761;
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
        });
        pokemon.getPokemonSettings(endpoint, token, ltype, function(settings){
            pokemonSettings = settings;
        });


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

var getBestBall = function(data, pokemon_data){
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

        pokemon.getItems(endpoint, token, ltype, function(items){
            var bestBall = getBestBall(items, data);

            if(typeof(bestBall) !== 'undefined')
            {
                pokemon.catchPokemon(endpoint, token, ltype, data, bestBall, function(catchdata){
                    console.log('THROW BALL: ' + pokeBalls[bestBall]);
                    console.log(catchdata);
                    if(catchdata.status == "CATCH_SUCCESS"){
                        console.log('Caught ' +data.wild_pokemon.pokemon_data.cp+ " CP " + data.wild_pokemon.pokemon_data.pokemon_id + " got " + catchdata.capture_award.xp +"xp " + catchdata.capture_award.candy[0] +"candy " +catchdata.capture_award.stardust[0] +"dust ");
                    }
                });
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
                    if(byPokemon[type][i].cp < config.max_cp_transfer)
                    {
                        console.log("Transfering " + byPokemon[type][i].cp + "CP " + byPokemon[type][i].pokemon_id);
                        pokemon.transferPokemon(endpoint, token, ltype, byPokemon[type][i], function(data){
                            if(data.result != "SUCCESS") console.log(data);
                        });
                    }
                }
            }
        }
    });
    //Discard Items
    pokemon.getItems(endpoint, token, ltype, function(data){
        for(var itemi=0;itemi<data.length;itemi++){
            let item = data[itemi];
            let discard = item.count > 50?item.count-50:0;
            if(data.length > itemi-1){
                switch(item.item_id){
                    case("ITEM_POTION"):
                        if(data[itemi+1].item_id == "ITEM_SUPER_POTION")
                            discard = item.count;
                        break;
                    case("ITEM_SUPER_POTION"):
                        if(data[itemi+1].item_id == "ITEM_HYPER_POTION")
                            discard = item.count;
                        break;
                }
            }

            if(discard != 0 && typeof(discard) == "number"){
                pokemon.discardItem(endpoint, token, ltype, item, discard, function(data){
                    console.log("Discarded " + discard + " " + item.item_id);
                });
            }
        }
    });
    //Evolve pokemon
    pokemon.getPokemonFamilies(endpoint, token, ltype, function(familydatas){
        let familydata = familydatas;
        pokemon.getPokemons(endpoint, token, ltype, function (data) {
            data.sort(function (a, b) { //Sort by cp, evolve high pokemon if it can
                if (a.cp > b.cp) {
                    return -1;
                }
                if (a.cp < b.cp) {
                    return 1;
                }
                // a must be equal to b
                return 0;
            });
            for(let pokemoni in data){
                for(let pokemonsetting in pokemonSettings){
                    let famliyid =  pokemonSettings[pokemonsetting].family_id;
                    for(let family in familydata){
                        if(familydata[family].family_id == famliyid && pokemonSettings[pokemonsetting].pokemon_id == data[pokemoni].pokemon_id){
                            if(typeof(pokemonSettings[pokemonsetting].candy_to_evolve) === "undefined") break;
                            if(familydata[family].candy > pokemonSettings[pokemonsetting].candy_to_evolve){
                                if(data[pokemoni].cp > config.min_cp_evolve)
                                {
                                    console.log("Evolve " + data[pokemoni].pokemon_id);

                                    pokemon.evolvePokemon(endpoint, token, ltype, data[pokemoni], function(evolve){
                                        if(evolve.result == 'SUCCESS')
                                        {
                                            if(typeof(config.pushbullet_key) !== 'undefined' && config.pushbullet_key != '')
                                            {
                                                var evolve_data = evolve.evolved_pokemon_data;
                                                request.post({
                                                    url: 'https://api.pushbullet.com/v2/pushes',
                                                    form: {
                                                        "type": "note",
                                                        "title": "Evolve "+data[pokemoni].pokemon_id,
                                                        "body": "Evolve "+data[pokemoni].pokemon_id+" with CP "+data[pokemoni].cp+" to "+evolve_data.pokemon_id+" with CP "+evolve_data.cp
                                                    },
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': 'Bearer '+config.pushbullet_key
                                                    }
                                                }, function(error, response, body){
                                                    console.log(body);
                                                });
                                            }
                                        }
                                        else {
                                            request.post({
                                                url: 'https://api.pushbullet.com/v2/pushes',
                                                form: {
                                                    "type": "note",
                                                    "title": "Evolve ERROR "+data[pokemoni].pokemon_id,
                                                    "body": "Evolve ERROR"
                                                },
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': 'Bearer '+config.pushbullet_key
                                                }
                                            }, function(error, response, body){
                                                console.log(body);
                                            });
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }
        });
    });
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