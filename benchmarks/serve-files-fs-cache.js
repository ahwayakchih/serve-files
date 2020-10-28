const http = require('http');
const path = require('path');
const serveFiles = require('../index');
const getFileCacheSettings = require('../lib/getFileCacheSettings');

const DEFAULT_PORT = 3333;
const DEFAULT_HTTP_CACHE = 3600;

const PORT = process.env.PORT || DEFAULT_PORT;
const HOST = process.env.HOST || '127.0.0.1';

// Create file response handler
module.exports = serveFiles.createFileResponseHandler(Object.assign(getFileCacheSettings(), {
	followSymbolicLinks: false,
	cacheTimeInSeconds : DEFAULT_HTTP_CACHE,
	documentRoot       : path.dirname(module.filename)
}));

if (require.main === module) {
	// Create server
	http.createServer(module.exports).listen(PORT, HOST, null, function onListening () {
		const address = this.address(); // eslint-disable-line no-invalid-this

		if (process.send) {
			process.send({port: address.port, host: address.host});
		}
	});
}
