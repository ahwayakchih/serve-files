const fs = require('fs');
const {
	POOL_NEXT,
	POOL_OWNER
} = require('./pool');

const CHUNK_SIZE = 16384;

/**
 * @module serve-files/lib/FilePump
 * @private
 */
module.exports = FilePump;

/**
 * Create a new pump.
 *
 * @class
 * @hideconstructor
 */
function FilePump () {
	this[POOL_NEXT] = null;
	this[POOL_OWNER] = null;

	this.fromFile = null;
	this.acquired = false;

	this.toStream = null;

	this.byteStart = 0;
	this.byteEnd = Infinity;
	this.bytesDone = 0;

	this.read = FilePump.prototype.read.bind(this);
	this.onRead = FilePump.prototype.onRead.bind(this);
	this.onError = FilePump.prototype.onError.bind(this);
	this.end = FilePump.prototype.end.bind(this);
}

/**
 * Initialize pump for another run (after it's acquired from the pool).
 *
 * Both `byteStart` and `byteEnd` are inclusive for compatibility with `fs.createReadStream()`.
 *
 * @see {@link https://nodejs.org/api/fs.html#fs_fs_createreadstream_path_options}
 * @param {object} file
 * @param {number} [byteStart=0]
 * @param {number} [byteEnd=Infinity]
 */
FilePump.prototype.prepare = function prepare (file, byteStart = 0, byteEnd = Infinity) {
	this.fromFile = file;
	this.acquired = false;

	this.toStream = null;

	this.byteStart = byteStart;
	this.byteEnd = byteEnd;
	this.bytesDone = 0;

	if (typeof this.byteStart !== 'number') {
		this.byteStart = 0;
	}

	if (typeof this.byteEnd !== 'number') {
		this.byteEnd = Infinity;
	}
};

/**
 * Start pumping data from file to stream.
 * Called `pipe` to allow usage in place of {@link external:fs.ReadStream}.
 *
 * @param {external:http.ServerResponse} stream
 */
FilePump.prototype.pipe = function pipe (stream) {
	if (this.toStream) {
		throw new Error('Pump is connected to a stream already');
	}

	this.toStream = stream;

	/*
	 * TODO: better error handling like at: https://github.com/nodejs/node/commit/a5cf3feaf1#diff-eefad5e8051f1634964a3847b691ff84
	 *       or maybe not: https://github.com/nodejs/node/issues/20276
	 */
	stream.once('error', this.end);
	stream.once('close', this.end);

	this.acquired = true;
	this.fromFile.acquire();

	this.read();
};

/**
 * Read data to temporary buffer and pass it to handler.
 *
 * @private
 */
FilePump.prototype.read = function read () {
	// Since both `byteStart` and `byteEnd` are inclusive, we have to add 1 in size calculation.
	var toRead = Math.min(this.byteEnd - (this.byteStart + this.bytesDone) + 1, CHUNK_SIZE);

	fs.read(this.fromFile.fd, Buffer.allocUnsafe(CHUNK_SIZE), 0, toRead, this.byteStart + this.bytesDone, this.onRead);
};

/**
 * Write data to output stream.
 *
 * @private
 * @param {Error|null} err
 * @param {number}     bytesRead
 * @param {Buffer}     buffer
 */
FilePump.prototype.onRead = function onRead (err, bytesRead, buffer) {
	if (err) {
		this.onError(err);
		return;
	}

	this.bytesDone += bytesRead;

	if (!bytesRead || !this.toStream || this.toStream.finished) {
		this.end();
		return;
	}

	var keepReading = this.toStream.write(bytesRead === CHUNK_SIZE ? buffer : buffer.slice(0, bytesRead));

	if (this.byteStart + this.bytesDone >= this.byteEnd) {
		this.end();
		return;
	}

	if (keepReading) {
		process.nextTick(this.read);
	}
	else {
		this.toStream.once('drain', this.read);
	}
};

/**
 * Error handler simply writes error to console and calls `end()`.
 *
 * @private
 */
FilePump.prototype.onError = function onError (err) {
	console.error('FilePump', err);
	this.end();
};

/**
 * End output stream, release file, put pump back to the pool.
 *
 * @private
 */
FilePump.prototype.end = function end () {
	if (this.toStream) {
		if (!this.toStream.finished) {
			this.toStream.end();
		}
		this.toStream.removeListener('error', this.end);
		this.toStream.removeListener('close', this.end);
		this.toStream = null;
	}

	if (this.fromFile && this.acquired) {
		this.fromFile.release();
		this.fromFile = null;
		this.acquired = false;
	}

	var pool = this[POOL_OWNER];
	if (pool) {
		pool.put(this);
	}
};
