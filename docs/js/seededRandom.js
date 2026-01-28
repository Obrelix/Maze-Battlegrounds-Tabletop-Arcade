// Seeded Random Number Generator using Mulberry32 algorithm
// Used for deterministic gameplay in online multiplayer

let state = 0;

/**
 * Initialize the PRNG with a seed value
 * @param {number} seed - Integer seed value
 */
export function setSeed(seed) {
    state = seed >>> 0; // Ensure unsigned 32-bit integer
}

/**
 * Generate a random number between 0 (inclusive) and 1 (exclusive)
 * Uses Mulberry32 algorithm for fast, high-quality randomness
 * @returns {number} Random float in range [0, 1)
 */
export function seededRandom() {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Generate a random integer in range [min, max] (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
export function seededRandomInt(min, max) {
    return Math.floor(seededRandom() * (max - min + 1)) + min;
}

/**
 * Get the current seed state (for debugging/sync verification)
 * @returns {number} Current state value
 */
export function getSeedState() {
    return state;
}
