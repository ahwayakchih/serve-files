const fs = require('fs');
const {
	HTTP_CODES,
	getFileInfo
} = require('../index');
const {createPoolOf} = require('./pool');
const FilePump = require('./FilePump');

const ONE_SECOND = 1000;
const TEN_SECONDS = 10000;

/**
 * Enable caching of file stat and file descriptors.
 *
 * @module serve-files/lib/getFileCacheSettings
 */
module.exports = getFileCacheSettings;

/**
 * @private
 */
const cacheOfFiles = Object.create(null);
const poolOfPumps = createPoolOf(FilePump);

/**
 * Return settings needed for using fs cache with serve-files.
 *
 * @alias module:serve-files/lib/getFileCacheSettings
 * @return {object}
 */
function getFileCacheSettings () {
	return {
		pumps           : poolOfPumps,
		getFileInfo     : getCachedFileInfo,
		getFileStream   : getCachedFilePump,
		sendResponseData: pumpResponseData
	};
}

/**
 * Noop.
 *
 * @private
 */
function noop () {
	// Function intentionally left empty.
}

/**
 * Update stats value and call back all listeners awaiting for the change.
 *
 * @private
 * @param {object}            cachedFile
 * @param {external:fs.Stats} fileStats
 */
function cachedFileSetStats (cachedFile, fileStats) {
	var list = cachedFile.await;
	var len = (list && list.length) || 0;

	cachedFile.stats = fileStats;
	cachedFile.await = [];

	if (len < 1) {
		return;
	}

	for (var i = 0; i < len; i++) {
		list[i](fileStats);
	}
}

/**
 * Overrides {@link module:serve-files~getFileInfo}.
 *
 * @private
 * @param {!module:serve-files~Configuration} cfg
 * @param {!string}                           cfg.documentRootReal
 * @param {string}                            [cfg.followSymbolicLinks=false]
 * @param {!external:http.IncomingMessage}    req
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!Function}                         callback
 */
function getCachedFileInfo (cfg, req, res, filePath, callback) {
	var cachedFile = cacheOfFiles[filePath] || {
		stats: null,
		fd   : null,
		until: Infinity,
		await: [],
		pipes: 0,
		acquire () {
			this.pipes += 1;
			return this;
		},
		release () {
			this.pipes -= 1;
			if (this.pipes < 1) {
				this.stats = null;
				fs.close(this.fd, err => err && console.error(err));
				this.fd = null;
			}
			return this;
		}
	};

	/*
	 * This is for testing only. "Real" cache should have timeout and/or be updated on file changes.
	 * The one here can be DDoS-ed simply by requesting hundreds of non-existing files per second
	 * (which will consume RAM until there's no more left to use).
	 */
	if (cachedFile.stats && cachedFile.until > Date.now()) {
		callback(cfg, req, res, filePath, cachedFile.stats);
		return;
	}

	if (cachedFile.fd !== null) {
		/*
		 * TODO: ref count pumps and close FD after exiting pumps are done.
		 *
		 * fs.close(cachedFile.fd, err => err && console.error(err));
		 * cachedFile.fd = null;
		 */
	}

	// Reset stats, or some other request may see them as ready and use old data
	/*
	 * TODO: recreate cachedFile object instead, or some existing task may break if it tries to read
	 *       after we nullify this and before we get new stats.
	 */
	cachedFile.stats = null;

	cacheOfFiles[filePath] = cachedFile;

	if (cachedFile.await.push(fileStats => callback(cfg, req, res, filePath, fileStats)) > 1) {
		return;
	}

	fs.open(filePath, 'r', function onOpen (err, fd) {
		/*
		 * `cachedFile.stats` are nullified before we get here, so it is safe to update `until` before
		 * we even get the new stats.
		 */
		cachedFile.until = cfg.cacheTimeInSeconds === 0 ? 0 : Date.now() + (cfg.cacheTimeInSeconds * ONE_SECOND);

		if (err) {
			// Enforce cache timeout on errors, to prevent keeping them forever.
			cachedFile.until = Math.min(cachedFile.until, TEN_SECONDS);
			cachedFileSetStats(cachedFile, err);
			return;
		}

		cachedFile.fd = fd;

		getFileInfo(cfg, req, res, filePath, function onFileInfo (_0, _1, _2, _3, fileStats) {
			if (fileStats instanceof Error) {
				cachedFile.fd = null;
				fs.close(fd, noop);
				fd = null;
			}

			cachedFileSetStats(cachedFile, fileStats);
		});
	});
}

/**
 * Overrides {@link module:serve-files~getFileStream}.
 *
 * @private
 * @param {!module:serve-files~Configuration} cfg
 * @param {!external:http.IncomingMessage}    req
 * @param {!external:http.ServerResponse}     res
 * @param {!string}                           filePath
 * @param {!external:fs.Stats}                fileStats
 * @param {object}                            [options]
 * @return {module:serve-files/lib/FilePump~FilePump}
 */
function getCachedFilePump (cfg, req, res, filePath, fileStats, options) {
	const cachedFile = cacheOfFiles[filePath];

	if (!cachedFile) {
		res.statusCode = HTTP_CODES.SERVER_ERROR;
		return null;
	}

	var pump = cfg.pumps.get();
	pump.prepare(cachedFile, options && options.start, options && options.end);

	return pump;
}

/**
 * Overrides {@link module:serve-files~sendResponseData}.
 *
 * @private
 * @param {!module:serve-files~Configuration}          cfg
 * @param {!external:http.IncomingMessage}             req
 * @param {!external:http.ServerResponse}              res
 * @param {!string}                                    filePath
 * @param {!external:fs.Stats}                         fileStats
 * @param {module:serve-files/lib/FilePump~FilePump}   [data=null]
 */
function pumpResponseData (cfg, req, res, filePath, fileStats, data) {
	if (req.method === 'HEAD' || !data) {
		res.end();
		return;
	}

	if (typeof data.pipe !== 'function') {
		res.end(data);
		return;
	}

	data.pipe(res);
}
