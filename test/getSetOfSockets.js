const test = require('tape');
const getSetOfSockets = require('../lib/getSetOfSockets.js');

test('getSetOfSockets', function testBasics (t) {
	t.strictEqual(typeof getSetOfSockets, 'function', 'Should export a function');

	var sockets = getSetOfSockets();
	t.strictEqual(typeof sockets, 'object', 'Should create an object');
	t.strictEqual(typeof sockets.onNewConnection, 'function', 'Exported object should have `onNewConnection` function');
	t.strictEqual(typeof sockets.closeAll, 'function', 'Exported object should have `closeAll` function');
	t.strictEqual(typeof sockets.sockets, 'object', 'Exported object should have `sockets` Set object');

	t.end();
});
