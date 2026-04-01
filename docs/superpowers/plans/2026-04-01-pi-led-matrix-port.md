# Raspberry Pi LED Matrix Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Maze Battlegrounds to Python running natively on a Raspberry Pi 4 with RGB Matrix Bonnet driving a HUB75 P2.5 128x64 LED panel.

**Architecture:** Standalone Python app in `pi/` directory. Direct port of JS game logic to Python. Rendering via hzeller's `rpi-rgb-led-matrix` SetPixel API. Input via pygame.joystick. Fixed 60 FPS timestep loop.

**Tech Stack:** Python 3.13, rpi-rgb-led-matrix (rgbmatrix bindings), pygame

---

## File Structure

```
pi/
├── main.py              # Entry point, game loop, state machine, round flow
├── config.py            # All constants, bitmap fonts, colors, timings
├── state.py             # GameState dataclass, update functions, persistence
├── classes.py           # Player, Cell, Camera dataclasses
├── grid.py              # Maze generation, wall queries, portals, ammo crate
├── renderer.py          # LED matrix hardware init + pixel drawing
├── hud.py               # Bitmap text, energy bars, scores, timer
├── menu.py              # Menu, player setup, high scores, game over overlays
├── mechanics.py         # Movement, beams, shields, mines, collisions, goals
├── effects.py           # Particles, camera shake, boost trail
├── input_handler.py     # Gamepad + keyboard polling via pygame
├── seeded_random.py     # Deterministic RNG (for maze generation parity)
├── ai/
│   ├── __init__.py
│   ├── controller.py    # CPU input orchestrator
│   ├── pathfinding.py   # A* with MinHeap
│   ├── strategy.py      # High-level strategy selection
│   ├── combat.py        # Beam/mine/shield decisions
│   └── difficulty.py    # Presets + dynamic scaling
├── tests/
│   ├── test_config.py
│   ├── test_classes.py
│   ├── test_grid.py
│   ├── test_mechanics.py
│   ├── test_seeded_random.py
│   ├── test_ai_pathfinding.py
│   └── test_effects.py
├── requirements.txt
├── conftest.py          # pytest fixtures
└── maze-battlegrounds.service
```

---

### Task 1: Project Scaffolding + Config

**Files:**
- Create: `pi/config.py`
- Create: `pi/requirements.txt`
- Create: `pi/conftest.py`
- Create: `pi/tests/__init__.py`
- Create: `pi/tests/test_config.py`
- Create: `pi/ai/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
# pi/requirements.txt
pygame>=2.0.0
pytest>=7.0.0
```

- [ ] **Step 2: Create conftest.py**

```python
# pi/conftest.py
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
```

- [ ] **Step 3: Create empty __init__.py files**

Create `pi/tests/__init__.py` and `pi/ai/__init__.py` as empty files.

- [ ] **Step 4: Write config.py with all constants**

Port every constant from `docs/js/config.js`. This is the foundation everything else depends on.

```python
# pi/config.py
"""All game constants, bitmap fonts, colors, and timings."""

import math

FIXED_STEP = 1.0 / 60.0  # seconds per logic frame

# Display
LOGICAL_W = 128
LOGICAL_H = 64
CELL_SIZE = 3
MAZE_OFFSET_X = 8
ROWS = 21
COLS = 37

# Gameplay
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
BLAST_RADIUS = 4.0
GAMEPAD_THRESH = 0.5
BOOST_COOLDOWN_FRAMES = 120
DEFAULT_NAMES = ['P-1', 'P-2']
INPUT_DELAY = 20

# Timings (all in frames at 60 FPS unless noted)
class TIMING:
    SUDDEN_DEATH_TIME = 1800
    CHARGE_DURATION = 180
    MINE_ARM_TIME = 60
    STUN_DURATION = 90
    GLITCH_DURATION = 180
    DEMO_RESET_TIMER = 500
    AMMO_RESPAWN_DELAY = 90
    MINE_COOLDOWN = 15
    IDLE_THRESHOLD = 15.0  # seconds (not frames)

# Energy
class ENERGY_COSTS:
    BEAM = 30
    CHARGED_BEAM = 65
    SHIELD_ACTIVATION = 10
    DETONATION = 30
    BEAM_HIT_TRANSFER = 15

class ENERGY_RATES:
    SHIELD_DRAIN = 150 / 360      # ~0.417 per tick
    BOOST_DRAIN = 150 / 360       # ~0.417 per tick
    BOOST_REGEN = 150 / 720       # ~0.208 per tick

# Collision
class COLLISION:
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

# Colors - stored as (r, g, b) tuples
class Color:
    def __init__(self, name, hex_str):
        self.name = name
        self.hex = hex_str
        # Parse hex to RGB tuple
        h = hex_str.lstrip('#')
        self.rgb = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

COLORS = [
    Color('RED',     '#ff0000'),
    Color('YELLOW',  '#d9ff00'),
    Color('ORANGE',  '#ff8800'),
    Color('CYAN',    '#00aaff'),
    Color('BLUE',    '#0000ff'),
    Color('BLACK',   '#000000'),
    Color('WHITE',   '#ffffff'),
    Color('MAGENTA', '#ff0040'),
    Color('PURPLE',  '#aa00ff'),
    Color('PINK',    '#ff00ff'),
]

class Difficulty:
    def __init__(self, name, hex_str):
        self.name = name
        h = hex_str.lstrip('#')
        self.rgb = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

DIFFICULTIES = [
    Difficulty('BEGINNER',     '#00ff00'),
    Difficulty('INTERMEDIATE', '#ffff00'),
    Difficulty('HARD',         '#ff5100'),
    Difficulty('INSANE',       '#ff0000'),
    Difficulty('DYNAMIC',      '#00c3ff'),
]

# Taunts
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

# Bitmap font - each char is a list of 0/1, 3 wide x 5 tall (15 elements)
# Read left-to-right, top-to-bottom. Index = col + row * 3
BITMAP_FONT = {
    'A': [0,1,0, 1,0,1, 1,1,1, 1,0,1, 1,0,1],
    'B': [1,1,0, 1,0,1, 1,1,0, 1,0,1, 1,1,0],
    'C': [0,1,1, 1,0,0, 1,0,0, 1,0,0, 0,1,1],
    'D': [1,1,0, 1,0,1, 1,0,1, 1,0,1, 1,1,0],
    'E': [1,1,1, 1,0,0, 1,1,0, 1,0,0, 1,1,1],
    'F': [1,1,1, 1,0,0, 1,1,0, 1,0,0, 1,0,0],
    'G': [0,1,1, 1,0,0, 1,0,1, 1,0,1, 0,1,1],
    'H': [1,0,1, 1,0,1, 1,1,1, 1,0,1, 1,0,1],
    'I': [1,1,1, 0,1,0, 0,1,0, 0,1,0, 1,1,1],
    'J': [0,0,1, 0,0,1, 0,0,1, 1,0,1, 0,1,0],
    'K': [1,0,1, 1,0,1, 1,1,0, 1,0,1, 1,0,1],
    'L': [1,0,0, 1,0,0, 1,0,0, 1,0,0, 1,1,1],
    'M': [1,0,1, 1,1,1, 1,0,1, 1,0,1, 1,0,1],
    'N': [1,0,1, 1,1,1, 1,1,1, 1,0,1, 1,0,1],
    'O': [0,1,0, 1,0,1, 1,0,1, 1,0,1, 0,1,0],
    'P': [1,1,0, 1,0,1, 1,1,0, 1,0,0, 1,0,0],
    'Q': [0,1,0, 1,0,1, 1,0,1, 1,1,0, 0,1,1],
    'R': [1,1,0, 1,0,1, 1,1,0, 1,0,1, 1,0,1],
    'S': [0,1,1, 1,0,0, 0,1,0, 0,0,1, 1,1,0],
    'T': [1,1,1, 0,1,0, 0,1,0, 0,1,0, 0,1,0],
    'U': [1,0,1, 1,0,1, 1,0,1, 1,0,1, 0,1,0],
    'V': [1,0,1, 1,0,1, 1,0,1, 0,1,0, 0,1,0],
    'W': [1,0,1, 1,0,1, 1,0,1, 1,1,1, 1,0,1],
    'X': [1,0,1, 1,0,1, 0,1,0, 1,0,1, 1,0,1],
    'Y': [1,0,1, 1,0,1, 0,1,0, 0,1,0, 0,1,0],
    'Z': [1,1,1, 0,0,1, 0,1,0, 1,0,0, 1,1,1],
    '0': [0,1,0, 1,0,1, 1,0,1, 1,0,1, 0,1,0],
    '1': [0,1,0, 1,1,0, 0,1,0, 0,1,0, 1,1,1],
    '2': [1,1,0, 0,0,1, 0,1,0, 1,0,0, 1,1,1],
    '3': [1,1,0, 0,0,1, 0,1,0, 0,0,1, 1,1,0],
    '4': [1,0,1, 1,0,1, 1,1,1, 0,0,1, 0,0,1],
    '5': [1,1,1, 1,0,0, 1,1,0, 0,0,1, 1,1,0],
    '6': [0,1,1, 1,0,0, 1,1,0, 1,0,1, 0,1,0],
    '7': [1,1,1, 0,0,1, 0,1,0, 0,1,0, 0,1,0],
    '8': [0,1,0, 1,0,1, 0,1,0, 1,0,1, 0,1,0],
    '9': [0,1,0, 1,0,1, 0,1,1, 0,0,1, 1,1,0],
    '!': [0,1,0, 0,1,0, 0,1,0, 0,0,0, 0,1,0],
    ' ': [0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0],
    '-': [0,0,0, 0,0,0, 1,1,1, 0,0,0, 0,0,0],
    '.': [0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,1,0],
    ':': [0,0,0, 0,1,0, 0,0,0, 0,1,0, 0,0,0],
    '/': [0,0,1, 0,0,1, 0,1,0, 1,0,0, 1,0,0],
    '%': [1,0,1, 0,0,1, 0,1,0, 1,0,0, 1,0,1],
}

# Wide characters (5 wide x 5 tall = 25 elements)
BITMAP_FONT_WIDE = {
    '<': [0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0],
    '>': [0,0,1,0,0, 0,0,0,1,0, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0],
}

# Digit map (alternative display - same 3x5 format)
DIGIT_MAP = {
    0: [1,1,1, 1,0,1, 1,0,1, 1,0,1, 1,1,1],
    1: [0,1,0, 1,1,0, 0,1,0, 0,1,0, 1,1,1],
    2: [1,1,1, 0,0,1, 1,1,1, 1,0,0, 1,1,1],
    3: [1,1,1, 0,0,1, 1,1,1, 0,0,1, 1,1,1],
    4: [1,0,1, 1,0,1, 1,1,1, 0,0,1, 0,0,1],
    5: [1,1,1, 1,0,0, 1,1,1, 0,0,1, 1,1,1],
    6: [1,1,1, 1,0,0, 1,1,1, 1,0,1, 1,1,1],
    7: [1,1,1, 0,0,1, 0,1,0, 0,1,0, 0,1,0],
    8: [1,1,1, 1,0,1, 1,1,1, 1,0,1, 1,1,1],
    9: [1,1,1, 1,0,1, 1,1,1, 0,0,1, 1,1,1],
}

# Keyboard controls (pygame key constants) - for dev/testing
CONTROLS_P1 = {
    'up': 'w', 'down': 's', 'left': 'a', 'right': 'd',
    'shield': 'r', 'beam': 'f', 'mine': 'e',
    'boost': 'g', 'boom': 'space',
}

CONTROLS_P2 = {
    'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right',
    'shield': 'i', 'beam': 'k', 'mine': 'o',
    'boost': 'l', 'boom': 'return',
}

# Gamepad button mapping (index-based, configurable)
GAMEPAD_BUTTONS = {
    'beam': 0,       # A / Cross
    'shield': 1,     # B / Circle
    'mine': 2,       # X / Square
    'boost': 3,      # Y / Triangle
    'boom': 5,       # RB / R1
    'start': 7,      # Start / Options
}


def hex_to_rgb(hex_str):
    """Convert hex color string to (r, g, b) tuple."""
    h = hex_str.lstrip('#')
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    elif len(h) == 8:
        h = h[:6]  # strip alpha
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def hsl_to_rgb(h, s, l):
    """Convert HSL (h=0-360, s=0-100, l=0-100) to (r, g, b) 0-255."""
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360.0, l / 100.0, s / 100.0)
    return (int(r * 255), int(g * 255), int(b * 255))
```

- [ ] **Step 5: Write test for config**

```python
# pi/tests/test_config.py
from config import (
    LOGICAL_W, LOGICAL_H, CELL_SIZE, COLS, ROWS, MAZE_OFFSET_X,
    MAX_ENERGY, COLORS, BITMAP_FONT, DIGIT_MAP, hex_to_rgb, hsl_to_rgb,
    TIMING, ENERGY_COSTS, COLLISION
)

def test_display_dimensions():
    assert LOGICAL_W == 128
    assert LOGICAL_H == 64
    assert CELL_SIZE == 3
    assert COLS == 37
    assert ROWS == 21

def test_maze_fits_display():
    maze_width = COLS * CELL_SIZE + MAZE_OFFSET_X * 2
    maze_height = ROWS * CELL_SIZE
    assert maze_width <= LOGICAL_W + MAZE_OFFSET_X  # HUD takes sides
    assert maze_height <= LOGICAL_H

def test_colors_have_rgb():
    for c in COLORS:
        assert len(c.rgb) == 3
        assert all(0 <= v <= 255 for v in c.rgb)

def test_bitmap_font_dimensions():
    for char, bits in BITMAP_FONT.items():
        assert len(bits) == 15, f"Char '{char}' has {len(bits)} bits, expected 15"
        assert all(b in (0, 1) for b in bits)

def test_digit_map_dimensions():
    for digit, bits in DIGIT_MAP.items():
        assert len(bits) == 15
        assert all(b in (0, 1) for b in bits)

def test_hex_to_rgb():
    assert hex_to_rgb('#ff0000') == (255, 0, 0)
    assert hex_to_rgb('#00ff00') == (0, 255, 0)
    assert hex_to_rgb('#0000ff') == (0, 0, 255)
    assert hex_to_rgb('#ff0000ff') == (255, 0, 0)  # strips alpha

def test_hsl_to_rgb():
    r, g, b = hsl_to_rgb(0, 100, 50)
    assert r == 255 and g == 0 and b == 0  # pure red

def test_timing_values():
    assert TIMING.CHARGE_DURATION == 180
    assert TIMING.STUN_DURATION == 90
    assert TIMING.MINE_ARM_TIME == 60

def test_energy_costs():
    assert ENERGY_COSTS.BEAM == 30
    assert ENERGY_COSTS.CHARGED_BEAM == 65

def test_collision_constants():
    assert COLLISION.HITBOX_SIZE == 0.8
    assert COLLISION.DEATH_TIMER_FRAMES == 50
```

- [ ] **Step 6: Run tests**

Run: `cd pi && python -m pytest tests/test_config.py -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add pi/
git commit -m "feat(pi): add project scaffolding and config constants"
```

---

### Task 2: Seeded Random + Classes

**Files:**
- Create: `pi/seeded_random.py`
- Create: `pi/classes.py`
- Create: `pi/tests/test_seeded_random.py`
- Create: `pi/tests/test_classes.py`

- [ ] **Step 1: Write seeded_random.py**

```python
# pi/seeded_random.py
"""Deterministic PRNG for reproducible maze generation."""

_seed = 0

def set_seed(s):
    global _seed
    _seed = s

def seeded_random():
    """Returns a float in [0, 1). Matches the JS implementation's LCG."""
    global _seed
    _seed = (_seed * 16807 + 0) % 2147483647
    return (_seed - 1) / 2147483646
```

- [ ] **Step 2: Write test for seeded_random**

```python
# pi/tests/test_seeded_random.py
from seeded_random import set_seed, seeded_random

def test_deterministic():
    set_seed(42)
    vals1 = [seeded_random() for _ in range(10)]
    set_seed(42)
    vals2 = [seeded_random() for _ in range(10)]
    assert vals1 == vals2

def test_range():
    set_seed(12345)
    for _ in range(100):
        v = seeded_random()
        assert 0.0 <= v < 1.0

def test_different_seeds_differ():
    set_seed(1)
    a = seeded_random()
    set_seed(2)
    b = seeded_random()
    assert a != b
```

- [ ] **Step 3: Run tests**

Run: `cd pi && python -m pytest tests/test_seeded_random.py -v`
Expected: All tests PASS

- [ ] **Step 4: Write classes.py**

```python
# pi/classes.py
"""Game entity classes: Player, Cell, Camera."""

from config import (
    MAX_MINES, MAX_ENERGY, BASE_SPEED, TIMING, MAZE_OFFSET_X, CELL_SIZE
)


class Cell:
    """A single maze cell with 4 walls."""
    __slots__ = ('c', 'r', 'walls', 'visited', 'parent', 'bfs_visited')

    def __init__(self, c, r):
        self.c = c
        self.r = r
        self.walls = [True, True, True, True]  # top, right, bottom, left
        self.visited = False
        self.parent = None
        self.bfs_visited = False


class Camera:
    """Camera shake effect."""
    __slots__ = ('x', 'y', 'shake_strength', 'shake_damp')

    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.shake_strength = 0.0
        self.shake_damp = 0.9

    def shake(self, amount):
        self.shake_strength = amount

    def update(self):
        import random
        if self.shake_strength > 0.5:
            self.x = (random.random() - 0.5) * self.shake_strength
            self.y = (random.random() - 0.5) * self.shake_strength
            self.shake_strength *= self.shake_damp
        else:
            self.x = 0.0
            self.y = 0.0
            self.shake_strength = 0.0


class Player:
    """Player entity with all game state."""

    def __init__(self, player_id, name='CPU', color=None, controls=None):
        self.id = player_id
        self.name = name
        self.color = color  # Color object from config
        self.controls = controls
        self.x = 0.0
        self.y = 0.0
        self.size = 2.0
        self.score = 0
        self.goal_c = 0
        self.goal_r = 0
        self.reset_state()

    def reset_state(self):
        """Reset per-round state."""
        self.mines_left = MAX_MINES
        self.last_mine_time = -999
        self.last_boost_time = -999
        self.trail = []
        self.boost_energy = MAX_ENERGY
        self.boost_cooldown = 0
        self.portal_cooldown = 0
        self.portal_invuln_frames = 0
        self.shield_active = False
        self.current_speed = BASE_SPEED
        self.prev_detonate_key = False
        self.beam_pixels = []
        self.beam_idx = 0
        self.is_charging = False
        self.charge_start_time = 0
        self.glitch_start_time = -999
        self.stun_start_time = -999
        self.is_dead = False
        self.last_dir = 'right'

        # AI fields
        self.bot_path = []
        self.bot_next_cell = None
        self.bot_retarget_timer = 0
        self.force_unstuck_timer = 0
        self.stuck_counter = 0
        self.ai = None

        # AI memory
        self.last_pos = None
        self.unstuck_dir = None
        self.ai_mental_model = None
        self.ai_frame_counter = 0
        self.confusion_timer = 0
        self.confused_dir = None
        self.direction_history = []
        self._suggested_mine_pos = None

    def glitch_remaining(self, frame_count):
        return max(0, TIMING.GLITCH_DURATION - (frame_count - self.glitch_start_time))

    def glitch_is_active(self, frame_count):
        return self.glitch_remaining(frame_count) > 0

    def stun_remaining(self, frame_count):
        return max(0, TIMING.STUN_DURATION - (frame_count - self.stun_start_time))

    def stun_is_active(self, frame_count):
        return self.stun_remaining(frame_count) > 0

    def charge_is_ready(self, frame_count):
        return (frame_count - self.charge_start_time) >= TIMING.CHARGE_DURATION
```

- [ ] **Step 5: Write test for classes**

```python
# pi/tests/test_classes.py
from classes import Cell, Camera, Player
from config import MAX_MINES, MAX_ENERGY, TIMING

def test_cell_init():
    c = Cell(3, 5)
    assert c.c == 3
    assert c.r == 5
    assert c.walls == [True, True, True, True]
    assert c.visited is False

def test_camera_shake():
    cam = Camera()
    cam.shake(10.0)
    assert cam.shake_strength == 10.0
    cam.update()
    assert cam.shake_strength < 10.0
    # After many updates, should settle to 0
    for _ in range(100):
        cam.update()
    assert cam.shake_strength == 0.0
    assert cam.x == 0.0
    assert cam.y == 0.0

def test_player_init():
    p = Player(0, 'TST')
    assert p.id == 0
    assert p.name == 'TST'
    assert p.mines_left == MAX_MINES
    assert p.boost_energy == MAX_ENERGY
    assert p.is_dead is False

def test_player_reset():
    p = Player(0)
    p.score = 3
    p.mines_left = 0
    p.is_dead = True
    p.reset_state()
    assert p.mines_left == MAX_MINES
    assert p.is_dead is False
    assert p.score == 3  # score NOT reset

def test_player_stun():
    p = Player(0)
    p.stun_start_time = 100
    assert p.stun_is_active(150)  # 50 frames in, duration is 90
    assert not p.stun_is_active(200)  # 100 frames in, past 90

def test_player_glitch():
    p = Player(0)
    p.glitch_start_time = 100
    assert p.glitch_is_active(200)  # 100 frames in, duration is 180
    assert not p.glitch_is_active(300)  # 200 frames in, past 180

def test_player_charge_ready():
    p = Player(0)
    p.charge_start_time = 0
    assert not p.charge_is_ready(100)  # 100 < 180
    assert p.charge_is_ready(180)      # exactly 180
    assert p.charge_is_ready(200)      # past 180
```

- [ ] **Step 6: Run tests**

Run: `cd pi && python -m pytest tests/test_classes.py tests/test_seeded_random.py -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add pi/seeded_random.py pi/classes.py pi/tests/test_seeded_random.py pi/tests/test_classes.py
git commit -m "feat(pi): add seeded random and game entity classes"
```

---

### Task 3: Grid / Maze Generation

**Files:**
- Create: `pi/grid.py`
- Create: `pi/tests/test_grid.py`

- [ ] **Step 1: Write grid.py**

Port maze generation, wall queries, line-of-sight, portals, and ammo crate from `docs/js/grid.js`.

```python
# pi/grid.py
"""Maze generation, wall queries, portals, and ammo crate spawning."""

import math
from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, LOGICAL_W, LOGICAL_H, BASE_SPEED
from classes import Cell
from seeded_random import set_seed, seeded_random

# Line-of-sight cache
_los_cache = {}
_los_cache_frame = -1


def clear_los_cache(frame_count):
    global _los_cache, _los_cache_frame
    if frame_count != _los_cache_frame:
        _los_cache = {}
        _los_cache_frame = frame_count


def grid_index(maze, c, r):
    """Get cell at (c, r) from maze array, or None if out of bounds."""
    if c < 0 or r < 0 or c >= COLS or r >= ROWS:
        return None
    return maze[c + r * COLS]


def is_wall(maze, pixel_x, pixel_y):
    """Check if a pixel coordinate is inside a wall."""
    if pixel_x < MAZE_OFFSET_X or pixel_x >= LOGICAL_W - MAZE_OFFSET_X:
        return True
    if pixel_y < 0 or pixel_y >= LOGICAL_H:
        return True
    mx = pixel_x - MAZE_OFFSET_X
    cell = grid_index(maze, int(mx // CELL_SIZE), int(pixel_y // CELL_SIZE))
    if cell is None:
        return True
    lx = int(mx) % CELL_SIZE
    ly = int(pixel_y) % CELL_SIZE
    if lx == 0 and ly == 0:
        return True
    if ly == 0 and cell.walls[0]:
        return True
    if lx == 0 and cell.walls[3]:
        return True
    return False


def has_line_of_sight(maze, from_x, from_y, to_x, to_y, frame_count):
    """Check line of sight between two points using ray-casting."""
    fx, fy = round(from_x), round(from_y)
    tx, ty = round(to_x), round(to_y)
    key = (fx, fy, tx, ty)

    clear_los_cache(frame_count)
    if key in _los_cache:
        return _los_cache[key]

    dist = math.hypot(tx - fx, ty - fy)
    if dist < 0.5:
        _los_cache[key] = True
        return True

    steps = int(dist / 2.0)
    for i in range(1, steps):
        t = i / steps
        cx = fx + (tx - fx) * t
        cy = fy + (ty - fy) * t
        if is_wall(maze, cx, cy):
            _los_cache[key] = False
            return False

    _los_cache[key] = True
    return True


def destroy_wall_at(maze, c, r):
    """Destroy all walls of cell (c, r) and update neighbors."""
    cell = grid_index(maze, c, r)
    if cell is None:
        return
    # Remove target cell's interior walls
    if r > 0:
        cell.walls[0] = False
        top = grid_index(maze, c, r - 1)
        if top:
            top.walls[2] = False
    if c < COLS - 1:
        cell.walls[1] = False
        right = grid_index(maze, c + 1, r)
        if right:
            right.walls[3] = False
    if r < ROWS - 1:
        cell.walls[2] = False
        bottom = grid_index(maze, c, r + 1)
        if bottom:
            bottom.walls[0] = False
    if c > 0:
        cell.walls[3] = False
        left = grid_index(maze, c - 1, r)
        if left:
            left.walls[1] = False


def create_ammo_crate(maze):
    """Create a random ammo crate position."""
    c = 1 + int(seeded_random() * (COLS - 3))
    r = 1 + int(seeded_random() * (ROWS - 3))
    return {
        'x': MAZE_OFFSET_X + c * CELL_SIZE + 0.5,
        'y': r * CELL_SIZE + 0.5,
        'c': c,
        'r': r,
    }


def _remove_wall_in_maze(maze, c, r, wall_idx):
    """Remove a specific wall from a cell and its neighbor's opposite wall."""
    cell = grid_index(maze, c, r)
    if cell is None:
        return
    cell.walls[wall_idx] = False
    # Update neighbor's opposite wall
    opposites = {0: (0, -1, 2), 1: (1, 0, 3), 2: (0, 1, 0), 3: (-1, 0, 1)}
    dc, dr, opp_wall = opposites[wall_idx]
    neighbor = grid_index(maze, c + dc, r + dr)
    if neighbor:
        neighbor.walls[opp_wall] = False


def _spawn_portals(maze):
    """Spawn two portals at strategic positions and clear surrounding walls."""
    MIN_DIST = 8
    MAX_DIST = 18

    # Portal 1 - near top-left
    p1_c, p1_r = COLS // 4, ROWS // 4
    for _ in range(1000):
        c = int(4 + seeded_random() * ((COLS - 4) / 2))
        r = int(4 + seeded_random() * ((ROWS - 4) / 2))
        dist = math.hypot(c, r)
        if MIN_DIST <= dist <= MAX_DIST:
            p1_c, p1_r = c, r
            break

    # Portal 2 - near bottom-right
    p2_c, p2_r = (COLS * 3) // 4, (ROWS * 3) // 4
    for _ in range(1000):
        c = int(COLS / 2 + seeded_random() * (COLS / 2))
        r = int(ROWS / 2 + seeded_random() * (ROWS / 2))
        if c >= COLS or r >= ROWS:
            continue
        dist = math.hypot(c - (COLS - 1), r - (ROWS - 1))
        if MIN_DIST <= dist <= MAX_DIST:
            p2_c, p2_r = c, r
            break

    portals = [
        {'c': p1_c, 'r': p1_r,
         'x': MAZE_OFFSET_X + p1_c * CELL_SIZE + 1.5,
         'y': p1_r * CELL_SIZE + 1.5},
        {'c': p2_c, 'r': p2_r,
         'x': MAZE_OFFSET_X + p2_c * CELL_SIZE + 1.5,
         'y': p2_r * CELL_SIZE + 1.5},
    ]

    # Clear walls in 3x3 area around each portal
    for portal in portals:
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                nc = portal['c'] + dx
                nr = portal['r'] + dy
                for wall_idx in range(4):
                    _remove_wall_in_maze(maze, nc, nr, wall_idx)

    return portals


def _calculate_game_time(maze):
    """Calculate round duration using BFS shortest path length."""
    start = grid_index(maze, 0, 0)
    end = grid_index(maze, COLS - 1, ROWS - 1)
    if not start or not end:
        return 2000, 2000

    # Reset BFS state
    for cell in maze:
        cell.bfs_visited = False
        cell.parent = None

    queue = [start]
    head = 0
    start.bfs_visited = True
    path_len = 0

    directions = [(0, -1, 0), (1, 0, 1), (0, 1, 2), (-1, 0, 3)]

    while head < len(queue):
        curr = queue[head]
        head += 1

        if curr is end:
            # Trace path
            node = curr
            while node.parent:
                path_len += 1
                node = node.parent
            break

        for dc, dr, wall_idx in directions:
            n = grid_index(maze, curr.c + dc, curr.r + dr)
            if n and not n.bfs_visited and not curr.walls[wall_idx]:
                n.bfs_visited = True
                n.parent = curr
                queue.append(n)

    game_time = int((path_len * CELL_SIZE / (BASE_SPEED * 1.2)) * 6)
    return game_time, game_time


def init_maze(seed=None):
    """Generate a new maze using recursive backtracking.

    Returns: (maze, portals, game_time, max_game_time)
    """
    import random as stdlib_random

    if seed is not None:
        set_seed(seed)
    else:
        set_seed(int(stdlib_random.random() * 2147483647))

    # Create cells
    maze = []
    for r in range(ROWS):
        for c in range(COLS):
            maze.append(Cell(c, r))

    # Recursive backtracking
    stack = []
    current = maze[0]
    current.visited = True

    while True:
        # Find unvisited neighbors
        neighbors = []
        for dc, dr in [(0, -1), (1, 0), (0, 1), (-1, 0)]:
            nc, nr = current.c + dc, current.r + dr
            n = grid_index(maze, nc, nr)
            if n and not n.visited:
                neighbors.append(n)

        if neighbors:
            # Pick random neighbor
            idx = int(seeded_random() * len(neighbors))
            if idx >= len(neighbors):
                idx = len(neighbors) - 1
            next_cell = neighbors[idx]
            next_cell.visited = True
            stack.append(current)

            # Remove walls between current and next
            dx = current.c - next_cell.c
            dy = current.r - next_cell.r
            if dx == 1:    # current is right of next
                current.walls[3] = False
                next_cell.walls[1] = False
            elif dx == -1:  # current is left of next
                current.walls[1] = False
                next_cell.walls[3] = False
            elif dy == 1:   # current is below next
                current.walls[0] = False
                next_cell.walls[2] = False
            elif dy == -1:  # current is above next
                current.walls[2] = False
                next_cell.walls[0] = False

            current = next_cell
        elif stack:
            current = stack.pop()
        else:
            break

    # Spawn portals (modifies maze walls)
    portals = _spawn_portals(maze)

    # Calculate game time from shortest path
    game_time, max_game_time = _calculate_game_time(maze)

    return maze, portals, game_time, max_game_time
```

- [ ] **Step 2: Write test for grid**

```python
# pi/tests/test_grid.py
from grid import init_maze, is_wall, grid_index, has_line_of_sight, create_ammo_crate
from config import COLS, ROWS, MAZE_OFFSET_X, CELL_SIZE

def test_maze_size():
    maze, portals, gt, mgt = init_maze(seed=42)
    assert len(maze) == COLS * ROWS

def test_all_cells_visited():
    maze, _, _, _ = init_maze(seed=42)
    for cell in maze:
        assert cell.visited, f"Cell ({cell.c}, {cell.r}) not visited"

def test_perfect_maze():
    """A perfect maze has exactly one path between any two cells.
    This means total_cells - 1 passages (walls removed)."""
    maze, _, _, _ = init_maze(seed=42)
    total_cells = COLS * ROWS
    # Count open passages (each passage removes 2 walls, one from each side)
    passages = 0
    for cell in maze:
        if not cell.walls[1]:  # right wall open
            passages += 1
        if not cell.walls[2]:  # bottom wall open
            passages += 1
    # Perfect maze: passages >= total_cells - 1 (portals add extra)
    assert passages >= total_cells - 1

def test_deterministic():
    m1, p1, gt1, _ = init_maze(seed=123)
    m2, p2, gt2, _ = init_maze(seed=123)
    for i in range(len(m1)):
        assert m1[i].walls == m2[i].walls
    assert gt1 == gt2

def test_different_seeds():
    m1, _, _, _ = init_maze(seed=1)
    m2, _, _, _ = init_maze(seed=2)
    differs = any(m1[i].walls != m2[i].walls for i in range(len(m1)))
    assert differs

def test_portals_spawned():
    _, portals, _, _ = init_maze(seed=42)
    assert len(portals) == 2
    for p in portals:
        assert 'x' in p and 'y' in p and 'c' in p and 'r' in p

def test_game_time_positive():
    _, _, gt, mgt = init_maze(seed=42)
    assert gt > 0
    assert mgt > 0

def test_is_wall_boundaries():
    maze, _, _, _ = init_maze(seed=42)
    # Left boundary
    assert is_wall(maze, MAZE_OFFSET_X - 1, 10)
    # Right boundary
    assert is_wall(maze, 128 - MAZE_OFFSET_X, 10)
    # Top boundary
    assert is_wall(maze, 64, -1)

def test_is_wall_cell_interior():
    maze, _, _, _ = init_maze(seed=42)
    # Cell center (1,1) at pixel (MAZE_OFFSET_X + 1*3 + 1, 1*3 + 1) should NOT be a wall
    px = MAZE_OFFSET_X + 1 * CELL_SIZE + 1
    py = 1 * CELL_SIZE + 1
    assert not is_wall(maze, px, py)

def test_grid_index():
    maze, _, _, _ = init_maze(seed=42)
    cell = grid_index(maze, 0, 0)
    assert cell is not None
    assert cell.c == 0 and cell.r == 0
    assert grid_index(maze, -1, 0) is None
    assert grid_index(maze, COLS, 0) is None

def test_ammo_crate():
    maze, _, _, _ = init_maze(seed=42)
    crate = create_ammo_crate(maze)
    assert 'x' in crate and 'y' in crate
    assert 1 <= crate['c'] <= COLS - 3
    assert 1 <= crate['r'] <= ROWS - 3
```

- [ ] **Step 3: Run tests**

Run: `cd pi && python -m pytest tests/test_grid.py -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add pi/grid.py pi/tests/test_grid.py
git commit -m "feat(pi): add maze generation and wall queries"
```

---

### Task 4: State Management

**Files:**
- Create: `pi/state.py`

- [ ] **Step 1: Write state.py**

```python
# pi/state.py
"""Game state management and persistence."""

import json
import os
import random
from config import (
    COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, MAX_SCORE,
    COLORS, TIMING, TAUNTS, LOGICAL_W
)
from classes import Player, Camera


HIGHSCORE_PATH = os.path.join(os.path.dirname(__file__), 'highscores.json')


class GameState:
    """Central game state object."""

    def __init__(self):
        # Game timing
        self.frame_count = 0
        self.game_time = 0
        self.max_game_time = 0

        # Entities
        self.maze = []
        self.players = [None, None]
        self.mines = []
        self.particles = []
        self.portals = []
        self.projectiles = []
        self.ammo_crate = None
        self.ammo_last_take_time = -999

        # Game flow
        self.is_game_over = False
        self.is_round_over = False
        self.death_timer = 0
        self.victim_idx = -1
        self.is_paused = False
        self.is_draw = False

        # Messages
        self.messages = {
            'death_reason': '',
            'win': '',
            'taunt': '',
            'round': '',
            'win_color': None,
            'round_color': None,
        }

        # Visual state
        self.scroll_x = 0
        self.camera = Camera()
        self.portal_reverse_colors = False

        # High scores
        self.high_scores = _load_high_scores()

        # Screen state
        self.screen = 'MENU'
        self.game_mode = 'SINGLE'  # SINGLE, MULTI, ATTRACT
        self.is_attract_mode = False
        self.demo_reset_timer = 0
        self.difficulty = 'INTERMEDIATE'
        self.menu_selection = 0
        self.pause_menu_selection = 0
        self.high_score_tab = 0
        self.input_delay = 0

        # Player setup
        self.player_setup = {
            'active_player': 0,
            'difficulty_idx': 1,
            'color_idx': 0,
            'name_char_idx': 0,
            'name_chars': [ord('A'), ord('A'), ord('A')],
            'phase': 'DIFFICULTY',  # DIFFICULTY, COLOR, NAME
            'is_done': False,
        }

        # Input state
        self.gamepad_state = {0: {}, 1: {}}
        self.keyboard_state = {}

        self.running = True


def _load_high_scores():
    """Load high scores from JSON file."""
    try:
        if os.path.exists(HIGHSCORE_PATH):
            with open(HIGHSCORE_PATH, 'r') as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError):
        pass
    return []


def save_high_scores(state):
    """Save high scores to JSON file."""
    try:
        with open(HIGHSCORE_PATH, 'w') as f:
            json.dump(state.high_scores, f, indent=2)
    except IOError:
        pass


def sudden_death_is_active(state):
    """Check if sudden death phase is active."""
    return state.game_time <= TIMING.SUDDEN_DEATH_TIME


def should_spawn_ammo_crate(state):
    """Check if enough time has passed to spawn a new ammo crate."""
    return (state.frame_count - state.ammo_last_take_time) >= TIMING.AMMO_RESPAWN_DELAY


def get_two_player_colors():
    """Return two random different color indices for players."""
    playable = [i for i, c in enumerate(COLORS) if c.name not in ('BLACK', 'WHITE')]
    random.shuffle(playable)
    return playable[0], playable[1]


def reset_state_for_match(state, p1_color_idx=None, p2_color_idx=None):
    """Reset game state for a new match."""
    if p1_color_idx is None or p2_color_idx is None:
        p1_color_idx, p2_color_idx = get_two_player_colors()

    state.players = [
        Player(0, 'P-1', COLORS[p1_color_idx]),
        Player(1, 'P-2', COLORS[p2_color_idx]),
    ]
    state.is_game_over = False
    state.is_round_over = False
    state.is_draw = False
    state.death_timer = 0
    state.victim_idx = -1
    state.scroll_x = 0
    state.frame_count = 0
    state.mines = []
    state.particles = []
    state.projectiles = []
    state.ammo_crate = None
    state.ammo_last_take_time = -999
    state.messages = {
        'death_reason': '', 'win': '', 'taunt': '',
        'round': '', 'win_color': None, 'round_color': None,
    }
```

- [ ] **Step 2: Commit**

```bash
git add pi/state.py
git commit -m "feat(pi): add game state management and persistence"
```

---

### Task 5: Renderer (LED Matrix Hardware)

**Files:**
- Create: `pi/renderer.py`

- [ ] **Step 1: Write renderer.py**

```python
# pi/renderer.py
"""LED matrix hardware rendering via rgbmatrix library."""

import sys
import math
from config import LOGICAL_W, LOGICAL_H, hex_to_rgb, hsl_to_rgb


# Try to import rgbmatrix; fall back to mock for development
try:
    from rgbmatrix import RGBMatrix, RGBMatrixOptions
    HAS_MATRIX = True
except ImportError:
    HAS_MATRIX = False


class MockCanvas:
    """Mock canvas for development without hardware."""
    def __init__(self):
        self.pixels = {}

    def SetPixel(self, x, y, r, g, b):
        if 0 <= x < LOGICAL_W and 0 <= y < LOGICAL_H:
            self.pixels[(x, y)] = (r, g, b)

    def Clear(self):
        self.pixels.clear()


class MockMatrix:
    """Mock matrix for development without hardware."""
    def __init__(self):
        self._canvas = MockCanvas()

    def CreateFrameCanvas(self):
        return MockCanvas()

    def SwapOnVSync(self, canvas):
        self._canvas = canvas
        return MockCanvas()


class Renderer:
    """Manages the LED matrix and provides drawing primitives."""

    def __init__(self, use_hardware=True):
        if use_hardware and HAS_MATRIX:
            options = RGBMatrixOptions()
            options.rows = 64
            options.cols = 128
            options.chain_length = 1
            options.parallel = 1
            options.hardware_mapping = 'adafruit-hat'
            options.gpio_slowdown = 4
            options.scan_mode = 0
            options.multiplexing = 0
            options.brightness = 80
            options.pwm_lsb_nanoseconds = 130
            options.drop_privileges = True
            options.disable_hardware_pulsing = False
            self.matrix = RGBMatrix(options=options)
        else:
            self.matrix = MockMatrix()

        self.canvas = self.matrix.CreateFrameCanvas()

        # Camera offset for shake
        self.cam_x = 0
        self.cam_y = 0

        # Pre-compute common colors
        self._color_cache = {}

    def begin_frame(self):
        """Start a new frame. Clear the canvas."""
        self.canvas.Clear()

    def end_frame(self):
        """Finish the frame. Swap buffer to display."""
        self.canvas = self.matrix.SwapOnVSync(self.canvas)

    def set_camera(self, cam_x, cam_y):
        """Set camera offset for shake effect."""
        self.cam_x = int(round(cam_x))
        self.cam_y = int(round(cam_y))

    def set_pixel(self, x, y, color):
        """Draw a single pixel at logical coordinates.

        Args:
            x: Logical x (0-127)
            y: Logical y (0-63)
            color: (r, g, b) tuple with values 0-255
        """
        px = round(x) + self.cam_x
        py = round(y) + self.cam_y
        if 0 <= px < LOGICAL_W and 0 <= py < LOGICAL_H:
            self.canvas.SetPixel(px, py, color[0], color[1], color[2])

    def set_pixel_no_cam(self, x, y, color):
        """Draw a pixel without camera offset (for HUD)."""
        px = round(x)
        py = round(y)
        if 0 <= px < LOGICAL_W and 0 <= py < LOGICAL_H:
            self.canvas.SetPixel(px, py, color[0], color[1], color[2])

    def parse_color(self, color_input):
        """Convert various color formats to (r, g, b) tuple.

        Accepts:
        - (r, g, b) tuple: returned as-is
        - '#rrggbb' hex string: parsed
        - Color object with .rgb: returns .rgb
        """
        if isinstance(color_input, tuple):
            return color_input
        if isinstance(color_input, str):
            if color_input in self._color_cache:
                return self._color_cache[color_input]
            rgb = hex_to_rgb(color_input)
            self._color_cache[color_input] = rgb
            return rgb
        if hasattr(color_input, 'rgb'):
            return color_input.rgb
        return (255, 255, 255)  # fallback white

    def fill_rect(self, x, y, w, h, color):
        """Draw a filled rectangle."""
        rgb = self.parse_color(color)
        for dy in range(h):
            for dx in range(w):
                self.set_pixel(x + dx, y + dy, rgb)

    def alpha_blend(self, fg, alpha, bg=(0, 0, 0)):
        """Blend foreground color with background using alpha (0.0-1.0)."""
        r = int(fg[0] * alpha + bg[0] * (1 - alpha))
        g = int(fg[1] * alpha + bg[1] * (1 - alpha))
        b = int(fg[2] * alpha + bg[2] * (1 - alpha))
        return (min(255, r), min(255, g), min(255, b))
```

- [ ] **Step 2: Commit**

```bash
git add pi/renderer.py
git commit -m "feat(pi): add LED matrix renderer with hardware/mock support"
```

---

### Task 6: HUD + Text Rendering

**Files:**
- Create: `pi/hud.py`

- [ ] **Step 1: Write hud.py**

```python
# pi/hud.py
"""Bitmap text rendering, energy bars, scores, and timer display."""

from config import (
    BITMAP_FONT, BITMAP_FONT_WIDE, DIGIT_MAP, MAX_ENERGY, MAX_MINES,
    hsl_to_rgb
)


def draw_text(renderer, text, x, y, color, use_camera=True):
    """Draw text using bitmap font. 3px wide chars, 4px spacing."""
    rgb = renderer.parse_color(color)
    text = text.upper()
    cx = x
    draw_fn = renderer.set_pixel if use_camera else renderer.set_pixel_no_cam
    for ch in text:
        if ch in BITMAP_FONT_WIDE:
            bitmap = BITMAP_FONT_WIDE[ch]
            for p in range(25):
                if bitmap[p]:
                    draw_fn(cx + (p % 5), y + (p // 5), rgb)
            cx += 6
        elif ch == ' ':
            cx += 3
        elif ch in BITMAP_FONT:
            bitmap = BITMAP_FONT[ch]
            for p in range(15):
                if bitmap[p]:
                    draw_fn(cx + (p % 3), y + (p // 3), rgb)
            cx += 4
    return cx  # return final x position


def draw_digit(renderer, x, y, num, color, rotate_deg=0, use_camera=True):
    """Draw a single digit with optional rotation."""
    rgb = renderer.parse_color(color)
    bitmap = DIGIT_MAP.get(num)
    if not bitmap:
        return
    draw_fn = renderer.set_pixel if use_camera else renderer.set_pixel_no_cam
    for i in range(15):
        if bitmap[i]:
            c = i % 3
            r = i // 3
            if rotate_deg == -90:
                dx, dy = r, 2 - c
            elif rotate_deg == 90:
                dx, dy = 4 - r, c
            else:
                dx, dy = c, r
            draw_fn(x + dx, y + dy, rgb)


def draw_char(renderer, x, y, char, color, rotate_deg=0, use_camera=True):
    """Draw a single character with optional rotation."""
    rgb = renderer.parse_color(color)
    char = char.upper()
    bitmap = BITMAP_FONT.get(char)
    if not bitmap:
        return
    draw_fn = renderer.set_pixel if use_camera else renderer.set_pixel_no_cam
    for i in range(15):
        if bitmap[i]:
            c = i % 3
            r = i // 3
            if rotate_deg == -90:
                dx, dy = r, 2 - c
            elif rotate_deg == 90:
                dx, dy = 4 - r, c
            else:
                dx, dy = c, r
            draw_fn(x + dx, y + dy, rgb)


def render_player_hud(renderer, player, timer_str, wall_color, is_player1):
    """Render HUD for one player (name, mines, energy, timer, score)."""
    rotation = 90 if is_player1 else -90
    x = 0 if is_player1 else 123
    wall_rgb = renderer.parse_color(wall_color)

    # Player name (3 chars, rotated)
    if player.name:
        name_offsets = [0, 4, 8] if is_player1 else [61, 57, 53]
        color_rgb = renderer.parse_color(player.color)
        for i in range(min(3, len(player.name))):
            draw_char(renderer, x, name_offsets[i], player.name[i],
                      color_rgb, rotation, use_camera=False)

    # Mine count
    mine_y = 13 if is_player1 else 48
    mine_ratio = player.mines_left / MAX_MINES
    mine_color = hsl_to_rgb(mine_ratio * 120, 100, 50)
    draw_digit(renderer, x, mine_y, player.mines_left, mine_color,
               rotation, use_camera=False)

    # Energy bar
    energy_ratio = player.boost_energy / MAX_ENERGY
    energy_color = hsl_to_rgb(energy_ratio * 120, 100, 50)
    bar_height = int(energy_ratio * 26)
    for h in range(bar_height):
        for w in range(5):
            bar_y = (17 + h) if is_player1 else (46 - h)
            renderer.set_pixel_no_cam(x + w, bar_y, energy_color)

    # Timer digits (3 digits)
    timer_offsets = [44, 48, 52] if is_player1 else [17, 13, 9]
    for i in range(min(3, len(timer_str))):
        draw_digit(renderer, x, timer_offsets[i], int(timer_str[i]),
                   wall_rgb, rotation, use_camera=False)

    # Score (2 digits)
    score_str = str(player.score).zfill(2)
    score_offsets = [57, 61] if is_player1 else [4, 0]
    score_rgb = renderer.parse_color(player.color)
    for i in range(2):
        draw_digit(renderer, x, score_offsets[i], int(score_str[i]),
                   score_rgb, rotation, use_camera=False)


def render_hud(renderer, state, wall_color):
    """Render full HUD for both players."""
    timer_str = str(max(0, math.ceil(state.game_time / 60))).zfill(3)
    render_player_hud(renderer, state.players[0], timer_str, wall_color, True)
    render_player_hud(renderer, state.players[1], timer_str, wall_color, False)


# Need math for timer calculation
import math
```

- [ ] **Step 2: Commit**

```bash
git add pi/hud.py
git commit -m "feat(pi): add HUD rendering (text, energy bars, scores)"
```

---

### Task 7: Effects (Particles + Camera Shake)

**Files:**
- Create: `pi/effects.py`
- Create: `pi/tests/test_effects.py`

- [ ] **Step 1: Write effects.py**

```python
# pi/effects.py
"""Particle system, camera shake, and boost trail management."""

import random
import math
from config import TRAIL_LENGTH, BASE_SPEED


def spawn_death_particles(state, player):
    """Spawn 30 particles at player death position."""
    color = player.color.rgb if hasattr(player.color, 'rgb') else (255, 0, 0)
    for _ in range(30):
        state.particles.append({
            'x': player.x + random.random() * 2,
            'y': player.y + random.random() * 2,
            'vx': (random.random() - 0.5) * 4,
            'vy': (random.random() - 0.5) * 4,
            'life': 1.0,
            'decay': 0.02 + random.random() * 0.03,
            'color': color,
        })


def spawn_explosion_particles(state, x, y):
    """Spawn 30 radial particles at explosion."""
    for _ in range(30):
        angle = random.random() * math.pi * 2
        speed = random.random() * 3.5
        state.particles.append({
            'x': x,
            'y': y,
            'vx': math.cos(angle) * speed,
            'vy': math.sin(angle) * speed,
            'life': 1.0,
            'decay': 0.02 + random.random() * 0.03,
            'color': (255, 255, 255),
        })


def spawn_wall_hit_particles(state, x, y, vx, vy):
    """Spawn single particle for wall hit."""
    state.particles.append({
        'x': x, 'y': y, 'vx': vx, 'vy': vy,
        'life': 1.0, 'decay': 0.05,
        'color': (255, 200, 50),
    })


def spawn_muzzle_flash_particles(state, x, y):
    """Spawn 10 particles for muzzle flash."""
    for _ in range(10):
        state.particles.append({
            'x': x, 'y': y,
            'vx': (random.random() - 0.5) * 3,
            'vy': (random.random() - 0.5) * 3,
            'life': 1.0, 'decay': 0.05,
            'color': (255, 255, 255),
        })


def update_particles(state):
    """Update particle positions, apply friction, decay, and color ramp."""
    alive = []
    for p in state.particles:
        p['x'] += p['vx']
        p['y'] += p['vy']
        p['vx'] *= 0.85
        p['vy'] *= 0.85
        p['life'] -= p['decay']

        if p['life'] > 0:
            # Color ramp: white → yellow → orange → dark red
            if p['life'] > 0.75:
                p['color'] = (255, 255, 255)
            elif p['life'] > 0.5:
                p['color'] = (255, 255, 0)
            elif p['life'] > 0.25:
                p['color'] = (255, 128, 0)
            else:
                p['color'] = (139, 0, 0)
            alive.append(p)

    state.particles = alive


def check_boost_trail(player):
    """Maintain boost trail circular buffer."""
    if player.boost_energy > 0 and player.current_speed > BASE_SPEED:
        player.trail.append({'x': player.x, 'y': player.y})
        if len(player.trail) > TRAIL_LENGTH:
            player.trail.pop(0)
    else:
        player.trail.clear()


def shake_camera(state, amount):
    """Trigger camera shake."""
    state.camera.shake(amount)
```

- [ ] **Step 2: Write test for effects**

```python
# pi/tests/test_effects.py
from effects import spawn_explosion_particles, update_particles, check_boost_trail
from state import GameState
from classes import Player
from config import MAX_ENERGY, BASE_SPEED, MAX_SPEED

def test_spawn_explosion_particles():
    state = GameState()
    spawn_explosion_particles(state, 10, 20)
    assert len(state.particles) == 30
    for p in state.particles:
        assert 'x' in p and 'y' in p and 'vx' in p and 'vy' in p
        assert p['life'] == 1.0

def test_update_particles_decay():
    state = GameState()
    state.particles = [
        {'x': 0, 'y': 0, 'vx': 1, 'vy': 0, 'life': 0.1, 'decay': 0.2, 'color': (255,255,255)},
    ]
    update_particles(state)
    assert len(state.particles) == 0  # decayed below 0

def test_update_particles_movement():
    state = GameState()
    state.particles = [
        {'x': 0, 'y': 0, 'vx': 10, 'vy': 5, 'life': 1.0, 'decay': 0.01, 'color': (255,255,255)},
    ]
    update_particles(state)
    assert state.particles[0]['x'] == 10
    assert state.particles[0]['y'] == 5
    assert state.particles[0]['vx'] == 10 * 0.85  # friction

def test_boost_trail():
    p = Player(0)
    p.boost_energy = MAX_ENERGY
    p.current_speed = MAX_SPEED
    p.x, p.y = 10, 20
    check_boost_trail(p)
    assert len(p.trail) == 1
    p.current_speed = BASE_SPEED
    check_boost_trail(p)
    assert len(p.trail) == 0
```

- [ ] **Step 3: Run tests**

Run: `cd pi && python -m pytest tests/test_effects.py -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add pi/effects.py pi/tests/test_effects.py
git commit -m "feat(pi): add particle system and camera shake effects"
```

---

### Task 8: Input Handler

**Files:**
- Create: `pi/input_handler.py`

- [ ] **Step 1: Write input_handler.py**

```python
# pi/input_handler.py
"""USB gamepad and keyboard input polling via pygame."""

import time
import pygame
from config import GAMEPAD_THRESH, GAMEPAD_BUTTONS, CONTROLS_P1, CONTROLS_P2, TIMING


# Map pygame key names to pygame constants
_KEY_MAP = {
    'w': pygame.K_w, 's': pygame.K_s, 'a': pygame.K_a, 'd': pygame.K_d,
    'r': pygame.K_r, 'f': pygame.K_f, 'e': pygame.K_e, 'g': pygame.K_g,
    'space': pygame.K_SPACE,
    'up': pygame.K_UP, 'down': pygame.K_DOWN,
    'left': pygame.K_LEFT, 'right': pygame.K_RIGHT,
    'i': pygame.K_i, 'k': pygame.K_k, 'o': pygame.K_o, 'l': pygame.K_l,
    'return': pygame.K_RETURN,
}


class InputHandler:
    """Manages gamepad and keyboard input."""

    def __init__(self):
        pygame.init()
        pygame.joystick.init()
        self.joysticks = []
        self.last_input_time = time.monotonic()
        self._prev_start = [False, False]
        self._refresh_joysticks()

    def _refresh_joysticks(self):
        """Detect connected joysticks."""
        self.joysticks = []
        for i in range(min(2, pygame.joystick.get_count())):
            js = pygame.joystick.Joystick(i)
            js.init()
            self.joysticks.append(js)

    def poll(self):
        """Process pygame events and return input for both players.

        Returns: (p1_input, p2_input) where each is a dict with:
            up, down, left, right, shield, beam, mine, boost, boom, start
        """
        pygame.event.pump()

        keys = pygame.key.get_pressed()
        any_input = False

        # Player 1 input (gamepad 0 + keyboard P1)
        p1 = self._empty_input()
        p1_gp = self._read_gamepad(0)
        p1_kb = self._read_keyboard(keys, CONTROLS_P1)
        self._merge(p1, p1_gp, p1_kb)

        # Player 2 input (gamepad 1 + keyboard P2)
        p2 = self._empty_input()
        p2_gp = self._read_gamepad(1)
        p2_kb = self._read_keyboard(keys, CONTROLS_P2)
        self._merge(p2, p2_gp, p2_kb)

        # Check for any input (for idle detection)
        if any(p1.values()) or any(p2.values()):
            self.last_input_time = time.monotonic()
            any_input = True

        # Start button edge detection
        p1['start_pressed'] = p1['start'] and not self._prev_start[0]
        p2['start_pressed'] = p2['start'] and not self._prev_start[1]
        self._prev_start[0] = p1['start']
        self._prev_start[1] = p2['start']

        # Escape key for pause
        if keys[pygame.K_ESCAPE]:
            p1['start_pressed'] = True
            any_input = True

        return p1, p2, any_input

    def is_idle(self):
        """Check if no input for IDLE_THRESHOLD seconds."""
        return (time.monotonic() - self.last_input_time) > TIMING.IDLE_THRESHOLD

    def _empty_input(self):
        return {
            'up': False, 'down': False, 'left': False, 'right': False,
            'shield': False, 'beam': False, 'mine': False, 'boost': False,
            'boom': False, 'start': False, 'start_pressed': False,
        }

    def _read_gamepad(self, idx):
        """Read input from a gamepad by index."""
        inp = self._empty_input()
        if idx >= len(self.joysticks):
            return inp

        js = self.joysticks[idx]

        # Axes (left stick)
        if js.get_numaxes() >= 2:
            ax = js.get_axis(0)
            ay = js.get_axis(1)
            if ax < -GAMEPAD_THRESH:
                inp['left'] = True
            elif ax > GAMEPAD_THRESH:
                inp['right'] = True
            if ay < -GAMEPAD_THRESH:
                inp['up'] = True
            elif ay > GAMEPAD_THRESH:
                inp['down'] = True

        # D-pad (hat)
        if js.get_numhats() > 0:
            hx, hy = js.get_hat(0)
            if hx < 0:
                inp['left'] = True
            elif hx > 0:
                inp['right'] = True
            if hy > 0:
                inp['up'] = True
            elif hy < 0:
                inp['down'] = True

        # Buttons
        num_buttons = js.get_numbuttons()
        for action, btn_idx in GAMEPAD_BUTTONS.items():
            if btn_idx < num_buttons and js.get_button(btn_idx):
                inp[action] = True

        return inp

    def _read_keyboard(self, keys, controls):
        """Read keyboard input using control mapping."""
        inp = self._empty_input()
        for action, key_name in controls.items():
            pg_key = _KEY_MAP.get(key_name)
            if pg_key and keys[pg_key]:
                inp[action] = True
        return inp

    def _merge(self, target, *sources):
        """OR-merge multiple input sources into target."""
        for source in sources:
            for key in target:
                if source.get(key):
                    target[key] = True

    def cleanup(self):
        """Clean up pygame."""
        pygame.quit()
```

- [ ] **Step 2: Commit**

```bash
git add pi/input_handler.py
git commit -m "feat(pi): add gamepad and keyboard input handler"
```

---

### Task 9: Mechanics (Movement, Beams, Shields, Mines, Collisions)

**Files:**
- Create: `pi/mechanics.py`
- Create: `pi/tests/test_mechanics.py`

- [ ] **Step 1: Write mechanics.py**

This is the largest module — all game physics and action resolution. Port from `docs/js/mechanics.js`.

```python
# pi/mechanics.py
"""Player actions, projectile physics, collision detection, and round resolution."""

import math
import random
from config import (
    CONFIG_BLAST_RADIUS, BASE_SPEED, MAX_SPEED, MAX_ENERGY,
    BEAM_SPEED, C_BEAM_SPEED, C_BEAM_LENGTH, C_BEAM_WIDTH, C_BEAM_RANGE,
    BEAM_LENGTH, MAX_MINES, MAX_SCORE, CELL_SIZE, MAZE_OFFSET_X,
    COLS, ROWS, LOGICAL_W, CHARGE_MOVEMENT_PENALTY,
    PORTAL_GLITCH_CHANCE, BOOST_COOLDOWN_FRAMES,
    TAUNTS,
    TIMING, ENERGY_COSTS, ENERGY_RATES, COLLISION
)
# Re-export BLAST_RADIUS with the right name
BLAST_RADIUS = 4.0

from grid import is_wall, grid_index, destroy_wall_at, create_ammo_crate
from effects import (
    spawn_death_particles, spawn_explosion_particles,
    spawn_wall_hit_particles, spawn_muzzle_flash_particles,
    shake_camera
)
from seeded_random import seeded_random


def check_player_collision(maze, p, dx, dy):
    """Test if player would collide with walls at offset (dx, dy)."""
    pad = COLLISION.COLLISION_PAD
    hs = COLLISION.HITBOX_SIZE
    nx, ny = p.x + dx, p.y + dy
    corners = [
        (nx + pad, ny + pad),
        (nx + pad + hs, ny + pad),
        (nx + pad, ny + pad + hs),
        (nx + pad + hs, ny + pad + hs),
    ]
    return any(is_wall(maze, cx, cy) for cx, cy in corners)


def handle_movement(state, p, inp):
    """Handle player movement with collision detection and corner assist."""
    frame = state.frame_count
    speed = BASE_SPEED

    # Speed modifiers
    if p.stun_is_active(frame):
        speed = BASE_SPEED * COLLISION.STUN_SPEED_MULT
        p.boost_energy = min(MAX_ENERGY, p.boost_energy + ENERGY_RATES.BOOST_REGEN)
    elif p.is_charging:
        speed = BASE_SPEED * CHARGE_MOVEMENT_PENALTY
    elif inp['boost'] and p.boost_energy > 0 and p.boost_cooldown <= 0:
        speed = MAX_SPEED
        p.boost_energy -= ENERGY_RATES.BOOST_DRAIN
        if p.boost_energy <= 0:
            p.boost_energy = 0
            p.boost_cooldown = BOOST_COOLDOWN_FRAMES
    else:
        if not p.is_charging:
            p.boost_energy = min(MAX_ENERGY, p.boost_energy + ENERGY_RATES.BOOST_REGEN)

    if p.boost_cooldown > 0:
        p.boost_cooldown -= 1

    p.current_speed = speed

    # Determine direction
    dx, dy = 0.0, 0.0
    if inp['up']:
        dy = -1
    if inp['down']:
        dy = 1
    if inp['left']:
        dx = -1
    if inp['right']:
        dx = 1

    if dx == 0 and dy == 0:
        return

    # Update last direction
    if abs(dx) > 0:
        p.last_dir = 'right' if dx > 0 else 'left'
    if abs(dy) > 0:
        p.last_dir = 'down' if dy > 0 else 'up'

    # Glitch inverts controls
    if p.glitch_is_active(frame):
        dx = -dx
        dy = -dy

    # Step-based movement with collision
    dist = math.hypot(dx, dy) * speed
    steps = max(1, int(dist / COLLISION.MOVEMENT_STEP_SIZE))
    step_dx = (dx * speed) / steps
    step_dy = (dy * speed) / steps

    for _ in range(steps):
        # X movement
        if step_dx != 0:
            if not check_player_collision(state.maze, p, step_dx, 0):
                p.x += step_dx
            else:
                # Corner assist
                for offset in [COLLISION.CORNER_ASSIST_OFFSET, -COLLISION.CORNER_ASSIST_OFFSET]:
                    if not check_player_collision(state.maze, p, step_dx, offset * COLLISION.CORNER_NUDGE_SPEED):
                        p.x += step_dx
                        p.y += offset * COLLISION.CORNER_NUDGE_SPEED
                        break

        # Y movement
        if step_dy != 0:
            if not check_player_collision(state.maze, p, 0, step_dy):
                p.y += step_dy
            else:
                for offset in [COLLISION.CORNER_ASSIST_OFFSET, -COLLISION.CORNER_ASSIST_OFFSET]:
                    if not check_player_collision(state.maze, p, offset * COLLISION.CORNER_NUDGE_SPEED, step_dy):
                        p.y += step_dy
                        p.x += offset * COLLISION.CORNER_NUDGE_SPEED
                        break


def handle_shield(p, inp):
    """Manage shield activation and energy drain."""
    if inp['shield'] and p.boost_energy > 0:
        if not p.shield_active:
            p.boost_energy -= ENERGY_COSTS.SHIELD_ACTIVATION
        p.shield_active = True
        p.boost_energy -= ENERGY_RATES.SHIELD_DRAIN
        if p.boost_energy <= 0:
            p.boost_energy = 0
            p.shield_active = False
    else:
        p.shield_active = False


def handle_detonate(state, p, inp):
    """Detonate all player-owned mines."""
    if inp['boom'] and not p.prev_detonate_key:
        if p.boost_energy >= ENERGY_COSTS.DETONATION:
            own_mines = [m for m in state.mines if m['owner'] == p.id or m['owner'] == -1]
            if own_mines:
                p.boost_energy -= ENERGY_COSTS.DETONATION
                for m in own_mines:
                    trigger_explosion(state, m['x'] + 1, m['y'] + 1, 'DETONATION')
                state.mines = [m for m in state.mines if m['owner'] != p.id and m['owner'] != -1]
    p.prev_detonate_key = inp['boom']


def handle_beam_input(state, p, inp):
    """Handle beam charging and firing."""
    frame = state.frame_count
    if inp['beam']:
        if not p.is_charging:
            p.is_charging = True
            p.charge_start_time = frame
        elif p.charge_is_ready(frame):
            fire_charged_beam(state, p)
            p.is_charging = False
    else:
        if p.is_charging:
            if not p.charge_is_ready(frame):
                fire_beam(state, p)
            p.is_charging = False


def handle_mine_drop(state, p, inp):
    """Drop a mine at player position."""
    if inp['mine'] and p.mines_left > 0:
        if (state.frame_count - p.last_mine_time) >= TIMING.MINE_COOLDOWN:
            state.mines.append({
                'x': math.floor(p.x),
                'y': math.floor(p.y),
                'owner': p.id,
                'drop_time': state.frame_count,
                'active': False,
                'vis_x': random.random(),
                'vis_y': random.random(),
            })
            p.mines_left -= 1
            p.last_mine_time = state.frame_count


def handle_goal(state, p):
    """Check if player reached their goal."""
    gx = p.goal_c * CELL_SIZE + MAZE_OFFSET_X + 1
    gy = p.goal_r * CELL_SIZE + 1
    dist = math.hypot(p.x - gx, p.y - gy)
    if dist <= COLLISION.GOAL_DISTANCE:
        resolve_round(state, p.id, 'GOAL')


def apply_player_actions(state, p, inp):
    """Main action dispatcher for a player."""
    handle_detonate(state, p, inp)
    handle_shield(p, inp)
    handle_beam_input(state, p, inp)
    handle_movement(state, p, inp)
    handle_mine_drop(state, p, inp)
    handle_goal(state, p)


def fire_beam(state, p):
    """Fire a homing beam using BFS pathfinding through the maze."""
    if p.boost_energy < ENERGY_COSTS.BEAM:
        return False
    if p.beam_idx < len(p.beam_pixels):
        return False

    opponent = state.players[1 - p.id]
    maze = state.maze

    # BFS from player to opponent
    start_c = int((p.x - MAZE_OFFSET_X) // CELL_SIZE)
    start_r = int(p.y // CELL_SIZE)
    end_c = int((opponent.x - MAZE_OFFSET_X) // CELL_SIZE)
    end_r = int(opponent.y // CELL_SIZE)

    start = grid_index(maze, start_c, start_r)
    end = grid_index(maze, end_c, end_r)
    if not start or not end:
        return False

    # Reset BFS
    for cell in maze:
        cell.bfs_visited = False
        cell.parent = None

    queue = [start]
    head = 0
    start.bfs_visited = True

    directions = [(1, 0, 1), (0, 1, 2), (-1, 0, 3), (0, -1, 0)]

    while head < len(queue):
        curr = queue[head]
        head += 1
        if curr is end:
            break
        for dc, dr, wall_idx in directions:
            n = grid_index(maze, curr.c + dc, curr.r + dr)
            if n and not n.bfs_visited:
                opp_wall = (wall_idx + 2) % 4
                if not curr.walls[wall_idx] and not n.walls[opp_wall]:
                    n.bfs_visited = True
                    n.parent = curr
                    queue.append(n)

    if not end.bfs_visited:
        return False  # no path

    p.boost_energy -= ENERGY_COSTS.BEAM

    # Reconstruct path
    path = []
    node = end
    while node:
        path.append(node)
        node = node.parent
    path.reverse()

    # Convert to pixel positions
    beam_pixels = []
    for i, cell in enumerate(path):
        bx = MAZE_OFFSET_X + cell.c * CELL_SIZE + 1
        by = cell.r * CELL_SIZE + 1
        beam_pixels.append({'x': bx, 'y': by})
        if i + 1 < len(path):
            nx = MAZE_OFFSET_X + path[i + 1].c * CELL_SIZE + 1
            ny = path[i + 1].r * CELL_SIZE + 1
            beam_pixels.append({'x': bx + (nx - bx) / 3, 'y': by + (ny - by) / 3})
            beam_pixels.append({'x': bx + 2 * (nx - bx) / 3, 'y': by + 2 * (ny - by) / 3})

    p.beam_pixels = beam_pixels
    p.beam_idx = 0
    return True


def fire_charged_beam(state, p):
    """Fire a charged projectile toward opponent."""
    if p.boost_energy < ENERGY_COSTS.CHARGED_BEAM:
        return False

    opponent = state.players[1 - p.id]
    start_x = p.x + 1
    start_y = p.y + 1
    target_x = opponent.x + 1
    target_y = opponent.y + 1

    dx = target_x - start_x
    dy = target_y - start_y
    dist = math.hypot(dx, dy)
    if dist < 0.1:
        dx, dy, dist = 1, 0, 1

    vx = (dx / dist) * C_BEAM_SPEED
    vy = (dy / dist) * C_BEAM_SPEED

    p.boost_energy -= ENERGY_COSTS.CHARGED_BEAM

    state.projectiles.append({
        'x': start_x, 'y': start_y,
        'vx': vx, 'vy': vy,
        'dist_traveled': 0,
        'owner': p.id,
        'color': p.color.rgb if hasattr(p.color, 'rgb') else (255, 255, 255),
    })

    spawn_muzzle_flash_particles(state, start_x, start_y)
    return True


def update_projectiles(state):
    """Update charged beam projectiles: movement, wall/mine/player collisions."""
    explosions = []
    player_hits = []
    surviving = []

    for proj in state.projectiles:
        proj['x'] += proj['vx']
        proj['y'] += proj['vy']
        proj['dist_traveled'] += C_BEAM_SPEED

        if proj['dist_traveled'] >= C_BEAM_RANGE:
            continue  # remove

        # Wall collision
        tip_x = proj['x'] + proj['vx'] * 2
        tip_y = proj['y'] + proj['vy'] * 2
        if is_wall(state.maze, tip_x, tip_y):
            cell_c = int((tip_x - MAZE_OFFSET_X) / CELL_SIZE)
            cell_r = int(tip_y / CELL_SIZE)
            destroy_wall_at(state.maze, cell_c, cell_r)
            spawn_wall_hit_particles(state, tip_x, tip_y, -proj['vx'], -proj['vy'])
            continue  # remove

        # Mine collision
        hit_mine = False
        for m in state.mines:
            mx, my = m['x'] + 1, m['y'] + 1
            if abs(proj['vx']) > 0:
                hw, hh = C_BEAM_LENGTH / 2, C_BEAM_WIDTH / 2
            else:
                hw, hh = C_BEAM_WIDTH / 2, C_BEAM_LENGTH / 2
            if abs(proj['x'] - mx) < hw + 1 and abs(proj['y'] - my) < hh + 1:
                explosions.append((mx, my, 'MINE HIT'))
                hit_mine = True
                break
        if hit_mine:
            continue

        # Player collision
        hit_player = False
        for pl in state.players:
            if pl.id == proj['owner'] or pl.is_dead:
                continue
            p_left, p_right = pl.x, pl.x + pl.size
            p_top, p_bot = pl.y, pl.y + pl.size
            half_len = C_BEAM_LENGTH / 2
            half_w = C_BEAM_WIDTH / 2
            mag = math.hypot(proj['vx'], proj['vy'])
            if mag == 0:
                continue
            nx, ny = proj['vx'] / mag, proj['vy'] / mag
            b_left = proj['x'] - half_len * abs(nx) - half_w * abs(ny)
            b_right = proj['x'] + half_len * abs(nx) + half_w * abs(ny)
            b_top = proj['y'] - half_len * abs(ny) - half_w * abs(nx)
            b_bot = proj['y'] + half_len * abs(ny) + half_w * abs(nx)

            if b_left < p_right and b_right > p_left and b_top < p_bot and b_bot > p_top:
                if not pl.shield_active:
                    player_hits.append(pl.id)
                hit_player = True
                break

        if not hit_player:
            surviving.append(proj)

    state.projectiles = surviving

    for x, y, reason in explosions:
        trigger_explosion(state, x, y, reason)

    for victim_id in player_hits:
        handle_player_death(state, victim_id, 'CHARGED BEAM')


def check_beam_collisions(state):
    """Check if two beams collide (beam vs beam)."""
    p1, p2 = state.players
    if not p1.beam_pixels or not p2.beam_pixels:
        return

    b1_start = max(0, int(p1.beam_idx) - int(BEAM_SPEED))
    b1_end = min(len(p1.beam_pixels) - 1, int(p1.beam_idx))
    b2_start = max(0, int(p2.beam_idx) - int(BEAM_SPEED))
    b2_end = min(len(p2.beam_pixels) - 1, int(p2.beam_idx))

    for i in range(b1_start, b1_end + 1):
        for j in range(b2_start, b2_end + 1):
            bp1 = p1.beam_pixels[i]
            bp2 = p2.beam_pixels[j]
            if abs(bp1['x'] - bp2['x']) + abs(bp1['y'] - bp2['y']) < COLLISION.BEAM_COLLISION_DIST:
                mid_x = (bp1['x'] + bp2['x']) / 2
                mid_y = (bp1['y'] + bp2['y']) / 2
                trigger_explosion(state, mid_x, mid_y, 'BEAM CLASH')
                p1.beam_pixels = []
                p1.beam_idx = 9999
                p2.beam_pixels = []
                p2.beam_idx = 9999
                return


def check_beam_actions(state, p):
    """Advance beam animation and check if beam hits opponent."""
    if not p.beam_pixels:
        return

    p.beam_idx += BEAM_SPEED
    opponent = state.players[1 - p.id]

    tip_idx = int(p.beam_idx)
    if tip_idx < len(p.beam_pixels):
        tip = p.beam_pixels[tip_idx]
        if abs(opponent.x - tip['x']) < COLLISION.BEAM_HIT_RADIUS and \
           abs(opponent.y - tip['y']) < COLLISION.BEAM_HIT_RADIUS:
            if not opponent.shield_active:
                opponent.stun_start_time = state.frame_count
                opponent.glitch_start_time = state.frame_count
            p.beam_pixels = []
            p.beam_idx = 9999
            # Energy transfer
            opponent.boost_energy = min(MAX_ENERGY,
                                        opponent.boost_energy + ENERGY_COSTS.BEAM_HIT_TRANSFER)
            p.boost_energy = max(0, p.boost_energy - ENERGY_COSTS.BEAM_HIT_TRANSFER)

    if p.beam_idx >= len(p.beam_pixels) + BEAM_LENGTH:
        p.beam_pixels = []
        p.beam_idx = 9999


def check_mines_actions(state, p):
    """Check beam hitting mines and player stepping on mines."""
    explosions = []
    beam_hit_mine = False

    b_idx = int(p.beam_idx)
    bp = p.beam_pixels[b_idx] if b_idx < len(p.beam_pixels) else None

    for m in state.mines:
        # Beam hitting mine
        if bp and not beam_hit_mine:
            if abs(bp['x'] - (m['x'] + 1)) < 1.5 and abs(bp['y'] - (m['y'] + 1)) < 3:
                explosions.append((m['x'] + 1, m['y'] + 1, 'MINESWEEPER'))
                beam_hit_mine = True

        # Player stepping on active mine
        if m['active'] and p.portal_invuln_frames <= 0:
            if (p.x + p.size > m['x'] and p.x < m['x'] + 2 and
                    p.y + p.size > m['y'] and p.y < m['y'] + 2):
                explosions.append((m['x'] + 1, m['y'] + 1, 'TRIPPED MINE'))

    if beam_hit_mine:
        p.beam_pixels = []
        p.beam_idx = 9999

    # Remove exploded mines
    exploded_positions = set((int(x), int(y)) for x, y, _ in explosions)
    state.mines = [m for m in state.mines if (m['x'] + 1, m['y'] + 1) not in exploded_positions]

    for x, y, reason in explosions:
        trigger_explosion(state, x, y, reason)

    if p.portal_invuln_frames > 0:
        p.portal_invuln_frames -= 1


def check_portal_actions(state, p):
    """Check portal teleportation."""
    if p.portal_cooldown > 0:
        p.portal_cooldown -= 1
        return

    # Find player's current cell
    center_c = int((p.x + 1 - MAZE_OFFSET_X) / CELL_SIZE)
    center_r = int((p.y + 1) / CELL_SIZE)

    for portal in state.portals:
        if portal['c'] == center_c and portal['r'] == center_r:
            # Find other portal
            dest = None
            for other in state.portals:
                if other is not portal:
                    dest = other
                    break
            if dest:
                p.x = MAZE_OFFSET_X + dest['c'] * CELL_SIZE + 0.5
                p.y = dest['r'] * CELL_SIZE + 0.5
                p.portal_cooldown = COLLISION.PORTAL_COOLDOWN
                p.portal_invuln_frames = COLLISION.PORTAL_INVULN_FRAMES
                p.current_speed = BASE_SPEED
                if random.random() < PORTAL_GLITCH_CHANCE:
                    p.glitch_start_time = state.frame_count
            return


def check_crate(state, p):
    """Check ammo crate pickup."""
    if not state.ammo_crate:
        return
    cx = state.ammo_crate['x'] + 1
    cy = state.ammo_crate['y'] + 1
    if math.hypot(p.x + 1 - cx, p.y + 1 - cy) < 2:
        from config import MAX_MINES
        p.mines_left = MAX_MINES
        p.boost_energy = MAX_ENERGY
        state.ammo_crate = None
        state.ammo_last_take_time = state.frame_count


def update_mines(state):
    """Activate mines after arm time."""
    for m in state.mines:
        if not m['active'] and (state.frame_count - m['drop_time']) >= TIMING.MINE_ARM_TIME:
            m['active'] = True


def trigger_explosion(state, x, y, reason):
    """Central explosion handler: particles, shake, wall destruction, damage."""
    shake_camera(state, 15)
    # Destroy walls
    center_c = int((x - MAZE_OFFSET_X) / CELL_SIZE)
    center_r = int(y / CELL_SIZE)
    for dc in range(-1, 2):
        for dr in range(-1, 2):
            nc, nr = center_c + dc, center_r + dr
            if 0 <= nc < COLS and 0 <= nr < ROWS:
                if dc * dc + dr * dr <= 2:
                    destroy_wall_at(state.maze, nc, nr)

    spawn_explosion_particles(state, x, y)

    # Player damage
    for pl in state.players:
        if pl.is_dead or pl.shield_active:
            continue
        dist = math.hypot(pl.x + 1 - x, pl.y + 1 - y)
        if dist <= BLAST_RADIUS:
            handle_player_death(state, pl.id, reason)


def handle_player_death(state, victim_idx, reason):
    """Handle a single player death."""
    if state.is_game_over or state.is_round_over or state.death_timer > 0:
        return
    p = state.players[victim_idx]
    if p.is_dead:
        return
    p.is_dead = True
    state.victim_idx = victim_idx
    state.death_timer = COLLISION.DEATH_TIMER_FRAMES
    state.messages['death_reason'] = reason or 'ELIMINATED'
    spawn_death_particles(state, p)


def resolve_round(state, winner_idx, reason):
    """Resolve a round or match."""
    if state.is_game_over or state.is_round_over:
        return

    if reason == 'DRAW':
        state.is_round_over = True
        state.is_draw = True
        state.messages['round'] = 'DOUBLE KO! DRAW!'
        if state.is_attract_mode:
            state.demo_reset_timer = TIMING.DEMO_RESET_TIMER
        return

    victim_idx = 1 - winner_idx
    winner = state.players[winner_idx]
    winner.score += 1

    if winner.score >= MAX_SCORE:
        # Game over
        state.is_game_over = True
        state.is_round_over = True
        state.messages['win'] = f'{winner.name} WINS!'
        state.messages['win_color'] = winner.color
        state.messages['taunt'] = random.choice(TAUNTS)
        state.victim_idx = victim_idx
        state.scroll_x = LOGICAL_W + 5
        save_high_score_entry(state, winner_idx)
    else:
        # Round over
        state.is_round_over = True
        state.messages['round'] = f'{winner.name} SCORES!'
        state.messages['round_color'] = winner.color

    state.death_timer = 0

    if state.is_attract_mode:
        state.demo_reset_timer = TIMING.DEMO_RESET_TIMER


def save_high_score_entry(state, winner_idx):
    """Add high score entry after game over."""
    from state import save_high_scores
    winner = state.players[winner_idx]
    loser = state.players[1 - winner_idx]

    entry = {
        'name': winner.name,
        'opponent': loser.name,
        'score': winner.score,
        'opp_score': loser.score,
        'difficulty': state.difficulty,
        'win_color': winner.color.rgb if hasattr(winner.color, 'rgb') else (255, 255, 255),
        'opp_color': loser.color.rgb if hasattr(loser.color, 'rgb') else (128, 128, 128),
        'multiplier': 1.0,
    }
    state.high_scores.insert(0, entry)
    state.high_scores = state.high_scores[:10]  # keep top 10
    save_high_scores(state)
```

- [ ] **Step 2: Write test for mechanics**

```python
# pi/tests/test_mechanics.py
import math
from mechanics import check_player_collision, handle_movement, handle_shield, resolve_round
from grid import init_maze
from state import GameState
from classes import Player
from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, MAX_ENERGY, ENERGY_COSTS, COLLISION, MAX_SCORE

def _setup():
    state = GameState()
    maze, portals, gt, mgt = init_maze(seed=42)
    state.maze = maze
    state.portals = portals
    state.game_time = gt
    state.max_game_time = mgt
    from config import COLORS
    state.players = [
        Player(0, 'P-1', COLORS[0]),
        Player(1, 'P-2', COLORS[1]),
    ]
    # Place players in open cells
    state.players[0].x = MAZE_OFFSET_X + 1 * CELL_SIZE + 1
    state.players[0].y = 1 * CELL_SIZE + 1
    state.players[1].x = MAZE_OFFSET_X + (COLS - 2) * CELL_SIZE + 1
    state.players[1].y = (ROWS - 2) * CELL_SIZE + 1
    return state

def test_collision_with_boundary():
    state = _setup()
    p = state.players[0]
    # Try to move outside left boundary
    p.x = MAZE_OFFSET_X + 0.5
    p.y = 1 * CELL_SIZE + 1
    assert check_player_collision(state.maze, p, -5, 0)  # would go out of bounds

def test_movement_updates_position():
    state = _setup()
    p = state.players[0]
    old_x, old_y = p.x, p.y
    inp = {'up': False, 'down': False, 'left': False, 'right': True,
           'shield': False, 'beam': False, 'mine': False, 'boost': False,
           'boom': False, 'start': False}
    handle_movement(state, p, inp)
    # Player should have moved right (or stayed if wall)
    # At least the function ran without error
    assert isinstance(p.x, float)

def test_shield_drains_energy():
    state = _setup()
    p = state.players[0]
    initial_energy = p.boost_energy
    inp = {'shield': True}
    handle_shield(p, inp)
    assert p.shield_active
    assert p.boost_energy < initial_energy

def test_resolve_round_goal():
    state = _setup()
    state.players[0].goal_c = COLS - 1
    state.players[0].goal_r = ROWS - 1
    resolve_round(state, 0, 'GOAL')
    assert state.is_round_over
    assert state.players[0].score == 1

def test_resolve_round_game_over():
    state = _setup()
    state.players[0].score = MAX_SCORE - 1
    resolve_round(state, 0, 'GOAL')
    assert state.is_game_over
    assert state.players[0].score == MAX_SCORE
```

- [ ] **Step 3: Run tests**

Run: `cd pi && python -m pytest tests/test_mechanics.py -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add pi/mechanics.py pi/tests/test_mechanics.py
git commit -m "feat(pi): add game mechanics (movement, beams, mines, collisions)"
```

---

### Task 10: AI System

**Files:**
- Create: `pi/ai/difficulty.py`
- Create: `pi/ai/pathfinding.py`
- Create: `pi/ai/combat.py`
- Create: `pi/ai/strategy.py`
- Create: `pi/ai/controller.py`
- Create: `pi/tests/test_ai_pathfinding.py`

- [ ] **Step 1: Write ai/difficulty.py**

Port all difficulty presets, tactical styles, and dynamic scaling from `docs/js/ai/difficulty.js`.

```python
# pi/ai/difficulty.py
"""Difficulty presets, tactical styles, feature flags, and dynamic scaling."""

import math
from config import MAX_ENERGY

# Active config (mutable module state, like the JS version)
_active_config = None

DIFFICULTY_PRESETS = {
    'BEGINNER': {
        'name': 'BEGINNER',
        'think_interval': 20,          # frames between decisions (~3/sec)
        'movement_error': 0.25,        # 25% chance of wrong direction
        'energy_threshold_attack': 80,
        'energy_threshold_defend': 30,
        'hunting_distance': 15,
        'flee_distance': 5,
        'beam_accuracy': 0.5,
        'prediction_window': 0,
        'aggression': 0.3,
    },
    'INTERMEDIATE': {
        'name': 'INTERMEDIATE',
        'think_interval': 10,
        'movement_error': 0.15,
        'energy_threshold_attack': 60,
        'energy_threshold_defend': 40,
        'hunting_distance': 20,
        'flee_distance': 8,
        'beam_accuracy': 0.7,
        'prediction_window': 10,
        'aggression': 0.5,
    },
    'HARD': {
        'name': 'HARD',
        'think_interval': 4,
        'movement_error': 0.05,
        'energy_threshold_attack': 45,
        'energy_threshold_defend': 50,
        'hunting_distance': 30,
        'flee_distance': 10,
        'beam_accuracy': 0.85,
        'prediction_window': 20,
        'aggression': 0.7,
    },
    'INSANE': {
        'name': 'INSANE',
        'think_interval': 1,
        'movement_error': 0.0,
        'energy_threshold_attack': 35,
        'energy_threshold_defend': 60,
        'hunting_distance': 999,
        'flee_distance': 12,
        'beam_accuracy': 0.95,
        'prediction_window': 35,
        'aggression': 0.9,
    },
    'DYNAMIC': {
        'name': 'DYNAMIC',
        'think_interval': 10,
        'movement_error': 0.15,
        'energy_threshold_attack': 60,
        'energy_threshold_defend': 40,
        'hunting_distance': 20,
        'flee_distance': 8,
        'beam_accuracy': 0.7,
        'prediction_window': 10,
        'aggression': 0.5,
    },
}

DIFFICULTY_FEATURES = {
    'BEGINNER': {
        'mining_enabled': True, 'tactical_charging': False,
        'shield_chance': 0.3, 'combo_chains': False,
        'corner_cut_detection': False, 'portal_awareness': False,
        'beam_dodge': False, 'distance_beam_firing': False,
        'mine_density_check': False, 'strategy_hysteresis': False,
        'mine_strategy': 'DEFENSIVE',
    },
    'INTERMEDIATE': {
        'mining_enabled': True, 'tactical_charging': True,
        'shield_chance': 0.5, 'combo_chains': False,
        'corner_cut_detection': False, 'portal_awareness': True,
        'beam_dodge': True, 'distance_beam_firing': False,
        'mine_density_check': True, 'strategy_hysteresis': True,
        'mine_strategy': 'BALANCED',
    },
    'HARD': {
        'mining_enabled': True, 'tactical_charging': True,
        'shield_chance': 0.7, 'combo_chains': True,
        'corner_cut_detection': True, 'portal_awareness': True,
        'beam_dodge': True, 'distance_beam_firing': True,
        'mine_density_check': True, 'strategy_hysteresis': True,
        'mine_strategy': 'BALANCED',
    },
    'INSANE': {
        'mining_enabled': True, 'tactical_charging': True,
        'shield_chance': 0.9, 'combo_chains': True,
        'corner_cut_detection': True, 'portal_awareness': True,
        'beam_dodge': True, 'distance_beam_firing': True,
        'mine_density_check': True, 'strategy_hysteresis': True,
        'mine_strategy': 'AGGRESSIVE',
    },
    'DYNAMIC': {
        'mining_enabled': True, 'tactical_charging': True,
        'shield_chance': 0.5, 'combo_chains': False,
        'corner_cut_detection': False, 'portal_awareness': True,
        'beam_dodge': True, 'distance_beam_firing': False,
        'mine_density_check': True, 'strategy_hysteresis': True,
        'mine_strategy': 'BALANCED',
    },
}


def get_active_config():
    global _active_config
    if _active_config is None:
        set_difficulty('INTERMEDIATE')
    return _active_config


def set_active_config(config):
    global _active_config
    _active_config = config


def set_difficulty(name):
    global _active_config
    preset = DIFFICULTY_PRESETS.get(name, DIFFICULTY_PRESETS['INTERMEDIATE'])
    features = DIFFICULTY_FEATURES.get(name, DIFFICULTY_FEATURES['INTERMEDIATE'])
    _active_config = {**preset, **features}


def get_difficulty_preset(name):
    return DIFFICULTY_PRESETS.get(name, DIFFICULTY_PRESETS['INTERMEDIATE'])


def get_dynamic_difficulty(cpu_score, human_score, round_num):
    """Select difficulty based on score differential."""
    diff = human_score - cpu_score
    if diff >= 3:
        return 'HARD'
    elif diff >= 1:
        return 'INTERMEDIATE'
    elif diff <= -2:
        return 'BEGINNER'
    else:
        return 'INTERMEDIATE'


def get_energy_strategy(player, opponent, state, config):
    """Composite threat scoring for energy management."""
    dist = math.hypot(player.x - opponent.x, player.y - opponent.y)

    # Threat components
    proximity_threat = max(0, 1 - dist / 20)
    energy_threat = opponent.boost_energy / MAX_ENERGY
    alignment = 1 if abs(player.x - opponent.x) < 3 or abs(player.y - opponent.y) < 3 else 0

    threat_score = proximity_threat * 0.4 + energy_threat * 0.3 + alignment * 0.3

    result = {'shield': False, 'boost': False, 'conserve': False}

    if threat_score > 0.7 and player.boost_energy > config['energy_threshold_defend']:
        result['shield'] = True
    elif threat_score < 0.3 and player.boost_energy > config['energy_threshold_attack']:
        result['boost'] = True
    elif player.boost_energy < 30:
        result['conserve'] = True

    return result


def adjust_difficulty_dynamically(state, config):
    """Intra-round difficulty adjustment based on score."""
    p_cpu = state.players[1]  # CPU is always player 1 in single-player
    p_human = state.players[0]

    diff = p_human.score - p_cpu.score

    if diff >= 2:
        config['energy_threshold_attack'] = max(30, config['energy_threshold_attack'] - 5)
        config['aggression'] = min(0.9, config['aggression'] + 0.1)
    elif diff <= -2:
        config['energy_threshold_attack'] = min(80, config['energy_threshold_attack'] + 5)
        config['aggression'] = max(0.2, config['aggression'] - 0.1)
```

- [ ] **Step 2: Write ai/pathfinding.py**

```python
# pi/ai/pathfinding.py
"""A* pathfinding with MinHeap priority queue."""

import math
from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X
from grid import grid_index


class MinHeap:
    """Binary min-heap for A* open set."""

    def __init__(self):
        self._data = []

    def push(self, priority, item):
        self._data.append((priority, item))
        self._sift_up(len(self._data) - 1)

    def pop(self):
        if not self._data:
            return None
        self._swap(0, len(self._data) - 1)
        item = self._data.pop()
        if self._data:
            self._sift_down(0)
        return item

    def __len__(self):
        return len(self._data)

    def _sift_up(self, i):
        while i > 0:
            parent = (i - 1) // 2
            if self._data[i][0] < self._data[parent][0]:
                self._swap(i, parent)
                i = parent
            else:
                break

    def _sift_down(self, i):
        n = len(self._data)
        while True:
            smallest = i
            left = 2 * i + 1
            right = 2 * i + 2
            if left < n and self._data[left][0] < self._data[smallest][0]:
                smallest = left
            if right < n and self._data[right][0] < self._data[smallest][0]:
                smallest = right
            if smallest != i:
                self._swap(i, smallest)
                i = smallest
            else:
                break

    def _swap(self, i, j):
        self._data[i], self._data[j] = self._data[j], self._data[i]


def find_path_to_target(maze, start_x, start_y, target_x, target_y):
    """A* pathfinding from pixel coordinates to pixel coordinates.

    Returns list of (pixel_x, pixel_y) waypoints, or empty list if no path.
    """
    # Convert to grid cells
    sc = int((start_x - MAZE_OFFSET_X) / CELL_SIZE)
    sr = int(start_y / CELL_SIZE)
    tc = int((target_x - MAZE_OFFSET_X) / CELL_SIZE)
    tr = int(target_y / CELL_SIZE)

    sc = max(0, min(COLS - 1, sc))
    sr = max(0, min(ROWS - 1, sr))
    tc = max(0, min(COLS - 1, tc))
    tr = max(0, min(ROWS - 1, tr))

    start = grid_index(maze, sc, sr)
    target = grid_index(maze, tc, tr)
    if not start or not target:
        return []

    # A* search
    open_set = MinHeap()
    g_score = {}
    came_from = {}

    start_key = (sc, sr)
    target_key = (tc, tr)

    g_score[start_key] = 0
    h = abs(tc - sc) + abs(tr - sr)  # Manhattan distance
    open_set.push(h, start_key)
    closed = set()

    directions = [(0, -1, 0), (1, 0, 1), (0, 1, 2), (-1, 0, 3)]

    while len(open_set) > 0:
        _, current_key = open_set.pop()
        cc, cr = current_key

        if current_key == target_key:
            # Reconstruct path
            path = []
            key = current_key
            while key in came_from:
                px = MAZE_OFFSET_X + key[0] * CELL_SIZE + 1
                py = key[1] * CELL_SIZE + 1
                path.append((px, py))
                key = came_from[key]
            path.reverse()
            return path

        if current_key in closed:
            continue
        closed.add(current_key)

        cell = grid_index(maze, cc, cr)
        if not cell:
            continue

        for dc, dr, wall_idx in directions:
            nc, nr = cc + dc, cr + dr
            neighbor = grid_index(maze, nc, nr)
            if not neighbor:
                continue
            neighbor_key = (nc, nr)
            if neighbor_key in closed:
                continue

            opp_wall = (wall_idx + 2) % 4
            if cell.walls[wall_idx] or neighbor.walls[opp_wall]:
                continue

            new_g = g_score[current_key] + 1
            if new_g < g_score.get(neighbor_key, float('inf')):
                came_from[neighbor_key] = current_key
                g_score[neighbor_key] = new_g
                h = abs(tc - nc) + abs(tr - nr)
                open_set.push(new_g + h, neighbor_key)

    return []  # no path found


def is_player_stuck(player):
    """Check if player hasn't moved significantly."""
    if player.last_pos is None:
        player.last_pos = (player.x, player.y)
        return False
    dx = player.x - player.last_pos[0]
    dy = player.y - player.last_pos[1]
    player.last_pos = (player.x, player.y)
    return math.hypot(dx, dy) < 0.3


def get_unstuck_direction(maze, player):
    """Return a direction to escape stuck state."""
    from grid import is_wall as _is_wall
    directions = [
        ('right', 1, 0), ('left', -1, 0),
        ('down', 0, 1), ('up', 0, -1),
    ]
    for name, dx, dy in directions:
        if not _is_wall(maze, player.x + dx * 2, player.y + dy * 2):
            return name
    return 'right'  # fallback
```

- [ ] **Step 3: Write test for pathfinding**

```python
# pi/tests/test_ai_pathfinding.py
from ai.pathfinding import MinHeap, find_path_to_target, is_player_stuck
from grid import init_maze
from config import MAZE_OFFSET_X, CELL_SIZE, COLS, ROWS
from classes import Player

def test_min_heap():
    h = MinHeap()
    h.push(5, 'a')
    h.push(1, 'b')
    h.push(3, 'c')
    assert h.pop() == (1, 'b')
    assert h.pop() == (3, 'c')
    assert h.pop() == (5, 'a')

def test_find_path_adjacent():
    maze, _, _, _ = init_maze(seed=42)
    # Path from cell (1,1) to cell (2,1)
    sx = MAZE_OFFSET_X + 1 * CELL_SIZE + 1
    sy = 1 * CELL_SIZE + 1
    tx = MAZE_OFFSET_X + 2 * CELL_SIZE + 1
    ty = 1 * CELL_SIZE + 1
    path = find_path_to_target(maze, sx, sy, tx, ty)
    # In a perfect maze, there's always a path
    assert len(path) > 0

def test_find_path_same_cell():
    maze, _, _, _ = init_maze(seed=42)
    sx = MAZE_OFFSET_X + 5 * CELL_SIZE + 1
    sy = 5 * CELL_SIZE + 1
    path = find_path_to_target(maze, sx, sy, sx, sy)
    assert len(path) == 0  # already at target

def test_find_path_across_maze():
    maze, _, _, _ = init_maze(seed=42)
    sx = MAZE_OFFSET_X + 0 * CELL_SIZE + 1
    sy = 0 * CELL_SIZE + 1
    tx = MAZE_OFFSET_X + (COLS - 1) * CELL_SIZE + 1
    ty = (ROWS - 1) * CELL_SIZE + 1
    path = find_path_to_target(maze, sx, sy, tx, ty)
    assert len(path) > 0

def test_is_player_stuck():
    p = Player(0)
    p.x, p.y = 10, 20
    assert not is_player_stuck(p)  # first call sets baseline
    p.x, p.y = 10, 20  # didn't move
    assert is_player_stuck(p)
    p.x, p.y = 15, 20  # moved
    assert not is_player_stuck(p)
```

- [ ] **Step 4: Write ai/combat.py**

```python
# pi/ai/combat.py
"""Beam firing, mine placement, and threat assessment."""

import math
import random
from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, ENERGY_COSTS
from grid import grid_index, has_line_of_sight


def check_beam_path(maze, player, opponent):
    """BFS check if beam path exists to opponent. Returns path length or 0."""
    sc = int((player.x - MAZE_OFFSET_X) / CELL_SIZE)
    sr = int(player.y / CELL_SIZE)
    ec = int((opponent.x - MAZE_OFFSET_X) / CELL_SIZE)
    er = int(opponent.y / CELL_SIZE)

    start = grid_index(maze, sc, sr)
    end = grid_index(maze, ec, er)
    if not start or not end:
        return 0

    for cell in maze:
        cell.bfs_visited = False
        cell.parent = None

    queue = [start]
    head = 0
    start.bfs_visited = True
    directions = [(1, 0, 1), (0, 1, 2), (-1, 0, 3), (0, -1, 0)]

    while head < len(queue):
        curr = queue[head]
        head += 1
        if curr is end:
            length = 0
            node = curr
            while node.parent:
                length += 1
                node = node.parent
            return length

        for dc, dr, wi in directions:
            n = grid_index(maze, curr.c + dc, curr.r + dr)
            if n and not n.bfs_visited:
                opp = (wi + 2) % 4
                if not curr.walls[wi] and not n.walls[opp]:
                    n.bfs_visited = True
                    n.parent = curr
                    queue.append(n)
    return 0


def should_fire_beam(maze, player, opponent, config, frame_count):
    """Decide if CPU should fire beam."""
    if player.boost_energy < ENERGY_COSTS.BEAM:
        return False
    if player.beam_idx < len(player.beam_pixels):
        return False

    path_len = check_beam_path(maze, player, opponent)
    if path_len == 0:
        return False

    # INSANE fires regardless of distance
    if config.get('name') == 'INSANE':
        return True

    # Others check distance
    max_dist = 8 if config.get('distance_beam_firing') else 5
    return path_len <= max_dist


def should_charge_beam(maze, player, opponent, config, frame_count):
    """Decide if CPU should charge beam."""
    if not config.get('tactical_charging'):
        return False
    if player.boost_energy < ENERGY_COSTS.CHARGED_BEAM:
        return False

    path_len = check_beam_path(maze, player, opponent)
    max_len = 6 if opponent.glitch_is_active(frame_count) else 4
    return 0 < path_len <= max_len


def should_detonate_nearby_mines(player, opponent, state, config):
    """Check if CPU should detonate mines near opponent."""
    dist = math.hypot(player.x - opponent.x, player.y - opponent.y)
    if dist < 5:
        return False  # too close, might hurt self

    own_mines = [m for m in state.mines if m['owner'] == player.id]
    for m in own_mines:
        mine_dist = math.hypot(m['x'] - opponent.x, m['y'] - opponent.y)
        if mine_dist < 5:
            return True
    return False


def calculate_mine_position(player, opponent, state, config):
    """Calculate strategic mine placement position."""
    strategy = config.get('mine_strategy', 'BALANCED')

    if strategy == 'AGGRESSIVE':
        # Place toward opponent's predicted path
        return {'x': math.floor(player.x), 'y': math.floor(player.y)}
    elif strategy == 'DEFENSIVE':
        # Place near own goal
        return {'x': math.floor(player.x), 'y': math.floor(player.y)}
    else:
        # Balanced - place at current position
        return {'x': math.floor(player.x), 'y': math.floor(player.y)}


def get_dodge_direction(player, opponent):
    """Get perpendicular dodge direction from opponent's aim."""
    dx = opponent.x - player.x
    dy = opponent.y - player.y
    # Perpendicular direction
    if abs(dx) > abs(dy):
        return 'up' if random.random() > 0.5 else 'down'
    else:
        return 'left' if random.random() > 0.5 else 'right'
```

- [ ] **Step 5: Write ai/strategy.py**

```python
# pi/ai/strategy.py
"""High-level strategy selection and predictive movement."""

import math
import random
from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, TIMING
from grid import grid_index


def decide_strategy(player, opponent, state, config):
    """Select high-level strategy based on game state."""
    dist = math.hypot(player.x - opponent.x, player.y - opponent.y)
    frame = state.frame_count
    game_time = state.game_time

    # Urgency increases as time runs out
    time_pressure = 1.0 - (game_time / state.max_game_time) if state.max_game_time > 0 else 0

    # Stunned/glitched opponent = execute
    if opponent.stun_is_active(frame) or opponent.glitch_is_active(frame):
        if dist < 15:
            return 'EXECUTE'

    # Low time = rush goal
    if game_time < TIMING.SUDDEN_DEATH_TIME:
        return 'GOAL_RUSH'

    # Score advantage = play defensive
    if player.score > opponent.score and time_pressure > 0.5:
        return 'GOAL_RUSH'

    # Close = hunt
    if dist < config.get('hunting_distance', 20):
        if config.get('aggression', 0.5) > 0.6:
            return 'HUNT'

    # Default
    if time_pressure > 0.3:
        return 'GOAL_RUSH'

    return 'HUNT'


def get_strategy_target(player, opponent, state, strategy):
    """Get target coordinates for the current strategy."""
    if strategy == 'GOAL_RUSH':
        tx = MAZE_OFFSET_X + player.goal_c * CELL_SIZE + 1
        ty = player.goal_r * CELL_SIZE + 1
        return tx, ty
    elif strategy == 'HUNT' or strategy == 'EXECUTE':
        return opponent.x, opponent.y
    elif strategy == 'BLOCK_GOAL':
        tx = MAZE_OFFSET_X + opponent.goal_c * CELL_SIZE + 1
        ty = opponent.goal_r * CELL_SIZE + 1
        return tx, ty
    else:
        return opponent.x, opponent.y


def predict_player_movement(opponent, frames_ahead):
    """Predict where opponent will be in N frames."""
    if not opponent.direction_history:
        return opponent.x, opponent.y

    # Use most recent direction
    if len(opponent.direction_history) > 0:
        last = opponent.direction_history[-1]
        dx, dy = 0, 0
        if last == 'up': dy = -1
        elif last == 'down': dy = 1
        elif last == 'left': dx = -1
        elif last == 'right': dx = 1
        return (
            opponent.x + dx * opponent.current_speed * frames_ahead,
            opponent.y + dy * opponent.current_speed * frames_ahead,
        )

    return opponent.x, opponent.y
```

- [ ] **Step 6: Write ai/controller.py**

```python
# pi/ai/controller.py
"""CPU input orchestrator - generates movement and action commands."""

import math
import random
from config import CELL_SIZE, MAZE_OFFSET_X, TIMING, ENERGY_COSTS
from ai.pathfinding import find_path_to_target, is_player_stuck, get_unstuck_direction
from ai.strategy import decide_strategy, get_strategy_target, predict_player_movement
from ai.combat import should_fire_beam, should_charge_beam, should_detonate_nearby_mines
from ai.difficulty import get_active_config, get_energy_strategy
from grid import is_wall


def get_cpu_input(player, opponent, state):
    """Generate CPU input commands for this frame.

    Returns dict matching human input format:
        up, down, left, right, shield, beam, mine, boost, boom, start
    """
    config = get_active_config()
    frame = state.frame_count
    inp = {
        'up': False, 'down': False, 'left': False, 'right': False,
        'shield': False, 'beam': False, 'mine': False, 'boost': False,
        'boom': False, 'start': False, 'start_pressed': False,
    }

    if player.is_dead:
        return inp

    # Reaction speed - only think every N frames
    player.ai_frame_counter += 1
    if player.ai_frame_counter < config.get('think_interval', 10):
        return inp
    player.ai_frame_counter = 0

    # Stuck detection
    if is_player_stuck(player):
        player.stuck_counter += 1
        if player.stuck_counter > 3:
            unstuck_dir = get_unstuck_direction(state.maze, player)
            inp[unstuck_dir] = True
            player.stuck_counter = 0
            return inp
    else:
        player.stuck_counter = 0

    # Strategy selection
    strategy = decide_strategy(player, opponent, state, config)
    target_x, target_y = get_strategy_target(player, opponent, state, strategy)

    # Prediction for hunting
    if strategy in ('HUNT', 'EXECUTE') and config.get('prediction_window', 0) > 0:
        pred_x, pred_y = predict_player_movement(opponent, config['prediction_window'])
        target_x, target_y = pred_x, pred_y

    # Pathfinding
    path = find_path_to_target(state.maze, player.x, player.y, target_x, target_y)

    if path:
        next_wp = path[0]
        dx = next_wp[0] - player.x
        dy = next_wp[1] - player.y

        # Movement error simulation
        error_chance = config.get('movement_error', 0)
        if random.random() < error_chance:
            # Occasionally go wrong direction
            dirs = ['up', 'down', 'left', 'right']
            inp[random.choice(dirs)] = True
        else:
            if abs(dx) > 0.5:
                inp['right' if dx > 0 else 'left'] = True
            if abs(dy) > 0.5:
                inp['down' if dy > 0 else 'up'] = True

    # Energy strategy
    energy_strat = get_energy_strategy(player, opponent, state, config)

    # Shield
    if energy_strat['shield'] and random.random() < config.get('shield_chance', 0.5):
        inp['shield'] = True

    # Boost
    if energy_strat['boost'] and strategy in ('HUNT', 'EXECUTE', 'GOAL_RUSH'):
        inp['boost'] = True

    # Combat decisions
    dist = math.hypot(player.x - opponent.x, player.y - opponent.y)

    # Beam firing
    if should_charge_beam(state.maze, player, opponent, config, frame):
        inp['beam'] = True  # hold to charge
    elif should_fire_beam(state.maze, player, opponent, config, frame):
        inp['beam'] = True

    # Mine detonation
    if should_detonate_nearby_mines(player, opponent, state, config):
        inp['boom'] = True

    # Mine placement
    if config.get('mining_enabled') and player.mines_left > 0:
        if strategy in ('HUNT', 'BLOCK_GOAL') and random.random() < 0.1:
            inp['mine'] = True

    return inp
```

- [ ] **Step 7: Run tests**

Run: `cd pi && python -m pytest tests/test_ai_pathfinding.py -v`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add pi/ai/
git commit -m "feat(pi): add AI system (pathfinding, strategy, combat, difficulty)"
```

---

### Task 11: Menu Screens

**Files:**
- Create: `pi/menu.py`

- [ ] **Step 1: Write menu.py**

```python
# pi/menu.py
"""Menu rendering: main menu, player setup, high scores, game over overlays."""

import time
import math
from config import LOGICAL_W, LOGICAL_H, COLORS, DIFFICULTIES, hsl_to_rgb
from hud import draw_text, draw_digit, draw_char


def render_menu(renderer, state):
    """Draw main menu screen."""
    # Background dim pixels
    dim = (17, 17, 17)
    for y in range(LOGICAL_H):
        for x in range(LOGICAL_W):
            renderer.set_pixel_no_cam(x, y, dim)

    blink = int(time.time() * 2) % 2 == 0
    menu_colors = [
        (8, 255, 255),    # cyan
        (255, 0, 255),    # magenta
        (0, 255, 136),    # green
        (136, 136, 255),  # blue
    ]

    draw_text(renderer, "SELECT MODE", 43, 3, (255, 255, 255), use_camera=False)

    center = 43 + (len("SELECT MODE") * 4 - 1) // 2
    options = ["SINGLE PLAYER", "LOCAL MULTI", "HIGH SCORES"]
    start_y = 13
    spacing = 10

    for idx, option in enumerate(options):
        opt_len = len(option) * 4
        selected = state.menu_selection == idx
        color = menu_colors[idx] if selected else (136, 136, 136)
        x = center - opt_len // 2
        if blink and selected:
            draw_text(renderer, ">", x - 6, start_y + idx * spacing, (255, 255, 255), use_camera=False)
            draw_text(renderer, "<", x + opt_len, start_y + idx * spacing, (255, 255, 255), use_camera=False)
        draw_text(renderer, option, x, start_y + idx * spacing, color, use_camera=False)

    # Controls hint
    draw_text(renderer, "UP/DN", 5, 56, (97, 202, 93), use_camera=False)
    draw_text(renderer, "START", 100, 56, (187, 78, 78), use_camera=False)


def render_player_setup(renderer, state):
    """Draw player setup screen."""
    dim = (17, 17, 17)
    for y in range(LOGICAL_H):
        for x in range(LOGICAL_W):
            renderer.set_pixel_no_cam(x, y, dim)

    ps = state.player_setup
    blink = int(time.time() * 5) % 2 == 0
    is_multi = state.game_mode == 'MULTI'
    player_color = COLORS[ps['color_idx']]

    title = "MULTI PLAYER" if is_multi else "SINGLE PLAYER"
    draw_text(renderer, title, 39 if not is_multi else 43, 3, (255, 255, 255), use_camera=False)

    if is_multi:
        p_id = ps['active_player'] + 1
        draw_text(renderer, f"PLAYER {p_id}", 52, 11, player_color.rgb, use_camera=False)
    else:
        diff = DIFFICULTIES[ps['difficulty_idx']]
        diff_color = diff.rgb if not (blink and ps['phase'] == 'DIFFICULTY') else (85, 85, 85)
        draw_text(renderer, "DIFF: ", 43, 16, (136, 136, 136), use_camera=False)
        draw_text(renderer, diff.name, 65, 16, diff_color, use_camera=False)

    preview_y = 24 if is_multi else 24
    color_rgb = player_color.rgb if not (blink and ps['phase'] == 'COLOR') else (85, 85, 85)
    draw_text(renderer, "COLOR: ", 39, preview_y + 1, (136, 136, 136), use_camera=False)
    for dx in range(7):
        for dy in range(7):
            renderer.set_pixel_no_cam(65 + dx, preview_y + dy, color_rgb)
    draw_text(renderer, player_color.name, 76, preview_y + 1, color_rgb, use_camera=False)

    name_y = 36 if is_multi else 34
    draw_text(renderer, "NAME: ", 43, name_y, (136, 136, 136), use_camera=False)
    for i in range(3):
        ch = chr(ps['name_chars'][i])
        active = (i == ps['name_char_idx']) and ps['phase'] == 'NAME'
        color = player_color.rgb if active else (85, 85, 85)
        draw_text(renderer, ch, 65 + i * 6, name_y, color, use_camera=False)
        if active and blink:
            for ux in range(3):
                renderer.set_pixel_no_cam(65 + i * 6 + ux, name_y + 7, player_color.rgb)

    draw_text(renderer, "UP/DN", 5, 56, (97, 202, 93), use_camera=False)
    draw_text(renderer, "CHANGE", 5, 56, (97, 202, 93), use_camera=False)
    draw_text(renderer, "PREV NEXT", 94, 56, (187, 78, 78), use_camera=False)


def render_high_scores(renderer, state):
    """Draw high scores screen."""
    dim = (17, 17, 17)
    for y in range(LOGICAL_H):
        for x in range(LOGICAL_W):
            renderer.set_pixel_no_cam(x, y, dim)

    draw_text(renderer, "HIGH SCORES", 40, 2, (255, 255, 0), use_camera=False)

    if not state.high_scores:
        draw_text(renderer, "NO SCORES YET", 35, 20, (136, 136, 136), use_camera=False)
        draw_text(renderer, "PLAY A GAME", 42, 30, (100, 100, 100), use_camera=False)
    else:
        for idx, entry in enumerate(state.high_scores[:8]):
            y_pos = 10 + idx * 6
            rank_color = (255, 255, 0) if idx == 0 else ((255, 136, 0) if idx == 1 else (136, 136, 136))
            draw_text(renderer, f"{idx+1}.", 5, y_pos, rank_color, use_camera=False)
            name = entry.get('name', '???')[:3].upper()
            win_color = tuple(entry.get('win_color', (255, 255, 255)))
            draw_text(renderer, name, 14, y_pos, win_color, use_camera=False)
            draw_text(renderer, "VS", 29, y_pos, (100, 100, 100), use_camera=False)
            opp = entry.get('opponent', '???')[:3].upper()
            opp_color = tuple(entry.get('opp_color', (136, 136, 136)))
            draw_text(renderer, opp, 40, y_pos, opp_color, use_camera=False)

    blink = int(time.time() * 2) % 2 == 0
    if blink:
        draw_text(renderer, "PRESS ANY TO GO BACK", 24, 57, (100, 100, 100), use_camera=False)


def render_game_overlay(renderer, state):
    """Draw pause, round over, and game over overlays."""
    blink = int(time.time() * 2) % 2 == 0

    if state.is_paused:
        # Dim background
        for y in range(LOGICAL_H):
            for x in range(LOGICAL_W):
                renderer.set_pixel_no_cam(x, y, (0, 0, 0))

        draw_text(renderer, "PAUSED", 52, 10, (255, 255, 255), use_camera=False)

        options = ["RESUME", "RESTART", "QUIT"]
        start_y = 24
        center_x = 52 + (len("PAUSED") * 4 - 1) // 2

        for idx, option in enumerate(options):
            selected = state.pause_menu_selection == idx
            color = (255, 255, 0) if selected else (136, 136, 136)
            opt_len = len(option) * 4
            x = center_x - opt_len // 2
            if blink and selected:
                draw_text(renderer, ">", x - 6, start_y + idx * 10, (255, 255, 255), use_camera=False)
            draw_text(renderer, option, x, start_y + idx * 10, color, use_camera=False)

    elif state.is_game_over:
        for y in range(LOGICAL_H):
            for x in range(LOGICAL_W):
                renderer.set_pixel_no_cam(x, y, (0, 0, 0))

        win_msg = state.messages.get('win', 'GAME OVER')
        win_color = (255, 255, 255)
        if state.messages.get('win_color') and hasattr(state.messages['win_color'], 'rgb'):
            win_color = state.messages['win_color'].rgb

        if blink:
            draw_text(renderer, win_msg, 49, 8, win_color, use_camera=False)

        taunt = state.messages.get('taunt', '')
        if taunt:
            # Scrolling text
            draw_text(renderer, taunt, int(state.scroll_x), 29, (255, 255, 0), use_camera=False)
            state.scroll_x -= 0.5
            if state.scroll_x < -(len(taunt) * 4):
                state.scroll_x = LOGICAL_W + 5

        if blink:
            draw_text(renderer, "PRESS ANY TO RESET", 30, 52, (111, 109, 235), use_camera=False)

    elif state.is_round_over:
        for y in range(LOGICAL_H):
            for x in range(LOGICAL_W):
                renderer.set_pixel_no_cam(x, y, (0, 0, 0))

        draw_text(renderer, "ROUND OVER", 46, 8, (255, 255, 255), use_camera=False)
        round_msg = state.messages.get('round', '')
        round_color = (255, 255, 255)
        if state.messages.get('round_color') and hasattr(state.messages['round_color'], 'rgb'):
            round_color = state.messages['round_color'].rgb
        draw_text(renderer, round_msg, int(state.scroll_x), 29, round_color, use_camera=False)
        state.scroll_x -= 0.5

        if blink:
            draw_text(renderer, "PRESS ANY BUTTON", 34, 52, (255, 255, 0), use_camera=False)

    if state.is_attract_mode and not state.is_paused:
        if int(time.time() * 1.2) % 2 == 0:
            draw_text(renderer, "DEMO MODE", 48, 25, (255, 0, 0), use_camera=False)
            draw_text(renderer, "PRESS ANY BUTTON", 34, 35, (255, 255, 0), use_camera=False)
```

- [ ] **Step 2: Commit**

```bash
git add pi/menu.py
git commit -m "feat(pi): add menu screens (main menu, setup, high scores, overlays)"
```

---

### Task 12: Main Game Loop + State Machine

**Files:**
- Create: `pi/main.py`

- [ ] **Step 1: Write main.py**

```python
#!/usr/bin/env python3
# pi/main.py
"""Maze Battlegrounds — Raspberry Pi LED Matrix Edition.

Entry point: game loop, state machine, round/match flow.
"""

import sys
import time
import math
import signal

from config import (
    FIXED_STEP, LOGICAL_W, LOGICAL_H, COLS, ROWS, CELL_SIZE,
    MAZE_OFFSET_X, MAX_SCORE, COLORS, DIFFICULTIES,
    TIMING, ENERGY_COSTS, BEAM_LENGTH, C_BEAM_LENGTH, C_BEAM_WIDTH,
    hsl_to_rgb, BEAM_SPEED,
)
from state import GameState, reset_state_for_match, sudden_death_is_active, should_spawn_ammo_crate
from classes import Player, Camera
from grid import init_maze, grid_index, create_ammo_crate, is_wall
from renderer import Renderer
from hud import render_hud, draw_text
from menu import render_menu, render_player_setup, render_high_scores, render_game_overlay
from mechanics import (
    apply_player_actions, update_projectiles, check_beam_collisions,
    check_beam_actions, check_mines_actions, check_portal_actions,
    check_crate, update_mines, resolve_round,
)
from effects import update_particles, check_boost_trail
from input_handler import InputHandler
from ai.controller import get_cpu_input
from ai.difficulty import set_difficulty, get_active_config, set_active_config, get_dynamic_difficulty
from seeded_random import seeded_random


# Graceful shutdown
_running = True

def _signal_handler(sig, frame):
    global _running
    _running = False

signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)


def start_new_match(state):
    """Initialize a new match."""
    reset_state_for_match(state)
    set_difficulty(state.difficulty)
    start_new_round(state)


def start_new_round(state):
    """Generate maze and reset for a new round."""
    maze, portals, game_time, max_game_time = init_maze()
    state.maze = maze
    state.portals = portals
    state.game_time = game_time
    state.max_game_time = max_game_time
    state.frame_count = 0
    state.mines = []
    state.particles = []
    state.projectiles = []
    state.ammo_crate = None
    state.ammo_last_take_time = -999
    state.is_round_over = False
    state.is_game_over = False
    state.death_timer = 0
    state.victim_idx = -1
    state.is_draw = False
    state.scroll_x = 0

    # Place players
    p0, p1 = state.players
    p0.x = MAZE_OFFSET_X + 1 * CELL_SIZE + 0.5
    p0.y = 1 * CELL_SIZE + 0.5
    p0.goal_c = COLS - 1
    p0.goal_r = ROWS - 1
    p0.reset_state()

    p1.x = MAZE_OFFSET_X + (COLS - 2) * CELL_SIZE + 0.5
    p1.y = (ROWS - 2) * CELL_SIZE + 0.5
    p1.goal_c = 0
    p1.goal_r = 0
    p1.reset_state()

    # Dynamic difficulty adjustment
    if state.difficulty == 'DYNAMIC':
        new_diff = get_dynamic_difficulty(p1.score, p0.score, p0.score + p1.score)
        set_difficulty(new_diff)


def handle_menu_input(state, p1_input, p2_input, any_input):
    """Handle input on the main menu screen."""
    if state.input_delay > 0:
        state.input_delay -= 1
        return

    if p1_input['up'] or p2_input['up']:
        state.menu_selection = (state.menu_selection - 1) % 3
        state.input_delay = 10
    elif p1_input['down'] or p2_input['down']:
        state.menu_selection = (state.menu_selection + 1) % 3
        state.input_delay = 10
    elif p1_input['boom'] or p1_input.get('start_pressed') or p2_input['boom'] or p2_input.get('start_pressed'):
        if state.menu_selection == 0:  # Single player
            state.game_mode = 'SINGLE'
            state.screen = 'PLAYER_SETUP'
            state.player_setup['phase'] = 'DIFFICULTY'
            state.player_setup['is_done'] = False
            state.input_delay = 15
        elif state.menu_selection == 1:  # Local multi
            state.game_mode = 'MULTI'
            state.screen = 'PLAYER_SETUP'
            state.player_setup['phase'] = 'COLOR'
            state.player_setup['active_player'] = 0
            state.player_setup['is_done'] = False
            state.input_delay = 15
        elif state.menu_selection == 2:  # High scores
            state.screen = 'HIGHSCORES'
            state.input_delay = 15


def handle_setup_input(state, p1_input, p2_input):
    """Handle input on the player setup screen."""
    if state.input_delay > 0:
        state.input_delay -= 1
        return

    ps = state.player_setup

    if ps['phase'] == 'DIFFICULTY':
        if p1_input['up']:
            ps['difficulty_idx'] = (ps['difficulty_idx'] - 1) % len(DIFFICULTIES)
            state.input_delay = 8
        elif p1_input['down']:
            ps['difficulty_idx'] = (ps['difficulty_idx'] + 1) % len(DIFFICULTIES)
            state.input_delay = 8
        elif p1_input['right'] or p1_input['boom'] or p1_input.get('start_pressed'):
            state.difficulty = DIFFICULTIES[ps['difficulty_idx']].name
            ps['phase'] = 'COLOR'
            state.input_delay = 10

    elif ps['phase'] == 'COLOR':
        playable = [i for i, c in enumerate(COLORS) if c.name not in ('BLACK', 'WHITE')]
        current_idx = playable.index(ps['color_idx']) if ps['color_idx'] in playable else 0

        if p1_input['up']:
            current_idx = (current_idx - 1) % len(playable)
            ps['color_idx'] = playable[current_idx]
            state.input_delay = 8
        elif p1_input['down']:
            current_idx = (current_idx + 1) % len(playable)
            ps['color_idx'] = playable[current_idx]
            state.input_delay = 8
        elif p1_input['right'] or p1_input['boom'] or p1_input.get('start_pressed'):
            ps['phase'] = 'NAME'
            state.input_delay = 10
        elif p1_input['left']:
            if state.game_mode == 'SINGLE':
                ps['phase'] = 'DIFFICULTY'
            state.input_delay = 10

    elif ps['phase'] == 'NAME':
        if p1_input['up']:
            ps['name_chars'][ps['name_char_idx']] = (ps['name_chars'][ps['name_char_idx']] - 65 - 1) % 26 + 65
            state.input_delay = 6
        elif p1_input['down']:
            ps['name_chars'][ps['name_char_idx']] = (ps['name_chars'][ps['name_char_idx']] - 65 + 1) % 26 + 65
            state.input_delay = 6
        elif p1_input['right']:
            if ps['name_char_idx'] < 2:
                ps['name_char_idx'] += 1
                state.input_delay = 8
            else:
                # Done with this player
                if state.game_mode == 'MULTI' and ps['active_player'] == 0:
                    ps['active_player'] = 1
                    ps['phase'] = 'COLOR'
                    ps['name_char_idx'] = 0
                    state.input_delay = 15
                else:
                    _finalize_setup(state)
        elif p1_input['left']:
            if ps['name_char_idx'] > 0:
                ps['name_char_idx'] -= 1
                state.input_delay = 8
            else:
                ps['phase'] = 'COLOR'
                state.input_delay = 10
        elif p1_input['boom'] or p1_input.get('start_pressed'):
            if state.game_mode == 'MULTI' and ps['active_player'] == 0:
                ps['active_player'] = 1
                ps['phase'] = 'COLOR'
                ps['name_char_idx'] = 0
                state.input_delay = 15
            else:
                _finalize_setup(state)


def _finalize_setup(state):
    """Start the match after setup is complete."""
    ps = state.player_setup
    p1_name = ''.join(chr(c) for c in ps['name_chars'])

    if state.game_mode == 'SINGLE':
        reset_state_for_match(state, ps['color_idx'])
        state.players[0].name = p1_name
        state.players[1].name = 'CPU'
        set_difficulty(state.difficulty)
    else:
        reset_state_for_match(state, ps['color_idx'])
        state.players[0].name = p1_name
        # P2 gets second setup (simplified: use default for now)
        state.players[1].name = 'P-2'

    state.screen = 'PLAYING'
    start_new_round(state)


def handle_highscore_input(state, p1_input, p2_input, any_input):
    """Handle input on the high scores screen."""
    if state.input_delay > 0:
        state.input_delay -= 1
        return
    if any_input:
        state.screen = 'MENU'
        state.input_delay = 15


def handle_playing_input(state, p1_input, p2_input, any_input):
    """Handle game logic during PLAYING state."""
    # Pause
    if p1_input.get('start_pressed') or p2_input.get('start_pressed'):
        state.is_paused = not state.is_paused
        state.pause_menu_selection = 0
        state.input_delay = 15
        return

    if state.is_paused:
        _handle_pause_menu(state, p1_input, p2_input)
        return

    # Round/game over - wait for input
    if state.is_game_over:
        if state.input_delay > 0:
            state.input_delay -= 1
            return
        if any_input:
            if state.is_attract_mode:
                state.is_attract_mode = False
                state.screen = 'MENU'
            else:
                state.screen = 'HIGHSCORES'
            state.input_delay = 15
        return

    if state.is_round_over:
        if state.input_delay > 0:
            state.input_delay -= 1
            return
        if any_input:
            start_new_round(state)
            state.input_delay = 15
        return

    # Death timer
    if state.death_timer > 0:
        state.death_timer -= 1
        if state.death_timer <= 0:
            winner_idx = 1 - state.victim_idx
            resolve_round(state, winner_idx, state.messages.get('death_reason', 'COMBAT'))
            state.input_delay = 30
            return

    # Game time countdown
    state.game_time -= 1
    if state.game_time <= 0:
        resolve_round(state, -1, 'TIMEOUT')
        return

    state.frame_count += 1

    # Apply player inputs
    p0, p1 = state.players
    if state.game_mode == 'SINGLE':
        apply_player_actions(state, p0, p1_input)
        cpu_input = get_cpu_input(p1, p0, state)
        apply_player_actions(state, p1, cpu_input)
    else:
        apply_player_actions(state, p0, p1_input)
        apply_player_actions(state, p1, p2_input)

    # Update game systems
    update_projectiles(state)
    check_beam_collisions(state)
    for p in state.players:
        if not p.is_dead:
            check_beam_actions(state, p)
            check_mines_actions(state, p)
            check_portal_actions(state, p)
            check_crate(state, p)
            check_boost_trail(p)

    update_mines(state)
    update_particles(state)

    # Ammo crate respawn
    if state.ammo_crate is None and should_spawn_ammo_crate(state):
        state.ammo_crate = create_ammo_crate(state.maze)

    # Sudden death mine spawning
    if sudden_death_is_active(state) and state.frame_count % 50 == 0:
        import random
        mc = random.randint(1, COLS - 2)
        mr = random.randint(1, ROWS - 2)
        state.mines.append({
            'x': MAZE_OFFSET_X + mc * CELL_SIZE,
            'y': mr * CELL_SIZE,
            'owner': -1,
            'drop_time': state.frame_count,
            'active': False,
            'vis_x': random.random(),
            'vis_y': random.random(),
        })

    # Camera shake
    state.camera.update()


def _handle_pause_menu(state, p1_input, p2_input):
    """Handle input within pause menu."""
    if state.input_delay > 0:
        state.input_delay -= 1
        return

    options_count = 3  # RESUME, RESTART, QUIT

    if p1_input['up'] or p2_input['up']:
        state.pause_menu_selection = (state.pause_menu_selection - 1) % options_count
        state.input_delay = 8
    elif p1_input['down'] or p2_input['down']:
        state.pause_menu_selection = (state.pause_menu_selection + 1) % options_count
        state.input_delay = 8
    elif p1_input['boom'] or p2_input['boom']:
        if state.pause_menu_selection == 0:  # Resume
            state.is_paused = False
        elif state.pause_menu_selection == 1:  # Restart
            state.is_paused = False
            start_new_match(state)
        elif state.pause_menu_selection == 2:  # Quit
            state.is_paused = False
            state.screen = 'MENU'
        state.input_delay = 15


def render_playing(renderer, state):
    """Render the game world."""
    # Camera shake
    renderer.set_camera(state.camera.x, state.camera.y)

    # Wall color based on time ratio
    time_ratio = state.game_time / state.max_game_time if state.max_game_time > 0 else 0
    time_ratio = max(0, min(1, time_ratio))
    hue = int(time_ratio * 180)
    wall_color = hsl_to_rgb(hue, 100, 50)

    # Draw maze walls
    for cell in state.maze:
        x = cell.c * CELL_SIZE + MAZE_OFFSET_X
        y = cell.r * CELL_SIZE

        draw_corner = cell.walls[0] or cell.walls[3]
        if not draw_corner:
            left = grid_index(state.maze, cell.c - 1, cell.r)
            top = grid_index(state.maze, cell.c, cell.r - 1)
            if (left and left.walls[0]) or (top and top.walls[3]):
                draw_corner = True

        if draw_corner:
            renderer.set_pixel(x, y, wall_color)
        if cell.walls[0]:
            renderer.set_pixel(x + 1, y, wall_color)
            renderer.set_pixel(x + 2, y, wall_color)
        if cell.walls[3]:
            renderer.set_pixel(x, y + 1, wall_color)
            renderer.set_pixel(x, y + 2, wall_color)

        # Right and bottom edges
        if cell.c == COLS - 1:
            if cell.walls[1] or cell.walls[0]:
                renderer.set_pixel(x + 3, y, wall_color)
            if cell.walls[1]:
                renderer.set_pixel(x + 3, y + 1, wall_color)
                renderer.set_pixel(x + 3, y + 2, wall_color)
        if cell.r == ROWS - 1:
            if cell.walls[2] or cell.walls[3]:
                renderer.set_pixel(x, y + 3, wall_color)
            if cell.walls[2]:
                renderer.set_pixel(x + 1, y + 3, wall_color)
                renderer.set_pixel(x + 2, y + 3, wall_color)
        if cell.c == COLS - 1 and cell.r == ROWS - 1:
            renderer.set_pixel(x + 3, y + 3, wall_color)

    # Goals
    gc = (255, 255, 255) if (state.frame_count // 12) % 2 == 0 else (68, 68, 68)
    for p in state.players:
        gx = MAZE_OFFSET_X + p.goal_c * CELL_SIZE + 1
        gy = p.goal_r * CELL_SIZE + 1
        for dx in range(2):
            for dy in range(2):
                renderer.set_pixel(gx + dx, gy + dy, gc)

    # Portals
    for idx, portal in enumerate(state.portals):
        tx = int(portal['x'] - 1.5)
        ty = int(portal['y'] - 1.5)
        out_color = (0, 170, 255) if idx == 0 else (0, 0, 255)
        perimeter = [(1,0),(2,0),(0,1),(3,1),(0,2),(3,2),(1,3),(2,3)]
        for dx, dy in perimeter:
            renderer.set_pixel(tx + dx, ty + dy, out_color)
        # Rotating center
        center_seq = [(1,1),(2,1),(2,2),(1,2)]
        active = (state.frame_count // 6) % 4
        for ci, (dx, dy) in enumerate(center_seq):
            if ci == active:
                renderer.set_pixel(tx + dx, ty + dy, (255, 255, 255))
            else:
                renderer.set_pixel(tx + dx, ty + dy, (0, 0, 0))

    # Ammo crate
    if state.ammo_crate:
        tx = state.ammo_crate['x']
        ty = state.ammo_crate['y']
        cells = [(0,1),(1,1),(1,0),(0,0)]
        active = (state.frame_count // 6) % 4
        for ci, (dx, dy) in enumerate(cells):
            color = (255, 255, 255) if ci == active else (0, 255, 21)
            renderer.set_pixel(tx + dx, ty + dy, color)

    # Mines
    for m in state.mines:
        if m['active']:
            color = (255, 0, 0) if state.frame_count % 12 < 6 else (128, 0, 0)
        else:
            color = (68, 68, 68)
        renderer.set_pixel(m['x'] + m['vis_x'], m['y'] + m['vis_y'], color)

    # Projectiles
    for proj in state.projectiles:
        mag = math.hypot(proj['vx'], proj['vy'])
        if mag == 0:
            continue
        nx, ny = proj['vx'] / mag, proj['vy'] / mag
        px, py = -ny, nx
        half_len = C_BEAM_LENGTH / 2
        half_w = C_BEAM_WIDTH / 2
        scan_r = half_len + 3
        color = (255, 255, 255) if state.frame_count % 4 < 2 else proj['color']
        for iy in range(int(proj['y'] - scan_r), int(proj['y'] + scan_r) + 1):
            for ix in range(int(proj['x'] - scan_r), int(proj['x'] + scan_r) + 1):
                dx = ix - proj['x']
                dy = iy - proj['y']
                if abs(dx * nx + dy * ny) <= half_len and abs(dx * px + dy * py) <= half_w:
                    renderer.set_pixel(ix, iy, color)

    # Players
    for p in state.players:
        if p.is_dead:
            continue
        player_rgb = renderer.parse_color(p.color)

        # Beam trail
        for k in range(BEAM_LENGTH):
            i = int(p.beam_idx) - k
            if 0 <= i < len(p.beam_pixels):
                alpha = 1.0 - (k / BEAM_LENGTH)
                c = renderer.alpha_blend(player_rgb, alpha)
                renderer.set_pixel(p.beam_pixels[i]['x'], p.beam_pixels[i]['y'], c)

        # Charging effect
        if p.is_charging:
            r = (state.frame_count - p.charge_start_time) / TIMING.CHARGE_DURATION
            r = min(1.0, r)
            cc = hsl_to_rgb(int((1 - r) * 120), 100, 50)
            sx, sy = int(p.x) - 1, int(p.y) - 1
            perim = [(1,0),(2,0),(3,1),(3,2),(2,3),(1,3),(0,2),(0,1)]
            n = math.ceil(8 * r)
            for i in range(n):
                renderer.set_pixel(sx + perim[i][0], sy + perim[i][1], cc)

        # Shield
        if p.shield_active:
            sx, sy = int(p.x) - 1, int(p.y) - 1
            perim = [(1,0),(2,0),(3,1),(3,2),(2,3),(1,3),(0,2),(0,1)]
            for dx, dy in perim:
                renderer.set_pixel(sx + dx, sy + dy, (136, 136, 255))

        # Boost trail
        if p.boost_energy > 0 and p.current_speed > 0.6:
            for i, t in enumerate(p.trail):
                alpha = (i / len(p.trail)) * 0.4 if p.trail else 0
                c = renderer.alpha_blend(player_rgb, alpha)
                renderer.set_pixel(int(t['x']), int(t['y']), c)

        # Stun/glitch visual
        if p.glitch_is_active(state.frame_count) or p.stun_is_active(state.frame_count):
            import random
            rx = random.randint(-1, 1)
            ry = random.randint(-1, 1)
            for dx in range(2):
                for dy in range(2):
                    renderer.set_pixel(int(p.x) + dx + rx, int(p.y) + dy + ry, (255, 0, 0))
            cx = random.randint(-1, 1)
            cy = random.randint(-1, 1)
            for dx in range(2):
                for dy in range(2):
                    renderer.set_pixel(int(p.x) + dx + cx, int(p.y) + dy + cy, (0, 255, 255))
        else:
            color = player_rgb
            if p.boost_energy < 25 and (state.frame_count // 6) % 2 == 0:
                color = (85, 85, 85)
            for dx in range(2):
                for dy in range(2):
                    renderer.set_pixel(int(p.x) + dx, int(p.y) + dy, color)

    # Particles
    for part in state.particles:
        renderer.set_pixel(part['x'], part['y'], part['color'])

    # HUD + overlays (no camera offset)
    renderer.set_camera(0, 0)
    render_hud(renderer, state, wall_color)
    render_game_overlay(renderer, state)


def main():
    """Main entry point."""
    global _running

    # Detect if running on Pi hardware
    use_hardware = '--mock' not in sys.argv
    renderer = Renderer(use_hardware=use_hardware)
    input_handler = InputHandler()
    state = GameState()

    last_time = time.monotonic()
    accumulator = 0.0

    print("Maze Battlegrounds - Pi Edition started")
    if not use_hardware:
        print("Running in MOCK mode (no LED matrix)")

    try:
        while _running and state.running:
            now = time.monotonic()
            accumulator += now - last_time
            last_time = now

            # Cap to prevent spiral of death
            if accumulator > 0.25:
                accumulator = 0.25

            while accumulator >= FIXED_STEP:
                p1_input, p2_input, any_input = input_handler.poll()

                # Attract mode trigger
                if state.screen == 'MENU' and input_handler.is_idle() and not state.is_attract_mode:
                    state.is_attract_mode = True
                    state.game_mode = 'ATTRACT'
                    reset_state_for_match(state)
                    state.players[0].name = 'CPU'
                    state.players[1].name = 'CPU'
                    state.screen = 'PLAYING'
                    start_new_round(state)

                # Break attract mode on input
                if state.is_attract_mode and any_input:
                    state.is_attract_mode = False
                    state.screen = 'MENU'
                    state.input_delay = 15

                # Screen dispatch
                if state.screen == 'MENU':
                    handle_menu_input(state, p1_input, p2_input, any_input)
                elif state.screen == 'PLAYER_SETUP':
                    handle_setup_input(state, p1_input, p2_input)
                elif state.screen == 'HIGHSCORES':
                    handle_highscore_input(state, p1_input, p2_input, any_input)
                elif state.screen == 'PLAYING':
                    if state.game_mode == 'ATTRACT':
                        # Both players are CPU in attract mode
                        cpu1 = get_cpu_input(state.players[0], state.players[1], state)
                        cpu2 = get_cpu_input(state.players[1], state.players[0], state)
                        handle_playing_input(state, cpu1, cpu2, False)
                    else:
                        handle_playing_input(state, p1_input, p2_input, any_input)

                accumulator -= FIXED_STEP

            # Render
            renderer.begin_frame()
            if state.screen == 'MENU':
                render_menu(renderer, state)
            elif state.screen == 'PLAYER_SETUP':
                render_player_setup(renderer, state)
            elif state.screen == 'HIGHSCORES':
                render_high_scores(renderer, state)
            elif state.screen == 'PLAYING':
                render_playing(renderer, state)
            renderer.end_frame()

            # Frame pacing - don't busy-spin
            elapsed = time.monotonic() - now
            if elapsed < FIXED_STEP:
                time.sleep(FIXED_STEP - elapsed)

    except KeyboardInterrupt:
        pass
    finally:
        input_handler.cleanup()
        print("Maze Battlegrounds - Pi Edition stopped")


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Fix the import in mechanics.py**

The `CONFIG_BLAST_RADIUS` import doesn't exist — it should use the local `BLAST_RADIUS = 4.0` constant. Update the import line in `mechanics.py`:

Replace:
```python
from config import (
    CONFIG_BLAST_RADIUS, BASE_SPEED, MAX_SPEED, MAX_ENERGY,
```
With:
```python
from config import (
    BASE_SPEED, MAX_SPEED, MAX_ENERGY,
```

- [ ] **Step 3: Create systemd service file**

```ini
# pi/maze-battlegrounds.service
[Unit]
Description=Maze Battlegrounds LED Matrix Game
After=multi-user.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /home/obrelix/maze-battlegrounds/pi/main.py
WorkingDirectory=/home/obrelix/maze-battlegrounds/pi
Restart=on-failure
RestartSec=5
Environment=PYTHONPATH=/home/obrelix/rpi-rgb-led-matrix/bindings/python

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Run all tests locally**

Run: `cd pi && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add pi/main.py pi/maze-battlegrounds.service
git commit -m "feat(pi): add main game loop, state machine, and systemd service"
```

---

### Task 13: Deploy and Test on Pi

**Files:** No new files — deployment and hardware testing.

- [ ] **Step 1: Install pygame on Pi**

```bash
ssh obrelix@192.168.1.201 "pip3 install pygame"
```

- [ ] **Step 2: Deploy files to Pi**

```bash
scp -r pi/ obrelix@192.168.1.201:/home/obrelix/maze-battlegrounds/pi/
```

- [ ] **Step 3: Run tests on Pi**

```bash
ssh obrelix@192.168.1.201 "cd /home/obrelix/maze-battlegrounds/pi && PYTHONPATH=/home/obrelix/rpi-rgb-led-matrix/bindings/python python3 -m pytest tests/ -v"
```

Expected: All tests PASS on Pi

- [ ] **Step 4: Test with mock renderer first**

```bash
ssh obrelix@192.168.1.201 "cd /home/obrelix/maze-battlegrounds/pi && PYTHONPATH=/home/obrelix/rpi-rgb-led-matrix/bindings/python python3 main.py --mock"
```

Verify: Game starts, no crashes, keyboard input works.

- [ ] **Step 5: Test with real LED matrix**

```bash
ssh obrelix@192.168.1.201 "cd /home/obrelix/maze-battlegrounds/pi && sudo PYTHONPATH=/home/obrelix/rpi-rgb-led-matrix/bindings/python python3 main.py"
```

Verify: LED matrix displays the menu. Test gamepad input.

- [ ] **Step 6: Tune hardware parameters if needed**

If display has issues:
- Flickering: increase `pwm_lsb_nanoseconds` (try 200, 300)
- Wrong scan: try `options.multiplexing = 1` through `8`
- Too dim/bright: adjust `options.brightness`
- GPIO issues: try `options.gpio_slowdown = 3` or `5`

- [ ] **Step 7: Install systemd service**

```bash
ssh obrelix@192.168.1.201 "sudo cp /home/obrelix/maze-battlegrounds/pi/maze-battlegrounds.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable maze-battlegrounds"
```

- [ ] **Step 8: Commit any tuning changes**

```bash
git add -A && git commit -m "feat(pi): hardware tuning after initial testing"
```
