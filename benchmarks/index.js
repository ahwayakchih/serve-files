const os = require('os');
const fork = require('child_process').fork;
const autocannon = require('autocannon');
const serie = require('fastseries');

const SERVERS = [
	'node-static',
	'serve-files',
	'serve-files-fs-cache',
	'serve-static',
	'st',
	'statique'
];

const DEFAULT_DURATION = 60;
const DEFAULT_CONNECTIONS = 100;

const DURATION = parseInt(process.env.DURATION || DEFAULT_DURATION, 10);
const CONNECTIONS = parseInt(process.env.CONNECTIONS || DEFAULT_CONNECTIONS, 10);

const MINUTE_AS_SECONDS = 60;
const IS_TTY = process.stdout.isTTY;

var docker = (function checkDocker () {
	const fs = require('fs'); // eslint-disable-line global-require
	try {
		return fs.readFileSync('/proc/self/cgroup', 'utf8').indexOf('/docker/') !== -1
			&& (fs.readFileSync('/etc/os-release', 'utf8').match(/PRETTY_NAME="([^"]+)"/) || [null, 'unknown'])[1];
	}
	catch (e) {
		return false;
	}
})();
var where = docker ? `inside Docker (${docker})` : `natively (${os.release()})`;
console.log(`Running ${where} with Node ${process.version} and ${os.cpus()[0].model} x ${os.cpus().length}.`);
console.log(`Testing ${SERVERS.length} servers, with ${DURATION} seconds of ${CONNECTIONS} simultaneous connections each.`);
if (IS_TTY) {
	console.log(`Test will take approximately ${(DURATION * SERVERS.length) / MINUTE_AS_SECONDS} minute(s).`);
}

/**
 * @private
 * @param {string}   name
 * @param {Function} callback
 */
function run (name, callback) {
	var s = fork(`${__dirname}/${name}.js`);

	s.once('message', m => {
		if (!m.port) {
			s.kill();
			s = null;
			callback(new Error('No `ready` message received from server script'));
			return;
		}

		if (IS_TTY) {
			process.stdout.write(`. ${name}`);
		}
		autocannon({
			url        : `http://localhost:${m.port}/index.js?foo[bar]=baz`,
			title      : name,
			duration   : DURATION,
			connections: CONNECTIONS
		}, (err, result) => {
			s.kill();
			s = null;
			if (IS_TTY) {
				process.stdout.cursorTo(0);
				process.stdout.write(`${err || result.non2xx ? '✗' : '✔'} ${name}\n`);
			}
			callback(err, result);
		});
	});
}

serie({results: true})({}, run, SERVERS, (err, results) => {
	if (err) {
		console.error(err);
		return;
	}

	var tableData = results.map(Result);
	tableData.sort((a, b) => {
		if (a.non2xx !== b.non2xx) {
			return a.non2xx - b.non2xx;
		}

		if (a.requests !== b.requests) {
			return b.requests - a.requests;
		}

		if (a.latency !== b.latency) {
			return a.latency - b.latency;
		}

		return 0;
	});

	console.table(tableData);
});

/**
 * @private
 * @class
 * @param {object} data
 * @param {string} data.title
 * @param {string} data.url
 * @param {object} data.requests
 * @param {number} data.requests.average
 * @param {number} data.requests.mean
 * @param {number} data.requests.stddev
 * @param {number} data.requests.min
 * @param {number} data.requests.max
 * @param {number} data.requests.total
 * @param {number} data.requests.p0_001
 * @param {number} data.requests.p0_01
 * @param {number} data.requests.p0_1
 * @param {number} data.requests.p1
 * @param {number} data.requests.p2_5
 * @param {number} data.requests.p10
 * @param {number} data.requests.p25
 * @param {number} data.requests.p50
 * @param {number} data.requests.p75
 * @param {number} data.requests.p90
 * @param {number} data.requests.p97_5
 * @param {number} data.requests.p99
 * @param {number} data.requests.p99_9
 * @param {number} data.requests.p99_99
 * @param {number} data.requests.p99_999
 * @param {number} data.requests.sent
 * @param {object} data.latency
 * @param {number} data.latency.average
 * @param {number} data.latency.mean
 * @param {number} data.latency.stddev
 * @param {number} data.latency.min
 * @param {number} data.latency.max
 * @param {number} data.latency.p0_001
 * @param {number} data.latency.p0_01
 * @param {number} data.latency.p0_1
 * @param {number} data.latency.p1
 * @param {number} data.latency.p2_5
 * @param {number} data.latency.p10
 * @param {number} data.latency.p25
 * @param {number} data.latency.p50
 * @param {number} data.latency.p75
 * @param {number} data.latency.p90
 * @param {number} data.latency.p97_5
 * @param {number} data.latency.p99
 * @param {number} data.latency.p99_9
 * @param {number} data.latency.p99_99
 * @param {number} data.latency.p99_999
 * @param {object} data.throughput
 * @param {number} data.throughput.average
 * @param {number} data.throughput.mean
 * @param {number} data.throughput.stddev
 * @param {number} data.throughput.min
 * @param {number} data.throughput.max
 * @param {number} data.throughput.total
 * @param {number} data.throughput.p0_001
 * @param {number} data.throughput.p0_01
 * @param {number} data.throughput.p0_1
 * @param {number} data.throughput.p1
 * @param {number} data.throughput.p2_5
 * @param {number} data.throughput.p10
 * @param {number} data.throughput.p25
 * @param {number} data.throughput.p50
 * @param {number} data.throughput.p75
 * @param {number} data.throughput.p90
 * @param {number} data.throughput.p97_5
 * @param {number} data.throughput.p99
 * @param {number} data.throughput.p99_9
 * @param {number} data.throughput.p99_99
 * @param {number} data.throughput.p99_999
 * @param {number} data.errors
 * @param {number} data.timeouts
 * @param {number} data.duration
 * @param {string} data.start
 * @param {string} data.finish
 * @param {number} data.connections
 * @param {number} data.pipelining
 * @param {number} data.non2xx
 * @param {number} data.1xx
 * @param {number} data.2xx
 * @param {number} data.3xx
 * @param {number} data.4xx
 * @param {number} data.5xx
 */
function Result (data) {
	if (!(this instanceof Result)) {
		return new Result(data);
	}

	this.title = data.title;
	this.requests = data.requests.p99_9;
	this.latency = data.latency.p99_9;
	this.bytes = data.throughput.p99_9;
	this.timeouts = data.timeouts;
	this.errors = data.errors;
	this.non2xx = data.non2xx;
}
