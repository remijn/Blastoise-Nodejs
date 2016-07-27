var pokedex = require('./pokedexjson');
exports = module.exports = {};

exports.getPokemon = function(pokemonname){
    var pokemons = pokedex.pokemon;
    for(pokemon in pokemons){
        if(pokemons[pokemon].name.toUpperCase() == pokemonname){
            return pokemons[pokemon];
        }
    }

};