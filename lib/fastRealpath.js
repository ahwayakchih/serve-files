const os = require('os');
const fs = require('fs');

var binding = null;
try {
	// Use faster realpath whenever possible
	const binding = process.binding('fs');	
}
catch (e) {
	binding = null;
}
// FSReqWrap on node < 11.0, FSReqCallback afterwards
const FSReqCallback = binding && (binding.FSReqWrap || binding.FSReqCallback);

/*
 * There were problems reported on using native realpath: https://github.com/nodejs/node/issues/7726.
 * Since they were mainly on Windows, lets try to use native realpath on other platforms,
 * because Node's (re)implementation in JS is horribly slow :(.
 */
module.exports = os.platform() === 'win32' ? fs.realpath : (fs.realpath.native || (FSReqCallback ? fastRealpath : fs.realpath));

/**
 * Call native realpath instead of the one implemented in JS.
 *
 * @private
 * @param {string}   filePath
 * @param {Function} callback
 */
function fastRealpath (filePath, callback) {
	var req = new FSReqCallback();
	req.oncomplete = callback;
	binding.realpath(filePath, 'utf8', req);
}
