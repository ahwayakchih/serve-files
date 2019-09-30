/* eslint strict: 0 */
'use strict';

/*
 * Imported from hyperProxy: https://github.com/Hypermediaisobar/hyperProxy
 * Updated for node-mime v2 and updated IANA types that now include also `font` type:
 * https://tools.ietf.org/html/rfc8081
 */
const path = require('path');

/* eslint-disable global-require */
var mime;
var getFromFileName;
try {
	mime = require('mime');
	if (mime.lookup) {
		getFromFileName = getFromFileNameV1;
	}
	else if (mime.getType) {
		getFromFileName = getFromFileNameV2;
	}
	else {
		getFromFileName = getFromFileNameBasic;
	}
}
catch (e) {
	mime = false;
	getFromFileName = getFromFileNameBasic;
}
/* eslint-enable global-require */

/**
 * List of most commonly used types for our fallback usage.
 *
 * @private
 */
const TYPES = {
	'.js'   : 'application/javascript; charset=UTF-8',
	'.json' : 'application/json; charset=UTF-8',
	'.css'  : 'text/css; charset=UTF-8',
	'.htm'  : 'text/html; charset=UTF-8',
	'.html' : 'text/html; charset=UTF-8',
	'.txt'  : 'text/plain; charset=UTF-8',
	'.swf'  : 'application/x-shockwave-flash',
	'.xml'  : 'application/xml',
	'.xslt' : 'application/xslt+xml',
	'.png'  : 'image/png',
	'.gif'  : 'image/gif',
	'.jpg'  : 'image/jpeg',
	'.jpeg' : 'image/jpeg',
	'.webp' : 'image/webp',
	'.svg'  : 'image/svg+xml',
	'.svgz' : 'image/svg+xml',
	'.woff' : 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf'  : 'font/ttf',
	'.otf'  : 'font/otf',
	'.eot'  : 'application/vnd.ms-fontobject',
	'.mp4'  : 'video/mp4',
	'.mov'  : 'video/quicktime',
	'.3gp'  : 'video/3gpp',
	'.avi'  : 'video/x-msvideo',
	'.wmv'  : 'video/x-ms-wmv',
	'.ogv'  : 'video/ogg',
	'.mkv'  : 'video/x-matroska',
	'.crx'  : 'application/x-chrome-extension'
};

/**
 * Use `mime` v1.x to get type.
 *
 * @param {string} filename can be a full path
 * @return {string} mime type
 */
function getFromFileNameV1 (filename) {
	var result = mime.lookup(filename);

	// Add charset just in case for some buggy browsers.
	if (result === 'application/javascript' || result === 'application/json' || result === 'text/plain') {
		result += '; charset=UTF-8';
	}

	return result;
}

/**
 * Use `mime` v2.x to get type.
 *
 * @param {string} filename can be a full path
 * @return {string} mime type
 */
function getFromFileNameV2 (filename) {
	var result = mime.getType(filename);

	// Add charset just in case for some buggy browsers.
	if (result === 'application/javascript' || result === 'application/json' || result === 'text/plain') {
		result += '; charset=UTF-8';
	}

	return result;
}

/**
 * Fallback to most commonly used default types when `mime` module is not installed.
 *
 * @param {string} filename can be a full path
 * @return {string} mime type
 */
function getFromFileNameBasic (filename) {
	return TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

/*
 * Exports
 */
module.exports = getFromFileName;
