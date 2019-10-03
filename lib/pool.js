/**
 * This is based on https://github.com/mcollina/reusify with following changes:
 *
 * - simplified to not use additional `tail`,
 * - use Symbol instead of string for `next`,
 * - export `next` symbol, so it can be used in custom Constructors,
 * - export `pool` symbol, so it can be used in custom Constructors.
 *
 * @module serve-files/lib/pool
 */

/**
 * Using symbols to minimize chances of name collision with custom prototypes.
 *
 * @private
 */
const NEXT = Symbol('next');
const POOL = Symbol('pool');

/**
 * Create pool that will call Constructor to create new items when needed.
 *
 * @param {Function} Constructor
 * @return {object} Pool with two methods: get and put
 */
function pool (Constructor) {
	var head = null;

	/**
	 * Get available or create and get new item.
	 *
	 * @return {object}
	 */
	function get () {
		var current = head || new Constructor();

		head = current[NEXT] || null;
		current[NEXT] = null;
		current[POOL] = this; // eslint-disable-line no-invalid-this

		return current;
	}

	/**
	 * Put object back into pool.
	 *
	 * @param {object} item
	 */
	function put (item) {
		item[NEXT] = head;
		item[POOL] = null;
		head = item;
	}

	return {
		get,
		put
	};
}

module.exports = {
	createPoolOf: pool,
	// Exported symbols can be used in custom types to prevent object's hidden-class rebuilds later.
	POOL_NEXT   : NEXT,
	POOL_OWNER  : POOL
};
