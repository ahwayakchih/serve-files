const path = require('path');
const test = require('tape');
const parseArguments = require('../lib/getOptionsFromArgv.js');
const validateResult = require('./support/validateResult.js');

process.chdir(path.dirname(module.filename));

const CWD = process.cwd();
const PORT = 8080;

const TEST_CASES = {
	'Should return default setup when no arguments are passed': {
		arg: [],
		cfg: {
			hostname    : null,
			port        : 0,
			documentRoot: CWD
		}
	},
	'Should return default setup when only exec bin path is passed': {
		arg: [process.execPath],
		cfg: {
			hostname    : null,
			port        : 0,
			documentRoot: CWD
		}
	},
	'Should return default setup when only main module path is passed': {
		arg: [require.main.filename],
		cfg: {
			hostname    : null,
			port        : 0,
			documentRoot: CWD
		}
	},
	'Should return default setup and ignore exec bin and main module paths': {
		arg: [process.execPath, require.main.filename],
		cfg: {
			hostname    : null,
			port        : 0,
			documentRoot: CWD
		}
	},
	'Should use existing directory name as root': {
		arg: [],
		cfg: {
			hostname    : null,
			port        : 0,
			documentRoot: ['support', './support', '/', '../test']
		},
		cfg2arg: ['documentRoot']
	},
	'Should use passed port number': {
		arg: [`${PORT}`],
		cfg: {
			hostname    : null,
			port        : PORT,
			documentRoot: CWD
		}
	},
	'Should use local host name with port number': {
		arg: [`localhost:${PORT}`],
		cfg: {
			hostname    : 'localhost',
			port        : PORT,
			documentRoot: CWD
		}
	},
	'Should use host name with port number': {
		arg: [`example.com:${PORT}`],
		cfg: {
			hostname    : 'example.com',
			port        : PORT,
			documentRoot: CWD
		}
	},
	'Should use separate host name and port number': {
		arg: [],
		cfg: {
			hostname    : ['localhost', 'example.com'],
			port        : PORT,
			documentRoot: CWD
		},
		cfg2arg: ['hostname', 'port']
	},
	'Should use correct host, port and root': {
		arg: [],
		cfg: {
			hostname    : ['localhost', 'example.com'],
			port        : PORT,
			documentRoot: ['support', './support', '/', '../test']
		},
		cfg2arg: true
	}
};

function _createTest (msg, data) {
	if (data.cfg2arg) {
		(Array.isArray(data.cfg2arg) ? data.cfg2arg : Object.keys(data.cfg)).forEach(key => data.arg.push(data.cfg[key].toString()));
	}

	if (data.arg.length < 1) {
		test(msg, function (t) {
			const cfg = parseArguments(data.arg);
			validateResult(t, data.cfg, cfg);
			t.end();
		});

		return;
	}

	// Test args in every possible order
	for (let i = data.arg.length; i > 0; i--) {
		data.arg.push(data.arg.shift());
		test(msg + ' (' + data.arg.join(', ') + ')', function (t) {
			const cfg = parseArguments(data.arg);
			validateResult(t, data.cfg, cfg);
			t.end();
		});
	}
}

function _createTests (msg, data) {
	const cfg = data.cfg;
	var keys = Object.keys(cfg);

	for (let i = keys.length - 1; i >= 0; i--) {
		if (!Array.isArray(cfg[keys[i]])) {
			continue;
		}

		cfg[keys[i]].forEach(value => {
			let d = {
				arg    : data.arg.slice(0),
				cfg    : Object.assign({}, cfg),
				cfg2arg: data.cfg2arg
			};
			d.cfg[keys[i]] = value;
			_createTests(msg, d);
		});

		return;
	}

	_createTest(msg, data);
}

Object.keys(TEST_CASES).forEach(msg => _createTests(`getOptionsFromArgv: ${msg}`, TEST_CASES[msg]));
