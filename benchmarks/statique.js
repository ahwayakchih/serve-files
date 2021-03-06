const http = require('http');
const path = require('path');
const Statique = require('statique');

const DEFAULT_PORT = 3333;
const DEFAULT_HTTP_CACHE = 3600;

const PORT = process.env.PORT || DEFAULT_PORT;
const HOST = process.env.HOST || '127.0.0.1';

// Create file response handler
var fileResponse = new Statique({
	root : path.dirname(module.filename),
	cache: DEFAULT_HTTP_CACHE
});

module.exports = fileResponse.serve.bind(fileResponse);
if (require.main === module) {
	// Create server
	http.createServer(module.exports).listen(PORT, HOST, null, function onListening () {
		const address = this.address(); // eslint-disable-line no-invalid-this

		if (process.send) {
			process.send({port: address.port, host: address.host});
		}
	});
}
