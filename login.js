var request = require('request');
var config = require('./config');
var google = require('googleapis');

var tokens = require('./tokens');
var fs = require('fs');

exports = module.exports = {};

exports.headers = {
    "User-Agent": "niantic"
};

exports.login_pokemon = function(usr, pass, callback){
    console.log("Logging in as: " + usr);

    //Initiate session And fill cookie jar
    request.get({
        url: config.login_url,
        headers: this.headers,
        jar: this.jar
    }, function(error, response, body){
        console.log(JSON.parse(body));
        request.post({
            url: config.login_url,
            headers: this.headers,
            jar: this.jar,
            form: {
                username: usr,
                password: pass
            }
        }, function(error1, response1, body1){
            console.log(response);
        })
    });

    var options = {
        url: config.login_url,
        jar: this.jar,
        headers: this.headers,
        qs: {

        }

    }
};

exports.login_google = function(cal){
    var OAuth2 = google.auth.OAuth2;
    var oauth2Client = new OAuth2(
        "848232511240-73ri3t7plvk96pj4f85uj8otdat2alem.apps.googleusercontent.com", //ClientID
        "NCjF1TLi2CcY6t5mt0ZveuL7", //Client Secret
        "urn:ietf:wg:oauth:2.0:oob"); //Redirect URL

    if(tokens.refresh_token != ""){
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