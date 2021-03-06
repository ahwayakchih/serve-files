/* eslint strict: 0 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const test = require('tape');
const needle = require('needle');
const serveFiles = require('../index.js');
const getFileCacheSettings = require('../lib/getFileCacheSettings');

const validateResult = require('./support/validateResult.js');

const TEST_CONTENT = fs.readFileSync(path.join(path.dirname(module.filename), 'support/test.txt'), {encoding: 'utf8'});
const TEST_CONTENT_STATS = fs.statSync(path.join(path.dirname(module.filename), 'support/test.txt'));
const DOCROOT = path.join(path.dirname(module.filename), 'support');

process.chdir(path.dirname(module.filename));

function mockup (requestHandler, callback) {
	var server = http.createServer(requestHandler);
	server.href = null;

	server.listen(0, '127.0.0.1', function () {
		var address = this.address();
		this.href = 'http://' + address.address + ':' + address.port;
		callback(null, this.href);
	});

	server.get = function (path, options, callback) {
		return needle.get(this.href + '/' + path.replace(/^\//, ''), options, callback);
	};

	server.head = function (path, options, callback) {
		return needle.head(this.href + '/' + path.replace(/^\//, ''), options, callback);
	};

	return server;
}

test('Basics', function testBasics (t) {
	t.strictEqual(typeof serveFiles.createFileResponseHandler, 'function', 'serve-files should be a function');

	var serve = serveFiles.createFileResponseHandler();
	t.ok(serve instanceof Function, 'serve-files should return instance of Function');

	// Should call back
	var s = mockup(serve, () => {
		s.get('/', err => {
			s.close();
			t.end(err);
		});
	});
});

const TEST_RESPONSES = {
	'Should return 404 when accessing file outside of document root': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path: '../' + path.basename(module.filename)
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.DENIED
		}
	},
	'Should return 404 when accessing non-existing file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path: 'non-existing.trap'
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.NOT_FOUND
		}
	},
	'Should return 404 when accessing symlink while followSymbolicLinks is disabled': {
		options: {
			documentRoot       : DOCROOT,
			followSymbolicLinks: false
		},
		request: {
			path: 'symlink.txt'
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.DENIED
		}
	},
	'Should return 200 when accessing symlink while followSymbolicLinks is enabled': {
		options: {
			documentRoot       : DOCROOT,
			followSymbolicLinks: true
		},
		request: {
			path: 'symlink.txt'
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.OK,
			body      : TEST_CONTENT,
			headers   : {
				'content-type': 'text/plain; charset=UTF-8'
			}
		}
	},
	'Should return 200 when accessing existing file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path: 'test.txt'
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.OK,
			body      : TEST_CONTENT,
			headers   : {
				'content-type': 'text/plain; charset=UTF-8'
			}
		}
	},
	'Should return 304 when accessing non-modified file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					// Current date guarantees that it will be later than file's mtime
					'if-modified-since': (new Date()).toUTCString()
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.NOT_MODIFIED
		}
	},
	'Should return 412 when accessing no-unmodified file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					// Using date 0 guarantees that it will be later than file's mtime
					'if-unmodified-since': (new Date(0)).toUTCString()
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.WAS_MODIFIED
		}
	},
	'Should return 416 when accessing out of range of a file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					range: 'bytes=' + TEST_CONTENT.length + '-' + (TEST_CONTENT.length + 1)
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.NOT_IN_RANGE,
			body      : '',
			headers   : {
				'content-range': 'bytes */' + TEST_CONTENT.length
			}
		}
	},
	'Should return 206 when accessing first byte of file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					range: 'bytes=0-0'
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.OK_RANGE,
			body      : TEST_CONTENT[0],
			headers   : {
				'content-range': 'bytes 0-0/' + TEST_CONTENT.length
			}
		}
	},
	'Should return 206 when accessing second and third bytes of file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					range: 'bytes=1-2'
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.OK_RANGE,
			body      : TEST_CONTENT.substring(1, 3), // eslint-disable-line
			headers   : {
				'content-range': 'bytes 1-2/' + TEST_CONTENT.length
			}
		}
	},
	'Should return 206 when accessing last byte of file': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					range: 'bytes=-1'
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.OK_RANGE,
			body      : TEST_CONTENT[TEST_CONTENT.length - 1],
			headers   : {
				'content-range': 'bytes ' + (TEST_CONTENT.length - 1) + '-' + (TEST_CONTENT.length - 1) + '/' + TEST_CONTENT.length
			}
		}
	},
	'Should return 206 when accessing range of non-modified file using if-range with non-matching date': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					'range'   : 'bytes=0-0',
					// Current date guarantees that it will not match file's mtime
					'if-range': (new Date()).toUTCString()
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.OK,
			body      : TEST_CONTENT
		}
	},
	'Should return 206 when accessing range of non-modified file using if-range with matching date': {
		options: {
			documentRoot: DOCROOT
		},
		request: {
			path   : 'test.txt',
			options: {
				headers: {
					'range'   : 'bytes=0-0',
					'if-range': TEST_CONTENT_STATS.mtime.toUTCString()
				}
			}
		},
		response: {
			statusCode: serveFiles.HTTP_CODES.OK_RANGE,
			body      : TEST_CONTENT[0],
			headers   : {
				'content-range': 'bytes 0-0/' + TEST_CONTENT.length
			}
		}
	}
};

Object.keys(TEST_RESPONSES).forEach(msg => {
	var clone = JSON.stringify(TEST_RESPONSES[msg]);
	var testFSCache = '';

	// HEAD
	testFSCache = TEST_RESPONSES[`HEAD ${msg}`] = JSON.parse(clone);
	testFSCache.request.method = 'head';
	testFSCache.response.body = '';

	// GET FSCache
	testFSCache = TEST_RESPONSES[`FSCache: ${msg}`] = JSON.parse(clone);
	testFSCache.options = Object.assign(getFileCacheSettings(), testFSCache.options);

	// HEAD
	testFSCache = TEST_RESPONSES[`FSCache: HEAD ${msg}`] = JSON.parse(clone);
	testFSCache.options = Object.assign(getFileCacheSettings(), testFSCache.options);
	testFSCache.request.method = 'head';
	testFSCache.response.body = '';
});

function testResponse (t, data) {
	var method = (data.request && data.request.method) || 'get';
	var serve = serveFiles.createFileResponseHandler(data.options);
	var s = mockup(serve, () => s[method](data.request.path, data.request.options || null, (err, res) => {
		t.ifError(err, 'There should be no error from response');
		if (res.body && res.body instanceof Buffer) {
			res.body = res.body.toString();
		}

		validateResult(t, data.response, res);

		s.close();
		s = null;

		t.end();
	}));
}

Object.keys(TEST_RESPONSES).forEach(msg => test(msg, t => testResponse(t, TEST_RESPONSES[msg])));
