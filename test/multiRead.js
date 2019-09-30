
const fs = require('fs');
const test = require('tape');

const CHUNKSIZE = 4;
const FILESIZE = 256 * 1024;
const FILEPATH = './test-multiread.data';

const HALF = 0.5;
const MAX_BYTE = 0xff;

test('Multiread', function testMultiread (t) {
	var buf = prepareTestData();
	var fd = prepareTestFile(FILEPATH, FILESIZE, buf);
	var promises = [];

	var half = Math.round(FILESIZE * HALF);
	var start = 0;
	var end = 0;
	for (let i = half; i < FILESIZE; i++) {
		start = Math.max(FILESIZE - i, 0);
		end = start + CHUNKSIZE;
		promises.push(testRead(fd, start, end, getExpectedTestData(buf, start), t));

		start = i;
		end = start + CHUNKSIZE;
		promises.push(testRead(fd, start, end, getExpectedTestData(buf, start), t));
	}

	Promise.all(promises)
		.then(() => cleanupTestFile(fd, FILEPATH))
		.then(() => t.end())
		.catch(err => t.end(err))
	;
});

function prepareTestData () {
	var buf = Buffer.allocUnsafe(MAX_BYTE + CHUNKSIZE);

	var value = 0;
	for (let i = 0; i < buf.length; i++) {
		buf.writeUInt8(value, i);
		value++;
		if (value >= MAX_BYTE) {
			value = 0;
		}
	}

	return buf;
}

function getExpectedTestData (buf, start) {
	var len = buf.length - CHUNKSIZE;
	var from = start - (Math.floor(start / len) * len);
	return buf.slice(from, from + CHUNKSIZE);
}

function prepareTestFile (filepath, size, buf) {
	var len = buf.length - CHUNKSIZE;
	var repeat = Math.floor(size / len);
	var rest = size - (repeat * len);

	var fd = fs.openSync(filepath, 'w');
	for (let i = 0; i < repeat; i++) {
		fs.writeSync(fd, buf, 0, len, i * len);
	}

	fs.writeSync(fd, buf, 0, rest, repeat * len);
	fs.closeSync(fd);

	return fs.openSync(filepath, 'r');
}

function cleanupTestFile (fd, filepath) {
	fs.closeSync(fd);
	fs.unlinkSync(filepath);
}

function testRead (fd, start, end, expect, t) {
	return new Promise((resolve, reject) => {
		fs.read(fd, Buffer.allocUnsafe(end - start), 0, end - start, start, (err, bytes, buf) => {
			if (err) {
				reject(err);
				return;
			}

			var e = expect.slice(0, bytes).toString('hex');
			var a = buf.slice(0, bytes).toString('hex');

			t.strictEqual(a, e, `Read from ${start} to ${end}`);

			if (e === a) {
				resolve();
			}
			else {
				reject(new Error(`Read from ${start} to ${end} was expected to be ${e}, but was ${a} after reading ${bytes} bytes`));
			}
		});
	});
}
