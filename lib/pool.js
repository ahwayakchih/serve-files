/*
 * Using symbols to minimize chances of name collision with custom prototypes.
 */

/**
 * Symbol used in constructed objects to refer to the next object
 * of the same type in the pool.
 *
 * @memberof module:serve-files/lib/pool#
 * @name POOL_NEXT
 */
const NEXT = Symbol('next');

/**
 * Symbol used in constructed object to refer to the pool
 * that object was borrowed from.
 *
 * @memberof module:serve-files/lib/pool#
 * @name POOL_OWNER
 */
const POOL = Symbol('pool');

/**
 * This is based on https://github.com/mcollina/reusify with following changes:
 *
 * - simplified to not use additional `tail`,
 * - use Symbol instead of string for `next`,
 * - export `POOL_NEXT` symbol, so it can be used in custom Constructors,
 * - export `POOL_OWNER` symbol, so it can be used in custom Constructors.
 *
 * @example
 * const poolOfItems = createPoolOf(myItem);
 * function myItem () { // eslint-disable-line jsdoc/require-jsdoc
 * 	this[POOL_NEXT] = null; // eslint-disable-line no-invalid-this
 * 	this[POOL_OWNER] = null; // eslint-disable-line no-invalid-this
 * }
 * // ...
 * var item = poolOfItems.get();
 * // ...
 * poolOfItems.put(item);
 *
 * @module serve-files/lib/pool
 */
module.exports = {
	createPoolOf,
	// Exported symbols can be used in custom types to prevent object's hidden-class rebuilds later.
	POOL_NEXT : NEXT,
	POOL_OWNER: POOL
};

/**
 * Create pool that will call Constructor to create new items when needed.
 *
 * @memberof module:serve-files/lib/pool#
 * @param {Function} Constructor
 * @return {module:serve-files/lib/pool~Pool} Pool with two methods: get and put
 */
function createPoolOf (Constructor) {
	var head = null;

	/**
	 * Get first available or create and get new item.
	 *
	 * @memberof module:serve-files/lib/pool~Pool#
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
	 * Put item back into pool.
	 *
	 * @memberof module:serve-files/lib/pool~Pool#
	 * @param {object} item
	 */
	function put (item) {
		item[NEXT] = head;
		item[POOL] = null;
		head = item;
	}

	/**
	 * @name module:serve-files/lib/pool~Pool
	 * @class
	 * @hideconstructor
	 */
	return {
		get,
		put
	};
}
