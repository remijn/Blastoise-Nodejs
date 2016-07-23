var request = require('request');
var config = require('./config');
var google = require('googleapis');

var tokens = require('./tokens');
var fs = require('fs');

exports = module.exports = {};

exports.headers = {
    "User-Agent": "niantic"
};

// exports.login_pokemon = function(usr, pass, cal){
//     console.log("Logging in as: " + usr);
//
//     //Initiate session And fill cookie jar
//     request.get({
//         url: config.login_url_pokemon,
//         headers: {
//             'User-Agent': 'niantic'
//         }
//     }, function(error, response, body){
//         var data;
//
//         try {
//             data = JSON.parse(body);
//         }catch(err){
//             console.log(err);
//             // return cal(err, null);
//         }
//
//         console.log(data);
//         console.log('test');
// return false;
//         request.post({
//             url: config.login_url_pokemon,
//             form: {
//                 'lt': data.lt,
//                 'execution': data.execution,
//                 '_eventId': 'submit',
//                 'username': '',
//                 'password': ''
//             },
//             headers: {
//                 'User-Agent': 'niantic'
//             }
//         }, function(error, response, body){
//             if(error) {
//                 return cal(error, null);
//             }
//
//             if (body) {
//                 var parsedBody = JSON.parse(body);
//
//                 if (parsedBody.errors && parsedBody.errors.length !== 0) {
//                     return cal(new Error('Error logging in: ' + parsedBody.errors[0]), null);
//                 }
//             }
//
//             var ticket = response.headers['location'].split('ticket=')[1];
// console.log(response.headers);
//             return false;
//             request.post({
//                 url: config.login_url_auth_pokemon,
//                 headers: this.headers,
//                 form: {
//                     'client_id': 'mobile-app_pokemon-go',
//                     'redirect_uri': 'https://www.nianticlabs.com/pokemongo/error',
//                     'client_secret': 'w8ScCUXJQc6kXKw8FiOhd8Fixzht18Dq3PEVkUCP5ZPxtgyWsbTvWHFLm2wNY0JR',
//                     'grant_type': 'refresh_token',
//                     'code': ticket
//                 }
//             }, function(error, response, body){
//                 var token;
//
//                 if(error) {
//                     return cal(error, null);
//                 }
//
//                 console.log(response);
//                 console.log(body);
//
//                 token = body.split('token=')[1];
//                 if(!token) {
//                     return cal(new Error('Login failed'), null);
//                 }
//
//                 token = token.split('&')[0];
//
//                 if (!token) {
//                     return cal(new Error('Login failed'), null);
//                 }
//
//                 console.log('[i] Session token: ' + token);
//                 cal(null, token);
//             });
//         })
//     });

    // return false;

    // var options = {
    //     url: config.login_url,
    //     jar: this.jar,
    //     headers: this.headers,
    //     qs: {
    //
    //     }
    //
    // }
// };

exports.login_google = function(cal){
    var OAuth2 = google.auth.OAuth2;
    var oauth2Client = new OAuth2(
        "848232511240-73ri3t7plvk96pj4f85uj8otdat2alem.apps.googleusercontent.com", //ClientID
        "NCjF1TLi2CcY6t5mt0ZveuL7", //Client Secret
        "urn:ietf:wg:oauth:2.0:oob"); //Redirect URL

    if(tokens.refresh_token != "" && typeof(tokens.refresh_token) !== "undefined"){
        oauth2Client.setCredentials(tokens);
        oauth2Client.refreshAccessToken(function(err, tokens){
            if(err) console.error(err);
            // console.log(tokens);
            cal(tokens.id_token);
            fs.writeFileSync('tokens.json', JSON.stringify({access_token: tokens.access_token, refresh_token: tokens.refresh_token}));
        });
        console.log('refresh token found');
        return;
    }

    var scopes = [
        "https://www.googleapis.com/auth/userinfo.email"
    ];
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    });

    console.log(url);
    var readline = require('readline');

    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question("paste the activation code here: ", function(answer){
        console.log(answer);
        rl.close();
        oauth2Client.getToken(answer, function(err, tokens){
            if(err){
                console.error(err);
                return;
            }
            oauth2Client.setCredentials(tokens);
            console.log(tokens);
            fs.writeFileSync('tokens.json', JSON.stringify({access_token: tokens.access_token, refresh_token: tokens.refresh_token}));
            cal(tokens.id_token);
        });
    });
};