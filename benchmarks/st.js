const http = require('http');
const path = require('path');
const st = require('st');

const DEFAULT_PORT = 3333;

const PORT = process.env.PORT || DEFAULT_PORT;
const HOST = process.env.HOST || '127.0.0.1';

// Create file response handler
module.exports = st({
	path       : path.dirname(module.filename),
	cache      : false,
	index      : false,
	dot        : true,
	passthrough: false,
	gzip       : false,
	cors       : true
});

if (require.main === module) {
	// Create server
	http.createServer(module.exports).listen(PORT, HOST, null, function onListening () {
		const address = this.address(); // eslint-disable-line no-invalid-this

		if (process.send) {
			process.send({port: address.port, host: address.host});
		}
	});
}
