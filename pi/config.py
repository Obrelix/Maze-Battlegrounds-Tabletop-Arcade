# pi/config.py
# All constants ported from docs/js/config.js
# Source of truth: docs/js/config.js

import math
import colorsys

# ---------------------------------------------------------------------------
# Fixed timestep
# ---------------------------------------------------------------------------
FIXED_STEP = 1.0 / 60.0           # seconds per frame
_FIXED_STEP_MS = 1000.0 / 60.0    # ~16.667 ms per frame (matches JS FIXED_STEP_MS)

# ---------------------------------------------------------------------------
# Display constants
# ---------------------------------------------------------------------------
LOGICAL_W = 128
LOGICAL_H = 64
PITCH = 10
LED_RADIUS = 3.5
CELL_SIZE = 3
ROWS = 21
COLS = 37
MAZE_OFFSET_X = 8

# ---------------------------------------------------------------------------
# Gameplay constants
# ---------------------------------------------------------------------------
MAX_ENERGY = 150
MAX_SCORE = 5
MAX_MINES = 4
BASE_SPEED = 0.6
MAX_SPEED = 1.4
BEAM_SPEED = 1.8
C_BEAM_SPEED = 1.2
CHARGE_MOVEMENT_PENALTY = 0.6
PORTAL_GLITCH_CHANCE = 0.3
BEAM_LENGTH = 8
TRAIL_LENGTH = 15
C_BEAM_LENGTH = 6
PARTICLE_COUNT = 20
C_BEAM_RANGE = 16
C_BEAM_WIDTH = 2
GAMEPAD_THRESH = 0.5
BOOST_COOLDOWN_FRAMES = 120
BLAST_RADIUS = 4.0
STORAGE_KEY = 'LED_MAZE_HIGHSCORES'
DEFAULT_NAMES = ['P-1', 'P-2']
INPUT_DELAY = 20
GAME_TIME = round(2_000_000 / _FIXED_STEP_MS)   # 120000 frames (~33 min)


# ---------------------------------------------------------------------------
# TIMING class
# ---------------------------------------------------------------------------
class _Timing:
    SUDDEN_DEATH_TIME = 1800                                         # frames
    CHARGE_DURATION = round(3000 / _FIXED_STEP_MS)                  # 180 frames
    MINE_ARM_TIME = round(1000 / _FIXED_STEP_MS)                     # 60 frames
    STUN_DURATION = round(1500 / _FIXED_STEP_MS)                     # 90 frames
    GLITCH_DURATION = round(3000 / _FIXED_STEP_MS)                   # 180 frames
    DEMO_RESET_TIMER = 500                                           # frames
    AMMO_RESPAWN_DELAY = round(1500 / _FIXED_STEP_MS)               # 90 frames
    MINE_COOLDOWN = round(250 / _FIXED_STEP_MS)                      # 15 frames
    BOOST_SOUND_THROTTLE = round(600 / _FIXED_STEP_MS)              # 36 frames
    IDLE_THRESHOLD = 15000                                           # milliseconds

TIMING = _Timing()


# ---------------------------------------------------------------------------
# ENERGY_COSTS class
# ---------------------------------------------------------------------------
class _EnergyCosts:
    BEAM = 30
    CHARGED_BEAM = 65
    SHIELD_ACTIVATION = 10
    DETONATION = 30
    BEAM_HIT_TRANSFER = 15

ENERGY_COSTS = _EnergyCosts()


# ---------------------------------------------------------------------------
# ENERGY_RATES class
# ---------------------------------------------------------------------------
class _EnergyRates:
    SHIELD_DRAIN = MAX_ENERGY / (6 * 60)    # ~0.41667 per tick
    BOOST_DRAIN = MAX_ENERGY / (6 * 60)     # ~0.41667 per tick
    BOOST_REGEN = MAX_ENERGY / (12 * 60)    # ~0.20833 per tick

ENERGY_RATES = _EnergyRates()


# ---------------------------------------------------------------------------
# COLLISION class
# ---------------------------------------------------------------------------
class _Collision:
    HITBOX_SIZE = 0.8
    COLLISION_PAD = 0.6
    CORNER_ASSIST_OFFSET = 0.6
    CORNER_NUDGE_SPEED = 0.15
    MOVEMENT_STEP_SIZE = 0.5
    GOAL_DISTANCE = 1.0
    BEAM_HIT_RADIUS = 1.5
    BEAM_COLLISION_DIST = 4
    STUN_SPEED_MULT = 0.5
    PORTAL_COOLDOWN = 60
    PORTAL_INVULN_FRAMES = 10
    DEATH_TIMER_FRAMES = 50

COLLISION = _Collision()


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
def hex_to_rgb(hex_str: str) -> tuple:
    """Convert hex color string (#rrggbb or #rrggbbaa) to (r, g, b) tuple."""
    h = hex_str.lstrip('#')
    # Support both 6-char and 8-char (with alpha) hex strings
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return (r, g, b)


def hsl_to_rgb(h: float, s: float, l: float) -> tuple:
    """
    Convert HSL (h in 0-360, s and l in 0-100) to (r, g, b) tuple (0-255 each).
    Matches CSS hsl() semantics.
    """
    s_norm = s / 100.0
    l_norm = l / 100.0
    r_f, g_f, b_f = colorsys.hls_to_rgb(h / 360.0, l_norm, s_norm)
    return (round(r_f * 255), round(g_f * 255), round(b_f * 255))


# ---------------------------------------------------------------------------
# Color dataclass
# ---------------------------------------------------------------------------
class Color:
    def __init__(self, name: str, hex_str: str):
        self.name = name
        self.hex = hex_str
        self.rgb = hex_to_rgb(hex_str)

    def __repr__(self):
        return f"Color(name={self.name!r}, hex={self.hex!r}, rgb={self.rgb})"


# ---------------------------------------------------------------------------
# COLORS array  (matches JS COLORS order exactly)
# ---------------------------------------------------------------------------
COLORS = [
    Color('RED',      '#ff0000ff'),
    Color('YELLOW',   '#d9ff00ff'),
    Color('ORANGE',   '#ff8800ff'),
    Color('CYAN',     '#00aaffff'),
    Color('BLUE',     '#0000ffff'),
    Color('BLACK',    '#000000ff'),
    Color('WHITE',    '#ffffffff'),
    Color('MAGENTA',  '#ff0040ff'),
    Color('PURPLE',   '#aa00ffff'),
    Color('PINK',     '#ff00ffff'),
]


# ---------------------------------------------------------------------------
# Difficulty dataclass
# ---------------------------------------------------------------------------
class Difficulty:
    def __init__(self, name: str, hex_str: str):
        self.name = name
        self.hex = hex_str
        self.rgb = hex_to_rgb(hex_str)

    def __repr__(self):
        return f"Difficulty(name={self.name!r}, hex={self.hex!r})"


# ---------------------------------------------------------------------------
# DIFFICULTIES array
# ---------------------------------------------------------------------------
DIFFICULTIES = [
    Difficulty('BEGINNER',     '#00ff00ff'),
    Difficulty('INTERMEDIATE', '#ffff00ff'),
    Difficulty('HARD',         '#ff5100ff'),
    Difficulty('INSANE',       '#ff0000ff'),
    Difficulty('DYNAMIC',      '#00c3ffff'),
]


# ---------------------------------------------------------------------------
# TAUNTS
# ---------------------------------------------------------------------------
TAUNTS = [
    "YOUR MOTHER WAS A HAMSTER!",
    "I FART IN YOUR GENERAL DIRECTION!",
    "GO AWAY OR I SHALL TAUNT YOU AGAIN!",
    "YOU FIGHT LIKE A DAIRY FARMER!",
    "TIS BUT A SCRATCH!",
    "RUN AWAY! RUN AWAY!",
    "MY HOVERCRAFT IS FULL OF EELS!",
    "YOU EMPTY-HEADED ANIMAL!",
]


# ---------------------------------------------------------------------------
# BITMAP_FONT  — 3x5 glyphs (15 bits each), read-only copy from config.js
# Wide chars '←' and '→' are 5x5 (25 bits) and stored in BITMAP_FONT_WIDE
# ---------------------------------------------------------------------------
BITMAP_FONT = {
    'A': [0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
    'B': [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0],
    'C': [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1],
    'D': [1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0],
    'E': [1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1],
    'F': [1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0],
    'G': [0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1],
    'H': [1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
    'I': [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    'J': [0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0],
    'K': [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    'L': [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
    'M': [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
    'N': [1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
    'O': [0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    'P': [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0],
    'Q': [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1],
    'R': [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    'S': [0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0],
    'T': [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    'U': [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    'V': [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    'W': [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
    'X': [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
    'Y': [1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    'Z': [1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1],
    '0': [0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    '2': [1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1],
    '3': [1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0],
    '4': [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    '5': [1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0],
    '6': [0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0],
    '7': [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    '8': [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    '9': [0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0],
    '!': [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    ' ': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    '-': [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
    '.': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    ':': [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    '/': [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
    '↑': [0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    '↓': [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0],
}

# Wide (5x5 = 25-bit) glyphs — kept separate so BITMAP_FONT stays uniform at 15
BITMAP_FONT_WIDE = {
    '←': [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    '→': [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
}


# ---------------------------------------------------------------------------
# DIGIT_MAP  — alternative 3x5 digit rendering (from JS DIGIT_MAP)
# ---------------------------------------------------------------------------
DIGIT_MAP = {
    0: [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
    1: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    2: [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    3: [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1],
    4: [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    5: [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    6: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    7: [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    8: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
}


# ---------------------------------------------------------------------------
# CONTROLS
# ---------------------------------------------------------------------------
CONTROLS_P1 = {
    'select': 'KeySelect',
    'start':  'KeyStart',
    'up':     'KeyW',
    'down':   'KeyS',
    'left':   'KeyA',
    'right':  'KeyD',
    'shield': 'KeyR',
    'beam':   'KeyF',
    'mine':   'KeyE',
    'boost':  'KeyG',
    'boom':   'Space',
}

CONTROLS_P2 = {
    'select': 'KeySelect',
    'start':  'KeyStart',
    'up':     'ArrowUp',
    'down':   'ArrowDown',
    'left':   'ArrowLeft',
    'right':  'ArrowRight',
    'shield': 'KeyI',
    'beam':   'KeyK',
    'mine':   'KeyO',
    'boost':  'KeyL',
    'boom':   'Enter',
}

# SNES clone controller mapping (Microntek USB Joystick)
# Physical layout:        Y(3)
#                    X(0)      B(2)
#                         A(1)
# Shoulders: L(4)  R(5)   Select(8)  Start(9)
GAMEPAD_BUTTONS = {
    'beam':   1,   # A  (bottom face)
    'shield': 4,   # L  (left shoulder)
    'mine':   0,   # X  (left face)
    'boost':  5,   # R  (right shoulder)
    'boom':   2,   # B  (right face - detonate)
    'start':  9,   # Start
    'select': 8,   # Select
}
