const http = require('http');
const path = require('path');
const serveStatic = require('serve-static');

const DEFAULT_PORT = 3333;
const DEFAULT_HTTP_CACHE = 3600;

const PORT = process.env.PORT || DEFAULT_PORT;
const HOST = process.env.HOST || '127.0.0.1';

// Create file response handler
module.exports = serveStatic(path.dirname(module.filename), {
	// Try to disable features that are not supported by serve-files in hope for more "fair" comparison
	acceptRanges: true,
	cacheControl: true,
	dotfiles    : 'allow',
	etag        : false,
	extensions  : false,
	fallthrough : false,
	index       : false,
	lastModified: true,
	maxAge      : DEFAULT_HTTP_CACHE,
	redirect    : false
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
