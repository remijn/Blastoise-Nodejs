var async = require('asyncawait/async');
var await = require('asyncawait/await');
var request = require('request');
var config = require('./config');
var google = require('googleapis');

var tokens = require('./tokens');
var fs = require('fs');

var ClientID = "848232511240-73ri3t7plvk96pj4f85uj8otdat2alem.apps.googleusercontent.com";
var ClientSecret = "NCjF1TLi2CcY6t5mt0ZveuL7";
var Redirect = "urn:ietf:wg:oauth:2.0:oob";

var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(ClientID, ClientSecret, Redirect);

exports = module.exports = {};

exports.hasSession = function(){
    if(typeof tokens.google !== "undefined" && typeof tokens.google.refresh_token !== "undefined"){
        return "google";
    }else{
        return false;
    }
};

exports.refreshGoogle = async(function(){
    oauth2Client.setCredentials(tokens.google);
    var accessToken = await(new Promise(function(resolve, reject){
        oauth2Client.refreshAccessToken(function(err, newtokens){
            if(err) reject(err);
            else{
                resolve(newtokens);
                tokens.google.access_token = newtokens.access_token;
                tokens.google.refresh_token = newtokens.refresh_token;
                fs.writeFileSync('tokens.json', JSON.stringify(tokens));
            }
        });
    }));
    return accessToken.id_token;

});

exports.loginGoogle = function(){
    var scope = [
        "https://www.googleapis.com/auth/userinfo.email"
    ];
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scope
    });
    return url;
};
exports.useGoogleToken = async(function(token){
    var getToken = await(new Promise(function(resolve, reject){
        oauth2Client.getToken(token, function(err, newtokens){
            if(err){
                reject(err);
            }
            oauth2Client.setCredentials(newtokens);
            resolve(newtokens.id_token);
            tokens.google = {};
            tokens.google.access_token = newtokens.access_token;
            tokens.google.refresh_token = newtokens.refresh_token;
            fs.writeFileSync('tokens.json', JSON.stringify(tokens));
        });
    }));
    return getToken;

});