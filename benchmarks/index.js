const benchmark   = require('benchmark').Suite;
const results     = require('beautify-benchmark');
const needle      = require('needle');
const async       = require('async');
const http        = require('http');
const path        = require('path');
const os          = require('os');

const serveFiles  = require('../index.js');
const serveStatic = require('serve-static');
const Statique    = require('statique');

if (process.env.INFO) {
	logInfo();
}

const files = parseInt(process.env.FILES || 1, 10);

const test = benchmark('serve-files');

var server;
var filename = path.basename(module.filename);

test.add('serve-static', {
	defer: true,
	setup: function () {
		var send = serveStatic(path.dirname(module.filename), {
			// Try to disable features that are not supported by serve-files in hope for more "fair" comparison
			acceptRanges: true,
			cacheControl: true,
			dotfiles    : 'allow',
			etag        : false,
			extensions  : false,
			fallthrough : false,
			index       : false,
			lastModified: true,
			maxAge      : 0,
			redirect    : false
		});
		server.on('request', function (req, res) {
			send(req, res, function (err) {
				console.error('Nothing was served', err);
			});
		});
	},
	fn: function (deferred) {
		var tasks = [];

		for (var i = files; i > 0; i--) {
			tasks.push(fakeTask());
		}

		async.parallel(tasks, err => {
			if (err) {
				console.error(err);
			}

			return deferred.resolve();
		});
	},
	teardown: function () {
		server.removeAllListeners('request');
	}
});

test.add('statique', {
	defer: true,
	setup: function () {
		var send = new Statique({
			root : path.dirname(module.filename),
			cache: 0
		});
		server.on('request', send.serve.bind(send));
	},
	fn: function (deferred) {
		var tasks = [];

		for (var i = files; i > 0; i--) {
			tasks.push(fakeTask());
		}

		async.parallel(tasks, err => {
			if (err) {
				console.error(err);
			}

			return deferred.resolve();
		});
	},
	teardown: function () {
		server.removeAllListeners('request');
	}
});

test.add('serve-files', {
	defer: true,
	setup: function () {
		server.on('request', serveFiles.createFileResponseHandler({
			documentRoot       : path.dirname(module.filename),
			followSymbolicLinks: false,
			cacheTimeInSeconds : 0
		}));
	},
	fn: function (deferred) {
		var tasks = [];

		for (var i = files; i > 0; i--) {
			tasks.push(fakeTask());
		}

		async.parallel(tasks, err => {
			if (err) {
				console.error(err);
			}

			return deferred.resolve();
		});
	},
	teardown: function () {
		server.removeAllListeners('request');
	}
});

test.on('start', function () {
	console.log(`Test of serving ${files} files in parallel`);
	console.log('');
});

test.on('cycle', function (event) {
	results.add(event.target);
});

test.on('complete', function () {
	results.store.sort((a, b) => b.hz - a.hz);
	results.log();
	server.close();
});

server = createTestServer(() => test.run({
	async: false
}));

/**
 * Show info about environment and tested packages.
 *
 * @private
 */
function logInfo () {
	console.log(`Running on node ${process.version} with ${os.cpus()[0].model} x ${os.cpus().length}`);
	console.log('');
	console.log('Testing:');

	var columns = columnsCreate(['name', 'version', 'homepage']);

	var infoStatic = require('serve-static/package.json');
	infoStatic.version = 'v' + infoStatic.version;
	columnsUpdate(columns, infoStatic);

	var infoStatique = require('statique/package.json');
	infoStatique.version = 'v' + infoStatique.version;
	columnsUpdate(columns, infoStatique);

	var infoFiles = require('../package.json');
	infoFiles.version = 'v' + infoFiles.version;
	columnsUpdate(columns, infoFiles);

	console.log('- ' + columnsText(columns, infoStatic));
	console.log('- ' + columnsText(columns, infoStatique));
	console.log('- ' + columnsText(columns, infoFiles));
	console.log('');

	function columnsCreate (names) {
		return names.map(name => {
			return {size: 0, source: name};
		});
	}

	function columnsUpdate (columns, info) {
		var size;
		var col;
		for (var i = 0; i < columns.length; i++) {
			col = columns[i];
			size = (info[col.source] && info[col.source].length) || 0;
			if (info[col.source] && (size = info[col.source].length) && size > col.size) {
				col.size = size;
			}
		}
	}

	function columnsText (columns, info) {
		var result = '';

		for (var i = 0; i < columns.length; i++) {
			result += columnText(columns[i], info);
			result += ' ';
		}

		return result + ' ';
	}

	function columnText (column, info) {
		var value = info[column.source] || '';
		var padSize = column.size - value.length;
		var pad = '';

		if (padSize) {
			pad += (new Array(padSize + 1)).join(' ');
		}

		return value + pad;
	}
}

/**
 * Prepare test server
 */
function createTestServer (callback) {
	var server = http.createServer();
	server.href = null;

	server.listen(0, 'localhost', function () {
		var address = this.address();
		this.href = 'http://' + address.address + ':' + address.port;
		callback(null, this.href);
	});

	server.get = function (path, options, callback) {
		return needle.get(this.href + '/' + path.replace(/^\//, ''), options, callback);
	};

	return server;
}

/**
 * Fake task, that simply calls back asynchronously.
 *
 * @private
 */
function fakeTask () {
	return callback => server.get(filename, (err, res) => callback(err, res));
}
