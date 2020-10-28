const http = require('http');
const path = require('path');
const sirv = require('sirv');

const DEFAULT_PORT = 3333;

const PORT = process.env.PORT || DEFAULT_PORT;
const HOST = process.env.HOST || 'localhost';

// Create file response handler
module.exports = sirv(path.dirname(module.filename), {
	dev       : true,
	etag      : false,
	dotfiles  : true,
	extensions: [],
	gzip      : false,
	brotli    : false,
	immutable : false,
	single    : false,
	ignores   : false
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
