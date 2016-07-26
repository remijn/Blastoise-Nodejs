var async = require('asyncawait/async');
var await = require('asyncawait/await');
var fs = require("fs");
var p = require("protobufjs");
var ByteBuffer = require('bytebuffer');
var config = require('./config');
var request = require('request');
var long = require('long');
var proto = require('pokemongo-protobuf');
var pb = require('node-protobuf');
var encounter = new pb(fs.readFileSync('messages.desc'));

var s2 = require('s2geometry-node');

module.exports = exports = {};

exports.coords = {
    latitude: 0,
    longitude: 0,
    altitude: 0
};

exports.ltype = "";
exports.token = "";
exports.url = config.api_url;

exports.init = async(function(){
    this.url = await(this.api_endpoint());
});

exports.api_req = async(function(req, filename){
    var self = this;
    var coords = this.coords;

    var envelop = {};

    envelop.status_code = 2;
    envelop.request_id = long.fromString("1469378659230941192");
    envelop.requests = req;
    envelop.latitude = coords.latitude;
    envelop.longitude = coords.longitude;
    envelop.altitude = coords.altitude;
    envelop.auth_info = {};
    envelop.auth_info.provider = this.ltype;
    envelop.auth_info.token = {};
    envelop.auth_info.token.contents = this.token;
    envelop.auth_info.token.unknown2 = 59;
    envelop.unknown12 = 989;

    var buf = proto.serialize(envelop, "POGOProtos.Networking.Envelopes.RequestEnvelope");

    if(typeof filename !== "undefined") fs.writeFileSync('req'+filename, buf);

    var response = await(new Promise(function(resolve, reject){
        try{
            request.post(exports.url, {
                body: buf,
                encoding: null,
                headers: {
                    'User-Agent': 'Niantic App'
                }
            }, function(error, response, data){
                if(error){
                    reject(error);
                }
                var buffer = new Buffer(data);
                try{
                    if(buffer.toString().indexOf('Server Error') != -1){
                        console.error("Server Error");
                        reject("Server Error");
                    }else{

                    }
                    if(typeof filename !== "undefined") fs.writeFileSync('res'+filename, buffer);
                    var result = proto.parse(buffer, "POGOProtos.Networking.Envelopes.ResponseEnvelope");
                }catch(e){
                    if(e.decoded){
                        console.log(e.decoded);
                    }
                    console.error(e);
                }
                if((typeof(result.returns) === "undefined" || result.returns.length == 0) && typeof result.api_url === "undefined"){
                    reject("nothing was returned");
                }else{
                    resolve(result);
                }
            });
        }catch(e){
            reject(e);
        }

    }));
    return response;

});

exports.api_endpoint = async(function(){
    var self = this;
    var envelope = [
        {
            request_type: "GET_PLAYER"
        },
        {
            request_type: "GET_HATCHED_EGGS"
        },
        {
            request_type: "GET_INVENTORY"
        },
        {
            request_type: "CHECK_AWARDED_BADGES"
        },
        {
            request_type: "DOWNLOAD_SETTINGS"
        }
    ];
    var returndata = await (this.api_req(envelope));
    if(!returndata.api_url){
        // await(self.api_endpoint());
        console.error("Api url is not specified")
    }else{
        return "https://"+returndata.api_url+"/rpc";
    }
});

exports.getProfile = function(endpoint, access_token, ltype, callback){
    var requests = [
        {
            request_type: "GET_PLAYER"
        }
    ];
    this.api_req(endpoint, access_token, requests, ltype, function(data){
        callback(proto.parse(data.returns[0], "POGOProtos.Networking.Responses.GetPlayerResponse"));
    });
};
exports.spinPokestop = async (function(pokestop){
    let requests = [
        {
            request_type: "FORT_SEARCH",
            request_message: proto.serialize({
                fort_id: pokestop.id,
                player_latitude: this.coords.latitude,
                player_longitude: this.coords.longitude,
                fort_latitude: pokestop.latitude,
                fort_longitude: pokestop.longitude
            }, "POGOProtos.Networking.Requests.Messages.FortSearchMessage")
        },
        {
            request_type: "GET_PLAYER"
        }
    ];

    let data = await(this.api_req(requests));
    return proto.parse(data.returns[0], "POGOProtos.Networking.Responses.FortSearchResponse");
});
exports.getInventory = async(function(endpoint, access_token, ltype, callback){
    var requests = [
        {
            request_type: "GET_INVENTORY",
        }
    ];
    var data = await(this.api_req(requests));
    return proto.parse(data.returns[0], "POGOProtos.Networking.Responses.GetInventoryResponse");
});
exports.getPlayerStats = function(endpoint, access_token, ltype, callback) {
    this.getInventory(endpoint, access_token, ltype, function (data) {
        for(var itemi = 0;itemi<data.inventory_delta.inventory_items.length;itemi++){
            var item = data.inventory_delta.inventory_items[itemi];
            if(typeof(item.inventory_item_data.player_stats) !== "undefined"){
                callback(item.inventory_item_data.player_stats);
            }
        }
    })
};
exports.getPokemons = function(endpoint, access_token, ltype, callback){
    this.getInventory(endpoint, access_token, ltype, function (data) {
        var pokemons = [];
        for(var itemi = 0;itemi<data.inventory_delta.inventory_items.length;itemi++){
            var item = data.inventory_delta.inventory_items[itemi];
            if(typeof(item.inventory_item_data.pokemon_data) !== "undefined" && item.inventory_item_data.pokemon_data.is_egg != true){
                pokemons.push(item.inventory_item_data.pokemon_data);
            }
        }
        callback(pokemons);
    })
};
exports.downloadItemTemplates = function(endpoint, access_token, ltype, callback){
    var requests = [
        {
            request_type: "DOWNLOAD_ITEM_TEMPLATES"
        }
    ];
    this.api_req(endpoint, access_token, requests, ltype, function(data){
        // console.log(data);
        var response = proto.parse(data.returns[0], "POGOProtos.Networking.Responses.DownloadItemTemplatesResponse");
        callback(response);
    });
};
exports.getPokemonSettings = function(endpoint, access_token, ltype, callback){
    this.downloadItemTemplates(endpoint, access_token, ltype, function(data){
        var pokemons = [];
        for(var itemi = 0;itemi<data.item_templates.length;itemi++){
            var item = data.item_templates[itemi];
            if(typeof(item.pokemon_settings) !== "undefined"){
                pokemons.push(item.pokemon_settings);
            }
        }
        callback(pokemons);
    });
};
exports.getPokedex = function(endpoint, access_token, ltype, callback){
    this.getInventory(endpoint, access_token, ltype, function (data) {
        var pokemons = [];
        for(var itemi = 0;itemi<data.inventory_delta.inventory_items.length;itemi++){
            var item = data.inventory_delta.inventory_items[itemi];
            if(typeof(item.inventory_item_data.pokedex_entry) !== "undefined"){
                pokemons.push(item.inventory_item_data.pokedex_entry);
            }
        }
        callback(pokemons);
    })
};
exports.getItems = async(function(){
    let inventory = await(this.getInventory());
    let items = [];
    for(var itemi = 0;itemi<inventory.inventory_delta.inventory_items.length;itemi++){
        let item = inventory.inventory_delta.inventory_items[itemi];
        if(typeof(item.inventory_item_data.item) !== "undefined"){
            items.push(item.inventory_item_data.item);
        }
    }
    return items;
});
exports.getPokemonFamilies = function(endpoint, access_token, ltype, callback){
    this.getInventory(endpoint, access_token, ltype, function (data) {
        var items = [];
        for(var itemi = 0;itemi<data.inventory_delta.inventory_items.length;itemi++){
            var item = data.inventory_delta.inventory_items[itemi];
            if(typeof(item.inventory_item_data.pokemon_family) !== "undefined"){
                items.push(item.inventory_item_data.pokemon_family);
            }
        }
        callback(items);
    })
};
exports.transferPokemon = function(endpoint, access_token, ltype, pokemon, callback){
    if(typeof(pokemon.id) === "undefined") return;
    var id = long.fromString(pokemon.id);
    var idarr = [id.getHighBitsUnsigned(), id.getLowBitsUnsigned()];
    var requests = [
        {
            request_type: "RELEASE_POKEMON",
            request_message: proto.serialize({
                pokemon_id: idarr
            }, "POGOProtos.Networking.Requests.Messages.ReleasePokemonMessage")
        }
    ];

    this.api_req(endpoint, access_token, requests, ltype, function(data){
        // console.log(data);
        var response = proto.parse(data.returns[0], "POGOProtos.Networking.Responses.ReleasePokemonResponse");
        callback(response);
    });
};
exports.evolvePokemon = function(endpoint, access_token, ltype, pokemon, callback){
    var requests = [
        {
            request_type: "EVOLVE_POKEMON",
            request_message: proto.serialize({
                pokemon_id: pokemon.id
            }, "POGOProtos.Networking.Requests.Messages.EvolvePokemonMessage")
        }
    ];
    this.api_req(endpoint, access_token, requests, ltype, function(data){
        // console.log(data);
        var response = proto.parse(data.returns[0], "POGOProtos.Networking.Responses.EvolvePokemonResponse");
        callback(response);
    });
};
exports.discardItem = function(endpoint, access_token, ltype, item, count, callback){
    var requests = [
        {
            request_type: "RECYCLE_INVENTORY_ITEM",
            request_message: proto.serialize({
                item_id: item.item_id,
                count: count
            }, "POGOProtos.Networking.Requests.Messages.RecycleInventoryItemMessage")
        }
    ];
    this.api_req(endpoint, access_token, requests, ltype, function(data){
        // console.log(data);
        var response = proto.parse(data.returns[0], "POGOProtos.Networking.Responses.GetInventoryResponse");
        callback(response);
    });
};
exports.catchPokemon = async (function(pokemon, ball){
    var requests = [
        {
            request_type: "CATCH_POKEMON",
            request_message: encounter.serialize({
                encounter_id: pokemon.wild_pokemon.encounter_id,
                pokeball: ball,
                normalized_reticle_size: 1.95,
                spawn_point_guid: pokemon.wild_pokemon.spawn_point_id,
                hit_pokemon: true,
                spin_modifier: 1,
                normalized_hit_position: 1,
            }, "Catch")
        }
    ];

    let data = await(this.api_req(requests));
    // console.log(data);
    var response = proto.parse(data.returns[0], "POGOProtos.Networking.Responses.CatchPokemonResponse");
    return response;
});

exports.encounter = async(function(pokemon){
    if(typeof(pokemon) !== 'undefined') {
        let encountermessage = {
            encounter_id: pokemon.encounter_id,
            spawn: pokemon.spawn_point_id,
            player_latitude: this.coords.latitude,
            player_longitude: this.coords.longitude,
        };

        var encounterbuffer = encounter.serialize(encountermessage, "Encounter");
        var requests = [
            {
                request_type: "ENCOUNTER",
                request_message: encounterbuffer
            }
        ];
        var data = await(this.api_req(requests));
        var response = proto.parse(data.returns[0], "POGOProtos.Networking.Responses.EncounterResponse");
        return response;
    }
});
exports.Heartbeat = async (function(){
    var nullbytes = new Buffer(21);
    nullbytes.fill(0);

    var walk = getNeighbors(this.coords.latitude, this.coords.longitude).sort(function (a, b) {
        return a > b;
    });

    var buffer = new ByteBuffer(21 * 10).LE();
    walk.forEach(function (elem) {
        buffer.writeVarint64(elem);
    });

    var requests = [
        {
            request_type: "GET_MAP_OBJECTS",
            request_message: proto.serialize({
                cell_id: walk,
                since_timestamp_ms: nullbytes,
                latitude: this.coords.latitude,
                longitude: this.coords.longitude
            }, "POGOProtos.Networking.Requests.Messages.GetMapObjectsMessage")
        },
        {
            request_type: "GET_HATCHED_EGGS"
        },
        {
            request_type: "GET_INVENTORY",
            request_message: proto.serialize({
                last_timestamp_ms: Date.now().toString()
            }, "POGOProtos.Networking.Requests.Messages.GetInventoryMessage")
        },
        {
            request_type: "CHECK_AWARDED_BADGES"
        },
        {
            request_type: "DOWNLOAD_SETTINGS"
        }
    ];
    let data = await(this.api_req(requests, 'heartbeat.bin'));
    return proto.parse(data.returns[0], "POGOProtos.Networking.Responses.GetMapObjectsResponse");
});

function getNeighbors(lat, lng) {
    var origin = new s2.S2CellId(new s2.S2LatLng(lat, lng)).parent(15);
    var walk = [origin.id()];
    // 10 before and 10 after
    var next = origin.next();
    var prev = origin.prev();
    for (var i = 0; i < 10; i++) {
        // in range(10):
        walk.push(prev.id());
        walk.push(next.id());
        next = next.next();
        prev = prev.prev();
    }
    return walk;
}
