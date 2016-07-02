/* global gc */
/* eslint strict: 0 */
'use strict';

const path = require('path');
const serveFiles = require('../index.js');
const heapdump = require('heapdump');

function fakeServe (callback) {
	var cfg = serveFiles.createConfiguration({
		documentRoot: path.dirname(module.filename)
	});

	serveFiles.getFileStats(cfg, module.filename, (err, fileStats) => {
		var data;

		if (err || !fileStats) {
			data = {
				statusCode: serveFiles.HTTP_CODES.NOT_FOUND
			};
		}
		else {
			data = cfg.getFile(fileStats, {});
		}

		data.headers = serveFiles.appendCacheHeaders(data.headers || {}, cfg.cacheTimeInSeconds);
		data.headers.Date = data.headers.Date || (new Date()).toUTCString();

		if (data.body && data.body.pipe) {
			data.body.on('end', callback);
			data.body.push(null);
		}
		else {
			callback();
		}
	});
}

if (typeof gc !== 'function') {
	console.error('`gc` function is missing. Make sure to run this test with `--expose-gc` option passed to node.');
	process.exit(1);
}

var i = 0;
function next () {
	if (++i < 10000) {
		return fakeServe(next);
	}

	setTimeout(function () {
		gc();
		heapdump.writeSnapshot('reports/test-memory-1.heapsnapshot');
	}, 100);
}

gc();
heapdump.writeSnapshot('reports/test-memory-0.heapsnapshot');

next();
