/* global gc */
/* eslint strict: 0 */
'use strict';

const path = require('path');
const serveFiles = require('../index.js');
const v8 = require('v8');

function fakeResponse () {
	return {
		statusCode: 200,
		setHeader : function () {}
	};
}

function fakeRequest () {
	return {
		headers: {}
	};
}

function onFakeFileInfo (cfg, req, res, filePath, fileStats) {
	const err = fileStats instanceof Error ? fileStats : null;
	const data = err ? null : cfg.prepareResponseData(cfg, req, res, filePath, fileStats);

	if (err) {
		res.statusCode = err.statusCode || 404;
	}

	cfg.appendCacheHeaders(res, cfg.cacheTimeInSeconds);

	// @todo: think of a way to result with 500 if/when file stream errors, because headers are already sent by then :/
	if (data && data.pipe) {
		data.on('end', cfg.fakeEnd);
		data.push(null);
	}
	else {
		cfg.fakeEnd();
	}

	cfg.fakeEnd = null;
}

function fakeServe (callback) {
	var cfg = serveFiles.createConfiguration({
		documentRoot: path.dirname(module.filename),
		fakeEnd     : callback
	});

	serveFiles.getFileInfo(cfg, fakeRequest(), fakeResponse(), module.filename, onFakeFileInfo);
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
		gc(true);
		v8.writeHeapSnapshot('reports/test-memory-1.heapsnapshot');
	}, 1000);
}

gc(true);
v8.writeHeapSnapshot('reports/test-memory-0.heapsnapshot');

next();
