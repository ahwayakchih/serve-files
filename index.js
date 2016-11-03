/* eslint strict: 0 */
'use strict';

const path = require('path');
const url = require('url');
const fs = require('fs');
const os = require('os');

const mime = require('./lib/MIME.js');

/**
 * @module serve-files
 */

/**
 * List of HTTP status codes used by this module.
 */
/* eslint-disable */
const HTTP_CODES = {
	OK          : 200,
	OK_RANGE    : 206,
	NOT_MODIFIED: 304,
	NOT_FOUND   : 404,
	WAS_MODIFIED: 412,
	NOT_IN_RANGE: 416,
	SERVER_ERROR: 500
};
/* eslint-enable */

/*
 * Exports
 */
module.exports = {
	HTTP_CODES,
	createFileResponseHandler,
	createConfiguration,
	getFilePath,
	getFileStats,
	getResponseData,
	getResponseDataRanges,
	getResponseDataWhole,
	appendCacheHeaders,
	prepareFileResponse,
	serveFileResponse
};

/**
 * Configuration object.
 *
 * @typedef {Object} configuration
 * @property {boolean}    followSymbolicLinks=false
 * @property {number}     cacheTimeInSeconds=0
 * @property {string}     documentRoot=process.cwd()
 * @property {string}     parsedURLName='urlParsed'
 * @property {Function}   getFilePath
 * @property {Function}   getFileStats
 * @property {Function}   getResponseData
 * @property {Function[]} standardResponses=null
 */

/**
 * Prepare configuration object.
 *
 * @param {Object} options   Check properties of {@link module:serve-files~configuration}
 * @return {module:serve-files~configuration}
 */
function createConfiguration (options) {
	const cfg = Object.assign({
		followSymbolicLinks: false,
		cacheTimeInSeconds : 0,
		documentRoot       : process.cwd(),
		parsedURLName      : 'urlParsed',
		getFilePath        : getFilePath,
		getFileStats       : getFileStats,
		getResponseData    : getResponseData,
		standardResponses  : null
	}, options);

	try {
		let root = fs.realpathSync(cfg.documentRoot);
		cfg.documentRootReal = root;
	}
	catch (e) {
		return e;
	}

	return cfg;
}

/**
 * HTTP request
 *
 * @external "http.IncomingMessage"
 * @see {@link https://nodejs.org/api/http.html#http_http_incomingmessage}
 */

/**
 * Returns requested file path.
 *
 * @param {!module:serve-files~configuration} cfg
 * @param {!external:"http.IncomingMessage"}  req
 */
function getFilePath (cfg, req) {
	const urlParsed = req[cfg.parsedURLName] || url.parse(req.url);
	return path.join(cfg.documentRoot, (urlParsed.pathname || '/'));
}

/**
 * Calls back with error or null and fs.Stats object as second parameter.
 * fs.Stats object is extended with `path` property.
 *
 * @param {!module:serve-files~configuration} cfg
 * @param {!string}                           cfg.documentRootReal
 * @param {string}                            [cfg.followSymbolicLinks=false]
 * @param {!string}                           filePath
 * @param {@Function}                         callback
 */
function getFileStats (cfg, filePath, callback) {
	fs.realpath(filePath, function (err, realpath) {
		// On Windows we can get different cases for the same disk letter :/.
		let checkPath = realpath;
		if (os.platform() === 'win32' && realpath) {
			checkPath = realpath.toLowerCase();
		}

		if (err || checkPath.indexOf(cfg.documentRootReal) !== 0) {
			return callback(err || new Error('Access denied'));
		}

		fs[cfg.followSymbolicLinks ? 'stat' : 'lstat'](filePath, function (err, stats) {
			if (err || !stats.isFile()) {
				return callback(err || new Error('Access denied'));
			}

			stats.path = realpath;

			callback(null, stats);
		});
	});
}

/**
 * File stats
 *
 * @external "fs.Stats"
 * @see {@link https://nodejs.org/api/fs.html#fs_class_fs_stats}
 */

/**
 * Readable stream
 *
 * @external "stream.Readable"
 * @see {@link https://nodejs.org/api/stream.html#stream_class_stream_readable}
 */

/**
 * Response data
 *
 * @typedef {Object} responseData
 * @property {number}                            statusCode
 * @property {string|external:"stream.Readable"} [body]
 * @property {Object}                            [headers]
 */

/**
 * Creates responseData object.
 *
 * It takes into account `If-Modified-Since` and `If-Unmodified-Since` request headers. When one of them
 * matches, no body will be set on resulting responseData, just a statusCode and required headers (if any).
 *
 * It calls either `getResponseDataRanges` or `getResponseDataWhole` depending on request `Range` header.
 *
 * @param {!external:"fs.Stats"} fileStats
 * @param {!string}              fileStats.path                  path to the file in local filesystem
 * @param {!Date}                fileStats.mtime                 date of last modification of file content
 * @param {!Number}              fileStats.size                  number of bytes of data file contains
 * @param {!Object}              headers                         headers from request object (@see {@link http.IncomingMessage})
 * @param {string}               [headers.if-modified-since]
 * @param {string}               [headers.if-unmodified-since]
 * @param {string}               [headers.if-range]
 * @param {string}               [headers.range]
 * @return {module:serve-files~responseData}
 */
function getResponseData (fileStats, headers) {
	var mtimeRounded = Math.round(fileStats.mtime / 1000);

	// Remove milliseconds and round because date from HTTP header does not contain milliseconds, but mtime does.
	if (headers['if-modified-since'] && mtimeRounded <= Math.round(new Date(headers['if-modified-since']) / 1000)) {
		return {
			statusCode: HTTP_CODES.NOT_MODIFIED
		};
	}

	// Remove milliseconds and round because date from HTTP header does not contain milliseconds, but mtime does.
	if (headers['if-unmodified-since'] && mtimeRounded >= Math.round(new Date(headers['if-unmodified-since']) / 1000)) {
		return {
			statusCode: HTTP_CODES.WAS_MODIFIED,
			headers   : {
				'Last-Modified': fileStats.mtime.toUTCString()
			}
		};
	}

	if (headers.range) {
		return getResponseDataRanges(fileStats, headers);
	}

	return getResponseDataWhole(fileStats, headers);
}

/**
 * Creates responseData object with body set to readable stream of requested file range(s).
 *
 * @todo: Implement support for multiple ranges (multipart/byteranges)
 *
 * @param {!external:"fs.Stats"} fileStats
 * @param {!string}              fileStats.path    path to the file in local filesystem
 * @param {!Date}                fileStats.mtime   date of last modification of file content
 * @param {!Number}              fileStats.size    number of bytes of data file contains
 * @param {!Object}              headers
 * @return {module:serve-files~responseData}
 */
function getResponseDataRanges (fileStats, headers) {
	if (!headers.range) {
		return getResponseDataWhole(fileStats, headers);
	}

	const maxEnd = Math.max(fileStats.size - 1, 0);
	var start = headers.range.replace(/^bytes=/, '').match(/(-?[^-]+)(?:-(.+)|)/) || [];
	var end = Math.min(parseInt(start[1 + 1] || maxEnd, 10) || 0, maxEnd);

	start = parseInt(start[1] || 0, 10) || 0;

	if (start < 0) {
		start = Math.max(maxEnd + start + 1, 0);
		end = maxEnd;
	}

	if (headers['if-range']) {
		var ifRange = headers['if-range'];
		// @todo: add support for ETag matching
		if (ifRange.match(/^(?:"|W\\)/) || Math.round(fileStats.mtime / 1000) !== Math.round(new Date(ifRange) / 1000)) {
			start = 0;
			end = maxEnd;
		}
	}

	if (end < start) {
		return {
			statusCode: HTTP_CODES.NOT_IN_RANGE,
			headers   : {
				'Content-Range': 'bytes */' + fileStats.size,
				'Accept-Ranges': 'bytes'
			}
		};
	}

	var stream = fs.createReadStream(fileStats.path, {
		start: start,
		end  : end
	});

	return {
		body      : stream,
		statusCode: HTTP_CODES.OK_RANGE,
		headers   : {
			'Content-Type'  : mime(fileStats.path),
			'Content-Length': Math.min(fileStats.size, end - start + 1),
			'Content-Range' : 'bytes ' + start + '-' + end + '/' + fileStats.size,
			'Accept-Ranges' : 'bytes',
			'Last-Modified' : fileStats.mtime.toUTCString()
		}
	};
}

/**
 * Creates responseData object with body set to readable stream of requested file.
 *
 * @param {!external:"fs.Stats"} fileStats
 * @param {!string}              fileStats.path    path to the file in local filesystem
 * @param {!Date}                fileStats.mtime   date of last modification of file content
 * @param {!Number}              fileStats.size    number of bytes of data file contains
 * @param {!Object}              headers
 * @return {module:serve-files~responseData}
 */
function getResponseDataWhole (fileStats/* , headers*/) {
	return {
		body      : fs.createReadStream(fileStats.path),
		statusCode: HTTP_CODES.OK,
		headers   : {
			'Content-Type'  : mime(fileStats.path),
			'Content-Length': fileStats.size,
			'Last-Modified' : fileStats.mtime.toUTCString()
		}
	};
}

/**
 * Appends `Cache-Control`, `Expires` and `Pragma` (only if needed) headers.
 *
 * @param {!Object} headers
 * @param {!number} cacheTimeInSeconds=0   Pass zero or less to disable cache.
 */
function appendCacheHeaders (headers, cacheTimeInSeconds) {
	headers['Cache-Control'] = (cacheTimeInSeconds > 1 ? 'private, max-age=' + cacheTimeInSeconds : 'no-cache, no-store, must-revalidate');
	headers.Expires = (cacheTimeInSeconds > 1 ? (new Date(Date.now() + (cacheTimeInSeconds * 1000))).toUTCString() : '0');

	if (cacheTimeInSeconds < 1) {
		headers.Pragma = 'no-cache';
	}

	return headers;
}

/**
 * Calls back with {@link module:serve-files~responseData} object.
 *
 * @param {!module:serve-files~configuration} cfg
 * @param {!string}                           filePath
 * @param {!Object}                           headers    From http.IncommingMessage
 * @param {!Function}                         callback
 */
function prepareFileResponse (cfg, filePath, headers, callback) {
	cfg.getFileStats(cfg, filePath, (err, fileStats) => {
		var data;

		if (err || !fileStats) {
			data = {
				statusCode: HTTP_CODES.NOT_FOUND
			};
		}
		else {
			data = cfg.getResponseData(fileStats, headers);
		}

		data.headers = appendCacheHeaders(data.headers || {}, cfg.cacheTimeInSeconds);
		data.headers.Date = data.headers.Date || (new Date()).toUTCString();

		callback(null, data);
	});
}

/**
 * HTTP response
 *
 * @external "http.ServerResponse"
 * @see {@link https://nodejs.org/api/http.html#http_class_http_serverresponse}
 */

/**
 * Send prepared response to client.
 *
 * @param {!module:serve-files~configuration} cfg
 * @param {Function[]}                        [cfg.standardResponses]
 * @param {module:serve-files~responseData}   fileResponse
 * @param {!external:"http.ServerResponse"}   res
 */
function serveFileResponse (cfg, fileResponse, res) {
	if (cfg.standardResponses && cfg.standardResponses[fileResponse.statusCode]) {
		return cfg.standardResponses[fileResponse.statusCode](fileResponse);
	}

	res.writeHead(fileResponse.statusCode, fileResponse.headers);
	// @todo: think of a way to result with 500 if/when file stream errors, because headers are already sent by then :/
	if (fileResponse.body && fileResponse.body.pipe) {
		fileResponse.body.pipe(res);
	}
	else {
		res.end(fileResponse.body);
	}
}

/**
 * Create function that will handle serving files.
 *
 * @example
 * var fileHandler = serveFiles();
 * var server = http.createServer(function (req, res) {
 *     fileHandler(req, res, err => console.error(err));
 * });
 *
 * @param {object}  [options]
 * @param {boolean} [options.followSymbolicLinks=false]    symbolic links will not be followed by default, i.e., they will not be served
 * @param {number}  [options.cacheTimeInSeconds=0]         HTTP cache will be disabled by default
 * @param {string}  [options.documentRoot=process.cwd()]   files outside of root path will not be served
 * @param {string}  [options.parsedURLName='urlParsed']    name of an optional property of a request object, which contains result of `url.parse(req.url)`
 * @return {Function|Error}
 */
function createFileResponseHandler (options) {
	const cfg = createConfiguration(options);

	if (cfg instanceof Error) {
		return cfg;
	}

	/**
	 * @private
	 * @param {!external:"http.IncomingMessage"} req
	 * @param {!external:"http.ServerResponse"}  res
	 * @param {Function}                         [callback]   called AFTER response is finished
	 */
	function serve (req, res, callback) {
		if (callback && callback instanceof Function) {
			res.once('finish', callback);
		}

		const filePath = cfg.getFilePath(cfg, req);

		prepareFileResponse(cfg, filePath, req.headers, (err, data) => {
			if (err) {
				data = {
					statusCode: HTTP_CODES.NOT_FOUND
				};
			}

			serveFileResponse(cfg, data, res);
		});
	}

	return serve;
}
