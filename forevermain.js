var forever = require('forever-monitor');

var child = new (forever.Monitor)('main.js', {
    max: 20,
    silent: false,
    args: []
});

child.on('exit', function () {
    console.log('main.js has exited after 20 restarts');
});

child.start();