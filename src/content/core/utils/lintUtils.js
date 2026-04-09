/**
 * Used to get rid of linting errors.
 * 
 * When calling __unused(x), the variable `x` becomes unusable (an error will be thrown during building)
 * 
 * WARNING: DO NOT USE IN BRANCHING LOGIC
 * 
 * @param {T} v
 * @returns {undefined} 
 */
export default function __unused(v) {
    v;
}
