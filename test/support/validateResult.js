module.exports = function validateResult (t, valid, checked) {
	Object.keys(valid).forEach(prop => {
		if (typeof valid[prop] === 'object' && valid[prop] !== null) {
			validateResult(t, valid[prop], checked[prop]);
			return;
		}

		t.strictEqual(checked[prop], valid[prop], `${prop}: ${checked[prop]}`);
	});
};
