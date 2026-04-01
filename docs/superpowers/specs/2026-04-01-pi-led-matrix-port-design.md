# Raspberry Pi LED Matrix Port — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Target Hardware:** Raspberry Pi 4 (4GB) + Adafruit RGB Matrix Bonnet + HUB75 P2.5 128x64 LED Panel (320mm x 160mm, SMD2121, 32-scan)
**Test Pi:** `ssh obrelix@192.168.1.201`

## Goal

Port Maze Battlegrounds to run natively on a Raspberry Pi driving a physical 128x64 RGB LED matrix panel. The browser version remains untouched. The Pi version is a standalone Python application that rewrites the game logic and renders directly to the LED hardware via hzeller's `rpi-rgb-led-matrix` library.

## Scope

### In Scope
- Full game logic port from JavaScript to Python
- LED matrix rendering via `rgbmatrix` Python bindings
- USB gamepad input via `pygame.joystick`
- Single player (human vs CPU), local PvP (two gamepads), attract mode (CPU vs CPU)
- All 5 AI difficulty levels + dynamic difficulty
- Menu system, player setup, high score persistence (local JSON file)
- Systemd service for auto-start on boot

### Out of Scope
- Online multiplayer
- Touch controls
- Sound/audio
- Multi-panel chaining
- Browser version changes

## Architecture

### Directory Structure

```
pi/
├── main.py              # Entry point, game loop, state machine
├── config.py            # All constants (from JS config.js)
├── state.py             # Game state dataclass + update functions
├── renderer.py          # LED matrix rendering via rgbmatrix
├── grid.py              # Maze generation (recursive backtracking)
├── mechanics.py         # Player actions, projectiles, collisions, explosions
├── input_handler.py     # USB gamepad polling via pygame.joystick
├── classes.py           # Player, Camera (shake), entity dataclasses
├── effects.py           # Particle spawning, camera shake triggers
├── hud.py               # Bitmap font text, energy bars, scores, timer
├── menu.py              # Menu screens, player setup, game over, high scores
├── ai/
│   ├── __init__.py
│   ├── controller.py    # CPU input orchestrator (get_cpu_input)
│   ├── pathfinding.py   # BFS with O(1) dequeue, stuck detection
│   ├── strategy.py      # High-level strategy, predictive movement, combos
│   ├── combat.py        # Beam/mine/shield decision logic
│   └── difficulty.py    # 5 presets + dynamic scaling
├── requirements.txt     # pygame
└── maze-battlegrounds.service  # systemd unit file
```

### Module Responsibilities

| Module | Role |
|--------|------|
| `main.py` | Game loop (60 FPS fixed timestep), state machine transitions, round/match flow |
| `config.py` | All constants: grid dimensions, energy costs, speeds, timings, controls, bitmap fonts, colors |
| `state.py` | Game state dataclass, entity management, high score persistence (JSON file) |
| `renderer.py` | LED matrix output: `SetPixel(x, y, r, g, b)` calls, double-buffered via `SwapOnVSync()` |
| `grid.py` | Recursive backtracking maze generation, wall collision queries, cell indexing |
| `mechanics.py` | Player actions (beam, shield, mines, boost), projectile physics, collision detection, explosions |
| `input_handler.py` | USB gamepad polling via `pygame.joystick`, button mapping, idle detection |
| `classes.py` | `Player`, `Camera` (shake) dataclasses with all player state fields |
| `effects.py` | Particle spawning, camera shake triggers (no sound) |
| `hud.py` | Bitmap font rendering, energy bars, score display, timer, overlay text |
| `menu.py` | Menu rendering, player setup screen, game over screen, high scores display |
| `ai/controller.py` | CPU input orchestrator, smart movement direction selection |
| `ai/pathfinding.py` | BFS pathfinding with O(1) dequeue, stuck detection, unstuck recovery |
| `ai/strategy.py` | Strategy selection, predictive movement, corner-cut detection, combo chains |
| `ai/combat.py` | Beam firing decisions, tactical charging, mine placement/detonation |
| `ai/difficulty.py` | Difficulty presets (BEGINNER through DYNAMIC), adaptive scaling |

## Rendering

### Hardware Configuration

```python
options = RGBMatrixOptions()
options.rows = 64
options.cols = 128
options.chain_length = 1
options.parallel = 1
options.hardware_mapping = 'adafruit-hat'
options.gpio_slowdown = 4          # RPi 4 typically needs 4
options.scan_mode = 0              # progressive
options.multiplexing = 0           # direct (32-scan)
options.brightness = 80            # 0-100, configurable
options.pwm_lsb_nanoseconds = 130  # flicker reduction
options.drop_privileges = True
options.disable_hardware_pulsing = False  # quality mode (sound disabled)
```

### Rendering Pipeline

Each frame:
1. Get a new `FrameCanvas` from the double buffer
2. Clear canvas (all pixels off = black)
3. Apply camera shake offset (integer pixel displacement)
4. Draw layers in order:
   - Maze walls (iterate wall cells, `SetPixel` for each)
   - Goal zones (blinking 2x2 blocks)
   - Portals (4x4 perimeter animation)
   - Ammo crate (rotating 2x2)
   - Mines (flashing red/dark red)
   - Projectiles (beam trails as pixel sequences)
   - Players (body pixel + trail + effects)
   - Particles (single pixels with color + lifetime)
   - HUD (bitmap font text, energy bars, scores, timer)
   - Overlays (pause, round over, game over text)
5. `SwapOnVSync(canvas)` to display

### Key Rendering Differences from Browser

| Browser | Pi |
|---------|----|
| `ctx.arc()` draws circles to simulate LEDs | `SetPixel()` — each pixel IS a physical LED |
| Background draws dark #222 circles for LED grid | Background is just "off" (no draw needed) |
| 1280x640 canvas scaled from 128x64 logical | Native 128x64, 1:1 mapping |
| `ctx.globalAlpha` for transparency | Alpha blending done manually (blend RGB with background) |
| `ctx.fillRect()` for rectangles | Loop of `SetPixel()` calls |
| `ctx.translate()` for camera | Add offset to all coordinates |
| Offscreen bgCanvas for performance | Not needed — clear + redraw is fast |

### Color Handling

Colors in the JS codebase are hex strings (`#ff0000`, `#88f`) and HSL strings (`hsl(60, 100%, 50%)`). The Python renderer will:
- Parse hex to `(r, g, b)` tuples at init time (pre-compute color table in `config.py`)
- HSL dynamic colors (charging aura) computed per-frame via `colorsys.hls_to_rgb()`
- Alpha blending: `blended = int(fg * alpha + bg * (1 - alpha))` per channel, where bg is typically (0,0,0)

## Input

### Gamepad Architecture

```python
import pygame

pygame.init()
pygame.joystick.init()

# Poll each frame:
def poll_gamepads():
    pygame.event.pump()  # process internal event queue
    for i in range(min(2, pygame.joystick.get_count())):
        js = pygame.joystick.Joystick(i)
        # Read axes (left stick + dpad)
        # Read buttons (face + triggers)
        # Map to game input structure
```

### Button Mapping

Default mapping (configurable in `config.py`):

| Game Action | Xbox/Generic | PS |
|-------------|-------------|-----|
| Move | Left stick / D-pad | Left stick / D-pad |
| Beam | A (btn 0) | Cross (btn 0) |
| Shield | B (btn 1) | Circle (btn 1) |
| Mine | X (btn 2) | Square (btn 2) |
| Boost | Y (btn 3) | Triangle (btn 3) |
| Detonate | RB (btn 5) | R1 (btn 5) |
| Pause | Start (btn 7) | Options (btn 7) |

Axis deadzone: 0.5 (matching browser `GAMEPAD_THRESH`).

### Keyboard Fallback

For development/testing, `pygame.key` also polled each frame with the same P1/P2 key mappings as the browser version (WASD + arrow keys). This allows testing without gamepads connected.

### Idle Detection

Track `last_input_time = time.monotonic()`. If no input for 15 seconds, trigger attract mode (CPU vs CPU). Any gamepad input resets the timer.

## Game Loop

### Fixed Timestep

```python
FIXED_STEP = 1.0 / 60.0  # 16.67ms

def main():
    matrix = init_matrix()
    state = init_state()
    last_time = time.monotonic()
    accumulator = 0.0

    while state.running:
        now = time.monotonic()
        accumulator += now - last_time
        last_time = now

        # Cap accumulator to prevent spiral of death
        if accumulator > 0.25:
            accumulator = 0.25

        while accumulator >= FIXED_STEP:
            poll_input(state)
            update(state)
            accumulator -= FIXED_STEP

        render(state, matrix)
```

### State Machine

```
MENU → PLAYER_SETUP → PLAYING → ROUND_OVER → GAME_OVER → HIGH_SCORES → MENU
                                     ↓
                              (next round if score < MAX_SCORE)
                                     ↓
                                  PLAYING
```

Attract mode: triggered from MENU after 15s idle. Runs PLAYING with both players as CPU. Any input returns to MENU.

## Game State

```python
@dataclass
class GameState:
    screen: str = 'MENU'           # MENU, PLAYER_SETUP, PLAYING, ROUND_OVER, GAME_OVER, HIGH_SCORES
    game_mode: str = 'SINGLE'     # SINGLE, MULTI, ATTRACT
    difficulty: str = 'INTERMEDIATE'
    frame_count: int = 0
    game_time: int = 2000          # countdown in frames
    is_paused: bool = False

    players: list = None           # [Player, Player]
    maze: list = None              # 2D wall grid
    mines: list = None
    projectiles: list = None
    particles: list = None
    portals: list = None
    ammo_crate: object = None

    camera_shake: float = 0.0
    camera_offset_x: float = 0.0
    camera_offset_y: float = 0.0

    high_scores: list = None
    running: bool = True

    # Input state
    gamepad_state: dict = None     # {0: {...}, 1: {...}}
    keyboard_state: dict = None    # fallback
```

### Persistence

High scores saved to `/home/obrelix/maze-battlegrounds/pi/highscores.json`:
```json
[
    {"name": "P1", "score": 5, "difficulty": "HARD", "date": "2026-04-01"},
    ...
]
```

Loaded on startup, saved after each match.

## AI System

Direct port of the JavaScript AI modules to Python. The AI is pure logic (no browser APIs) so it ports cleanly:

- **controller.py**: `get_cpu_input(player, opponent, state, config)` returns input dict
- **pathfinding.py**: BFS on the maze grid, returns path as list of `(x, y)`. Uses `collections.deque` for O(1) dequeue (matching the JS implementation)
- **strategy.py**: Strategy selection based on distance, energy, health. Predictive movement, corner-cut detection
- **combat.py**: Beam firing angle checks, mine placement/detonation decisions, charge timing
- **difficulty.py**: 5 preset configs + dynamic scaling. `get_active_config()` / `set_active_config()` pattern preserved

Key timing values stay frame-based (not converted to seconds) to maintain behavioral parity with the browser version.

## Maze Generation

Direct port of `grid.js` recursive backtracking:
- Grid of cells, each with 4 walls (N/S/E/W)
- Start from random cell, carve passages recursively
- Same `CELL_SIZE = 3` (3x3 LEDs per maze cell)
- Same `MAZE_OFFSET_X = 8` (HUD space on left)
- Wall collision queries: `is_wall(x, y)` checks the grid array

Python's default recursion limit (1000) is sufficient for a 128x64 / 3 = ~42x21 cell maze (~882 cells max recursion depth).

## Systemd Service

```ini
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

Runs as root (required for GPIO access). `PYTHONPATH` points to the built rgbmatrix bindings.

## Dependencies

### Python Packages (requirements.txt)
```
pygame>=2.0.0
```

### System Dependencies (already present or via apt)
- `python3` (3.13.5 already installed)
- `python3-dev` (for building rgbmatrix)
- `rpi-rgb-led-matrix` (already cloned and built at `/home/obrelix/rpi-rgb-led-matrix/`)

### Hardware
- Raspberry Pi 4 (4GB)
- Adafruit RGB Matrix Bonnet
- HUB75 P2.5 128x64 LED Panel (320mm x 160mm, SMD2121, 32-scan)
- USB gamepads (1-2)

## Testing Strategy

1. **Unit tests**: Port existing Vitest tests to pytest — maze generation, collision detection, AI pathfinding
2. **Desktop testing**: Develop on the Windows machine using a mock renderer that outputs to terminal (colored ASCII) or a pygame window simulating the LED grid. Run actual LED tests over SSH.
3. **Hardware testing**: Deploy to Pi via SSH/SCP, run with `sudo python3 main.py`
4. **Gamepad testing**: `pygame.joystick` diagnostics script to verify button mappings before full game testing

## Deployment

```bash
# From development machine:
scp -r pi/ obrelix@192.168.1.201:/home/obrelix/maze-battlegrounds/pi/

# On the Pi:
cd /home/obrelix/maze-battlegrounds/pi
pip3 install -r requirements.txt
sudo python3 main.py

# Install systemd service:
sudo cp maze-battlegrounds.service /etc/systemd/system/
sudo systemctl enable maze-battlegrounds
sudo systemctl start maze-battlegrounds
```
