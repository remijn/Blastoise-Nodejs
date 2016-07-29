var pokedex = require('./pokedexjson');
exports = module.exports = {};

exports.getPokemon = function(pokemonname){
    var pokemons = pokedex.pokemon;
    for(pokemon in pokemons){
        if(pokemons[pokemon].name.toUpperCase().indexOf(pokemonname.replace("_", " ")) != -1){
            return pokemons[pokemon];
        }
    }
    console.log('no pokemon');
};