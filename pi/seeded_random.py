# pi/seeded_random.py
# Seeded Random Number Generator using Mulberry32 algorithm
# Ported faithfully from docs/js/seededRandom.js
# Used for deterministic gameplay in online multiplayer

_seed = 0


def set_seed(s: int) -> None:
    """Initialize the PRNG with a seed value (unsigned 32-bit integer)."""
    global _seed
    _seed = s & 0xFFFFFFFF  # Ensure unsigned 32-bit integer (mirrors JS `seed >>> 0`)


def seeded_random() -> float:
    """
    Generate a random number between 0 (inclusive) and 1 (exclusive).
    Uses Mulberry32 algorithm — matches JS seededRandom() exactly.
    Returns float in range [0, 1).
    """
    global _seed

    # Replicate JS 32-bit signed integer arithmetic with Python's arbitrary precision ints.
    # JS uses bitwise OR with 0 to coerce to signed 32-bit int; we use _to_i32 for that.

    def _to_i32(v: int) -> int:
        """Truncate to signed 32-bit integer, matching JS `| 0`."""
        v = v & 0xFFFFFFFF
        if v >= 0x80000000:
            v -= 0x100000000
        return v

    def _to_u32(v: int) -> int:
        """Truncate to unsigned 32-bit integer, matching JS `>>> 0`."""
        return v & 0xFFFFFFFF

    # state |= 0  →  coerce to signed i32
    state = _to_i32(_seed)

    # state = (state + 0x6D2B79F5) | 0
    state = _to_i32(state + 0x6D2B79F5)

    # Math.imul(a, b) — 32-bit integer multiply (low 32 bits of product)
    def _imul(a: int, b: int) -> int:
        """Replicate JS Math.imul: signed 32-bit multiply."""
        return _to_i32((_to_u32(a) * _to_u32(b)) & 0xFFFFFFFF)

    # t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = _imul(state ^ _to_u32(_to_u32(state) >> 15), 1 | state)

    # t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    t = _to_i32(t + _imul(t ^ _to_u32(_to_u32(t) >> 7), 61 | t)) ^ t

    # return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    result = _to_u32(t ^ (_to_u32(t) >> 14)) / 4294967296

    _seed = _to_u32(state)  # persist updated state

    return result


def seeded_random_int(min_val: int, max_val: int) -> int:
    """
    Generate a random integer in range [min_val, max_val] (inclusive).
    Matches JS seededRandomInt().
    """
    return int(seeded_random() * (max_val - min_val + 1)) + min_val


def get_seed_state() -> int:
    """Return the current seed state (for debugging/sync verification)."""
    return _seed
