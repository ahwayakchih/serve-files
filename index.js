/* eslint strict: 0 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const mime = require('./lib/MIME.js');
const parseArguments = require('./lib/getOptionsFromArgv.js');
const getRealpath = require('./lib/fastRealpath.js');

/**
 * @module serve-files
 */

/**
 * List of HTTP status codes used by this module.
 */
/* eslint-disable no-magic-numbers */
const HTTP_CODES = {
	OK          : 200,
	OK_RANGE    : 206,
	NOT_MODIFIED: 304,
	DENIED      : 403,
	NOT_FOUND   : 404,
	WAS_MODIFIED: 412,
	NOT_IN_RANGE: 416,
	SERVER_ERROR: 500
};
/* eslint-enable no-magic-numbers */

/**
 * Windows requires some trick when getting realpath, so check if we're running on it.
 */
const IS_WINDOWS = os.platform() === 'win32';

/**
 * Configuration object.
 *
 * @typedef {object} Configuration
 * @property {boolean}     [followSymbolicLinks=false]    symbolic links will not be followed by default, i.e., they will not be served
 * @property {number}      [cacheTimeInSeconds=0]         HTTP cache will be disabled by default
 * @property {string}      [documentRoot=process.cwd()]   files outside of root path will not be served
 * @property {Function}    getFilePath
 * @property {Function}    getFileInfo
 * @property {Function}    getFileStream
 * @property {Function}    prepareResponseData
 * @property {Function}    appendCacheHeaders
 * @property {Function}    serveFileResponse
 * @property {Function}    sendResponseData
 */

/**
 * @type {Configuration}
 */
const DEFAULT_CONFIG = {
	followSymbolicLinks: false,
	cacheTimeInSeconds : 0,
	documentRoot       : process.cwd(),
	documentRootReal   : null,
	getFilePath,
	getFileInfo,
	getFileStream,
	prepareResponseData,
	appendCacheHeaders,
	serveFileResponse,
	sendResponseData
};

/*
 * Exports
 */
module.exports = {
	HTTP_CODES,
	DEFAULT_CONFIG,
	createFileResponseHandler,
	createConfiguration,
	getFilePath,
	getFileInfo,
	getFileStream,
	prepareResponseData,
	prepareResponseDataRanges,
	prepareResponseDataWhole,
	appendCacheHeaders,
	serveFileResponse,
	sendResponseData,
	parseArguments,
	getRealpath
};

/**
 * @private
 */
const ONE_SECOND_IN_MILLISECONDS = 1000;

/**
 * Prepare configuration object.
 *
 * @param {object} options   See properties of {@link module:serve-files~Configuration}
 * @return {module:serve-files~Configuration} Configuration
 */
function createConfiguration (options) {
	const cfg = Object.assign(Object.create(DEFAULT_CONFIG), options);

	try {
		const root = fs.realpathSync(cfg.documentRoot);
		cfg.documentRootReal = root;
	}
	catch (e) {
		return e;
	}

	return cfg;
}

/**
 * HTTP
 *
 * @external http
 * @see {@link https://nodejs.org/api/http.html#http_class_http_incomingmessage}
 */

/**
 * HTTP request
 *
 * @typedef external:http.IncomingMessage
 * @see {@link https://nodejs.org/api/http.html#http_class_http_incomingmessage}
 */

/**
 * HTTP response
 *
 * @typedef external:http.ServerResponse
 * @see {@link https://nodejs.org/api/http.html#http_class_http_serverresponse}
 */

/**
 * @private
 */
const URL_PATHNAME_REGEXP = /^[^?#]+/;

/**
 * @private
 * @param {error|object} error
 * @param {number}       [statusCode=HTTP_CODES.SERVER_ERROR]
 * @return {object}
 */
function errorWithStatusCode (error, statusCode) {
	error.statusCode = statusCode || HTTP_CODES.SERVER_ERROR;
	return error;
}

/**
 * Returns requested file path.
 *
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}  req
 * @return {string}
 */
function getFilePath (cfg, req) {
	return path.join(cfg.documentRoot, URL_PATHNAME_REGEXP.exec(req.url)[0] || '/');
}

/**
 * Calls back with filePath and fs.Stats object or error as a second argument.
 *
 * @param {!module:serve-files~Configuration} cfg
 * @param {!string}                           cfg.documentRootReal
 * @param {string}                            [cfg.followSymbolicLinks=false]
 * @param {!external:http.IncomingMessage}    req
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!Function}                         callback
 */
function getFileInfo (cfg, req, res, filePath, callback) {
	getRealpath(filePath, function onRealpath (err, realpath) {
		// On Windows we can get different cases for the same disk letter :/.
		let checkPath = realpath;
		if (realpath && IS_WINDOWS) {
			checkPath = realpath.toLowerCase();
		}

		if (err || checkPath.indexOf(cfg.documentRootReal) !== 0) {
			callback(cfg, req, res, filePath, err || errorWithStatusCode(new Error('Access denied'), HTTP_CODES.DENIED));
			return;
		}

		fs[cfg.followSymbolicLinks ? 'stat' : 'lstat'](filePath, function onStat (err2, fileStats) {
			if (err2 || !fileStats.isFile()) {
				callback(cfg, req, res, filePath, err2 || errorWithStatusCode(new Error('Access denied'), HTTP_CODES.DENIED));
				return;
			}

			callback(cfg, req, res, filePath, fileStats);
		});
	});
}

/**
 * File system module
 *
 * @external fs
 * @see {@link https://nodejs.org/api/fs.html}
 */

/**
 * File stats
 *
 * @typedef external:fs.Stats
 * @see {@link https://nodejs.org/api/fs.html#fs_class_fs_stats}
 */

/**
 * File read stream
 *
 * @typedef external:fs.ReadStream
 * @see {@link https://nodejs.org/api/fs.html#fs_class_fs_readstream}
 */

/**
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}    req
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!external:fs.Stats}                fileStats
 * @param {object}                            [options]
 * @return {external:fs.ReadStream}
 */
function getFileStream (cfg, req, res, filePath, fileStats, options) {
	return fs.createReadStream(filePath, options);
}

/**
 * Sets up headers and statusCode on passed response object and returns file data stream.
 *
 * It takes into account `If-Modified-Since` and `If-Unmodified-Since` request headers. When one of them
 * matches, no stream will be returned and response will get a statusCode and required headers (if any).
 *
 * It calls either `prepareResponseDataRanges` or `prepareResponseDataWhole` depending on request `Range` header.
 *
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}    req
 * @param {!object}                           req.headers
 * @param {string}                            [req.headers.if-modified-since]
 * @param {string}                            [req.headers.if-unmodified-since]
 * @param {string}                            [req.headers.if-range]
 * @param {string}                            [req.headers.range]
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!external:fs.Stats}                fileStats
 * @param {!Date}                             fileStats.mtime                 date of last modification of file content
 * @param {!number}                           fileStats.size                  number of bytes of data file contains
 * @return {!external:fs.ReadStream|null}
 */
function prepareResponseData (cfg, req, res, filePath, fileStats) {
	if (!fileStats || !fileStats.mtime) {
		res.statusCode = (fileStats && fileStats.statusCode) || HTTP_CODES.NOT_FOUND;
		return null;
	}

	// Always set Last-Modified header
	res.setHeader('Last-Modified', fileStats.mtime.toUTCString());

	// Remove milliseconds and round because dates from HTTP headers do not contain milliseconds, but mtime does.
	const mtimeRounded = Math.round(fileStats.mtime / ONE_SECOND_IN_MILLISECONDS);

	var temp = req.headers['if-modified-since'] || null;
	if (temp && mtimeRounded <= Math.round(Date.parse(temp) / ONE_SECOND_IN_MILLISECONDS)) {
		res.statusCode = HTTP_CODES.NOT_MODIFIED;
		return null;
	}

	temp = req.headers['if-unmodified-since'] || null;
	if (temp && mtimeRounded >= Math.round(Date.parse(temp) / ONE_SECOND_IN_MILLISECONDS)) {
		res.statusCode = HTTP_CODES.WAS_MODIFIED;
		return null;
	}

	// Set Content-Type header after we are sure that we will be sending data
	res.setHeader('Content-Type', mime(filePath));

	if (req.headers.range) {
		temp = req.headers['if-range'] || null;
		// TODO: add support for ETag matching
		if (!temp || (!temp.match(/^(?:"|W\\)/) && mtimeRounded === Math.round(Date.parse(temp) / ONE_SECOND_IN_MILLISECONDS))) {
			return prepareResponseDataRanges(cfg, req, res, filePath, fileStats);
		}
	}

	return prepareResponseDataWhole(cfg, req, res, filePath, fileStats);
}

/**
 * Sets up headers and statusCode on passed response object and returns readable stream of requested file range(s).
 *
 * TODO: Implement support for multiple ranges (multipart/byteranges).
 *
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}    req
 * @param {!object}                           req.headers
 * @param {string}                            [req.headers.range]
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!external:fs.Stats}                fileStats
 * @param {!Date}                             fileStats.mtime   date of last modification of file content
 * @param {!number}                           fileStats.size    number of bytes of data file contains
 * @return {!external:fs.ReadStream|null}
 */
function prepareResponseDataRanges (cfg, req, res, filePath, fileStats) {
	const range = req.headers.range;

	if (!range) {
		return prepareResponseDataWhole(cfg, req, res, filePath, fileStats);
	}

	// We support only a single range requests for now.
	const lastByte = Math.max(fileStats.size - 1, 0);
	// Multipart requests are treated as a single range - first range is used, rest is ignored.
	var start = range.replace(/^bytes=/, '').match(/(-?[^-]+)(?:-(.+)|)/) || [];
	var end = Math.min(parseInt(start[1 + 1] || lastByte, 10) || 0, lastByte);

	start = parseInt(start[1] || 0, 10) || 0;

	if (start < 0) {
		start = Math.max(lastByte + start + 1, 0);
		end = lastByte;
	}

	if (end < start) {
		res.statusCode = HTTP_CODES.NOT_IN_RANGE;

		res.setHeader('Content-Range', `bytes */${fileStats.size}`);
		res.setHeader('Accept-Ranges', 'bytes');

		return null;
	}

	res.statusCode = HTTP_CODES.OK_RANGE;

	res.setHeader('Content-Length', Math.min(fileStats.size, end - start + 1));
	res.setHeader('Content-Range', `bytes ${start}-${end}/${fileStats.size}`);
	res.setHeader('Accept-Ranges', 'bytes');

	if (req.method === 'HEAD') {
		return null;
	}

	return cfg.getFileStream(cfg, req, res, filePath, fileStats, {start, end});
}

/**
 * Sets up headers and statusCode on passed response object and returns readable stream of requested file.
 *
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}    req
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!external:fs.Stats}                fileStats
 * @param {!Date}                             fileStats.mtime   date of last modification of file content
 * @param {!number}                           fileStats.size    number of bytes of data file contains
 * @return {!external:fs.ReadStream|null}
 */
function prepareResponseDataWhole (cfg, req, res, filePath, fileStats) {
	res.statusCode = HTTP_CODES.OK;

	res.setHeader('Content-Length', fileStats.size);

	if (req.method === 'HEAD') {
		return null;
	}

	return cfg.getFileStream(cfg, req, res, filePath, fileStats, null);
}

/**
 * Appends `Cache-Control` and `Expires` headers to response object.
 *
 * @param {!external:http.ServerResponse}   res
 * @param {!number}                         [cacheTimeInSeconds=0]   Pass zero or less to disable cache.
 */
function appendCacheHeaders (res, cacheTimeInSeconds) {
	if (cacheTimeInSeconds > 1) {
		res.setHeader('Cache-Control', `private, immutable, max-age=${cacheTimeInSeconds}`);
		res.setHeader('Expires', new Date(Date.now() + (cacheTimeInSeconds * ONE_SECOND_IN_MILLISECONDS)).toUTCString());
	}
	else {
		res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
		res.setHeader('Expires', '0');
	}
}

/**
 * Load data from file, append cache headers and send response.
 *
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}    req
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!external:fs.Stats}                fileStats
 */
function serveFileResponse (cfg, req, res, filePath, fileStats) {
	const responseData = cfg.prepareResponseData(cfg, req, res, filePath, fileStats);
	cfg.appendCacheHeaders(res, cfg.cacheTimeInSeconds);
	cfg.sendResponseData(cfg, req, res, filePath, fileStats, responseData);
}

/**
 * Send prepared response to client.
 *
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}    req
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!external:fs.Stats}                fileStats
 * @param {external:fs.ReadStream}            [data=null]
 */
function sendResponseData (cfg, req, res, filePath, fileStats, data) {
	if (req.method === 'HEAD' || !data) {
		res.end();
		return;
	}

	// TODO: think of a way to result with 500 if/when file stream errors, because headers are already sent by then :/
	if (typeof data.pipe !== 'function') {
		res.end(data);
		return;
	}

	const cleanupData = () => data.destroy();

	res.on('close', cleanupData);
	// TODO: Write tests for both error situations
	res.on('error', cleanupData);
	data.on('error', () => res.end());
	data.pipe(res);
}

/**
 * Create function that will handle serving files.
 *
 * @example
 * var fileHandler = createFileResponseHandler();
 * var server = http.createServer(function onRequest (req, res) {
 * 	fileHandler(req, res, () => console.log(`Finished ${req.method} ${req.url}`));
 * });
 *
 * @param {object}  [options]                              See properties of {@link module:serve-files~Configuration}
 * @param {boolean} [options.followSymbolicLinks=false]
 * @param {number}  [options.cacheTimeInSeconds=0]
 * @param {string}  [options.documentRoot=process.cwd()]
 * @return {Function|error}
 */
function createFileResponseHandler (options) {
	const cfg = createConfiguration(options);

	if (cfg instanceof Error) {
		return cfg;
	}

	/**
	 * @private
	 * @param {!external:http.IncomingMessage}   req
	 * @param {!external:http.ServerResponse}    res
	 * @param {Function}                         [callback]   called AFTER response is finished
	 */
	function serve (req, res, callback) {
		if (callback && callback instanceof Function) {
			res.once('finish', callback);
		}

		cfg.getFileInfo(cfg, req, res, cfg.getFilePath(cfg, req), cfg.serveFileResponse);
	}

	return serve;
}
