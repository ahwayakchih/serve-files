const http = require('http');
const path = require('path');
const st = require('st');

const DEFAULT_PORT = 3333;
const DEFAULT_HTTP_CACHE = 3600;

const PORT = process.env.PORT || DEFAULT_PORT;
const HOST = process.env.HOST || 'localhost';

const KILOBYTE = 1024;

// Create file response handler
module.exports = st({
	path : path.dirname(module.filename),
	cache: {
		fd: {
			max   : KILOBYTE,
			maxAge: DEFAULT_HTTP_CACHE
		},
		stat: {
			max   : KILOBYTE,
			maxAge: DEFAULT_HTTP_CACHE
		},
		content: {
			max   : KILOBYTE * KILOBYTE,
			maxAge: DEFAULT_HTTP_CACHE
		}
	},
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
			process.send({port: address.port});
		}
	});
}
