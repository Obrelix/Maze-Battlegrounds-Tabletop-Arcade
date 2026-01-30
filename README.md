# Maze Battlegrounds – Tabletop Arcade

A DIY head‑to‑head tabletop arcade console powered by a Raspberry Pi Zero 2 W and a P2.5 128×64 RGB LED Matrix.

This repository contains the source code for **Maze Battlegrounds**, a fast‑paced tactical 1v1 shooter designed specifically for low‑resolution LED displays—along with the hardware specifications to build the physical machine.

**Status:** Beta – the browser version is feature-complete and stable. Hardware deployment (Raspberry Pi / LED matrix) is in progress.

**Version:** 0.5.0-beta

---

## Play the browser demo

You can test the current mechanics directly in your browser in a pixel‑perfect mockup of the 128×64 LED matrix.

- **Online demo:** 🕹️ [**PLAY ONLINE DEMO**](https://obrelix.github.io/Maze-Battlegrounds-Tabletop-Arcade/)
- **Browser support:** Chrome, Firefox, Edge, Safari (desktop recommended)
- **Mobile:** Full on‑screen joystick and button support with virtual gamepad

---

## About the game

Maze Battlegrounds is a 1v1 top‑down shooter designed for a digital tabletop experience where both players sit on opposite sides of the same display.

### Objective

- **Goal:** Be the first to reach **5 points**
- **Score by:**
  - Reaching the opponent's spawn zone (the "Goal")
  - Eliminating the opponent with a mine, explosion, or charged beam
- **Dynamic battlefield:** Walls can be destroyed, traps placed, portals used, and energy carefully managed

### Game Modes

- **Single Player vs CPU** – AI uses advanced pathfinding, predictive movement, tactical beam charging, and mine placement tuned by difficulty presets
- **Local Multiplayer** – Head‑to‑head on the same device; Player 2 uses keyboard or gamepad
- **Online Multiplayer** – WebRTC P2P network play with WebSocket fallback, room creation, and matchmaking

The HUD and canvas layout mimic the final tabletop hardware: a 128×64 P2.5 RGB LED matrix with a split, flipped interface for opposing players.

---

## Core mechanics

### Energy system

Players have a single **Energy** bar (0–150) that slowly regenerates and is shared by all actions:

- **Tap Beam** – Quick, low‑cost stun attack (30 energy)
- **Charged Beam** – Hold ~3 seconds for lethal wall‑breaking shot (65 energy)
- **Shield** – Block all incoming damage; drains ~6 seconds to empty (10 activation + continuous drain)
- **Boost** – Sprint to chase or escape; drains ~6 seconds to empty (balanced with shield)
- **Mine Detonation** – Remotely trigger mines for area denial (30 energy per detonation)

**Mismanaging energy leaves you vulnerable to attack, unable to escape, or locked out of vital defenses.**

### Offensive tools

#### Tap Beam
- Quick, low‑cost beam that **stuns** / **slows** the enemy (80% speed reduction for ~300ms)
- Costs **30 energy**

#### Charged Beam
- Hold the beam button for ~3 seconds to charge
- Fires a high‑velocity projectile that **breaks walls** and **instantly kills** on contact
- Costs **65 energy** when released
- Movement is slowed to 60% while charging
- Can be released early for a quick tap stun if held <3 seconds

#### Mines
- Place up to **4 mines** per round (refill via ammo crates)
- Mines arm after ~1 second when dropped
- **Stepping on** or **detonating** a mine creates a large explosion that:
  - Destroys nearby walls
  - Kills players in range
  - Damages both enemies and friendly mines
- Remote detonation costs **30 energy**

### Environment & pickups

#### Ammo Crates
- Green crates spawn randomly on the map
- Refill **mines to max** (4) when collected
- Respawn every 1500ms if empty

#### Portals
- Two portals (blue and cyan) link two points on the map; entering one teleports you to the other
- Each portal use has a **30% chance of glitching** your controls, inverting movement for a few seconds
- Animated 4×4 LED display with rotating center pattern

#### Glitch effect
- Temporary control inversion (inverts `dx` and `dy`)
- Duration: ~3 seconds (180 frames)
- Triggered by portal use or environmental hazards

### Rounds, scoring & sudden death

- A match is **first to 5 points**; rounds resolve on elimination or goal score
- **Double KO / Draws** are handled when both players die simultaneously
- **TIME OUT!** ends the match if time expires; winner determined by score (draw if tied)
- **Sudden Death** triggers when time runs low (<30 seconds):
  - Warning message and scrolling text on the LED matrix
  - Neutral mines spawn at random cells every ~830ms (max 12 on field, spaced apart)
  - No timer limit—play until one player is eliminated

### Game states

- **MENU** – Main screen; navigate with W/S (or ↑/↓) and select with Space/Enter
  - Single Player, Local Multi, Online Multi, High Scores
- **PLAYER_SETUP** – Difficulty selection (single player), color selection, and 3‑letter name entry
- **PLAYING** – Active gameplay with HUD, energy bars, and real‑time action
- **ROUND_OVER** – Displays winner and scores; waits for next round
- **GAME_OVER** – Full match winner with taunt message (first to 5 points)
- **HIGH_SCORES** – Displays top recorded player names and wins
- **ATTRACT_MODE** – Auto‑demo when idle (both players AI‑controlled)

---

## Controls (Web demo)

The web demo supports keyboard, gamepads, and mobile touch controls.

### Keyboard controls

| Action | Player 1 | Player 2 | Notes |
|--------|----------|----------|-------|
| **Move** | W / A / S / D | Arrow Keys | Navigate the maze |
| **Tap/Hold Beam** | F (tap/hold) | K (tap/hold) | Tap = stun; hold ≈3s = lethal shot |
| **Shield** | R | I | Block all damage while energy lasts |
| **Drop Mine** | E | O | Place mine (max 4, refilled by crates) |
| **Boost** | G | L | Speed boost; drains energy quickly |
| **Boom** (Detonate) | Space | Enter | Remote detonation; costs 30 energy |
| **Menu Navigate** | W / S | ↑ / ↓ | Navigate menu options |
| **Menu Select** | Space / F | Enter / K | Select menu option |
| **Return to Menu** | Esc | Esc | Return to main menu |

### Gamepad support

Full gamepad support with sensible defaults:

- **Movement:** Left stick or D‑pad
- **Beam:** A / Cross button
- **Boom (Detonate):** B button
- **Mine:** X / Y (depending on layout)
- **Shield:** Y or L1/R1 (shoulder buttons)
- **Boost:** R1 or secondary face button
- **Start/Select:** Menu navigation and round/match control
  - In main menu: any gamepad button starts a game
  - On Game Over/Round Over: Start + Shield triggers next action
  - Player 1 = gamepad 0, Player 2 = gamepad 1

All gamepad input is merged with keyboard for each player, so both can be used simultaneously.

### Mobile touch controls

For narrow viewports (phones/tablets), the demo activates a touch UI with:

- **Virtual joystick** (left side) – Movement via [nipplejs](https://yomugames.com/nipplejs/)
- **Touch buttons** (right side):
  - Shield (R)
  - Boost (G)
  - Beam (F)
  - Boom (Space)
  - Mine (E)
- **Start button** – Begin a match from the main menu
- **System Mechanics modal** – Quick reference: Mines, Shield, Beams, Portals, Glitch

---

## Technical architecture

### File structure (`docs/js/`)

- **`config.js`** – All game constants (grid size, energy costs, colors, control mappings, bitmap fonts, AI configuration flags)
- **`main.js`** – Main game loop, state machine, round/match logic, sudden death handling 
- **`state.js`** – Global game state, player objects, initialization, and high score persistence
- **`mechanics.js`** – Core gameplay: player actions, collisions, projectiles, mines, explosions, portals, and round resolution
- **`renderer.js`** – LED matrix rendering, camera shake, HUD display, text rendering (bitmap fonts), and visual effects
- **`grid.js`** – Maze generation (recursive backtracking), wall collision detection, and cell indexing helpers
- **`input.js`** – Keyboard, gamepad, and touch input polling; idle detection for attract mode and mobile UI bindings
- **`classes.js`** – Player, Camera, SoundFX, and Cell class definitions (includes AI property initialization)
- **`network.js`** – WebRTC P2P multiplayer with WebSocket fallback, lockstep input sync
- **`online.js`** – Lobby UI, network callbacks, online game setup orchestration
- **`seededRandom.js`** – Deterministic random number generator (Mulberry32 PRNG) for synchronized network play
- **`debug.js`** – State invariant validation (dev mode only, enabled via `?dev` URL parameter)
- **`ai/`** – Modular AI system split into focused modules:
  - **`ai/controller.js`** – CPU input orchestrator (`getCpuInput`), smart movement direction
  - **`ai/pathfinding.js`** – BFS pathfinding with O(1) dequeue, stuck detection, unstuck recovery
  - **`ai/strategy.js`** – High-level strategy selection, predictive movement, corner-cut detection, combo chains
  - **`ai/combat.js`** – Beam firing decisions, tactical charging, mine detonation logic, advanced mine placement
  - **`ai/difficulty.js`** – Difficulty presets, tactical styles, feature flags, adaptive difficulty scaling, config management
- **`nipplejs.min.js`** – Third‑party virtual joystick library used for the mobile touch controls
- **`style.css`** – Retro cabinet styling, responsive layout, and mobile UI layout
- **`index.html`** – Main entry point: canvas, HUD, mobile controls, and script/style wiring

### Key systems

#### Rendering
- **LED-accurate simulation:** 128×64 logical grid at P2.5 pitch (10px per LED on screen)
- **Dynamic wall coloring:** Walls shift through HSL spectrum based on round timer (red→yellow→cyan)
- **Frame-based animations:** All gameplay animations (portals, mines, crates, projectiles) use `frameCount` so they freeze on pause
- **Bitmap font rendering:** Custom 3×5 font for on‑screen text and HUD
- **Pre‑rendered background:** Static LED grid cached for performance
- **Camera shake:** Screen jitter on impacts and explosions

#### Physics & collision
- **Pixel‑perfect wall collisions:** Per‑pixel hitbox checking with corner‑assist for smooth movement
- **Entity overlap detection:** AABB checks for mines, crates, portals, and projectiles
- **Momentum‑based movement:** Substepped collision resolution with nudging for tight corners

#### AI (modular architecture under `ai/`)
- **Breadth‑First Search (BFS) pathfinding:** O(1) dequeue pointer-based BFS with heuristic priority ordering; computes safe paths around mines and walls
- **Reaction latency:** Configurable think-interval simulates human reaction time (1–20 frames between decisions)
- **Human error simulation:** Configurable confusion chance causes temporary random movement for realism
- **Predictive aiming:** Analyzes enemy movement patterns, direction history, and corner-cutting to predict future positions
- **Tactical charging:** AI decides when to charge beams based on enemy alignment, stun state, and energy levels
- **Distance-based firing:** Considers range when firing—higher accuracy at close range, conservative at long range
- **Adaptive difficulty:** Dynamically adjusts aggression, energy thresholds, and reaction times based on score differential
- **Combo chains:** Executes multi-phase tactical sequences (boost to close distance → charge beam on stunned opponents)
- **Strategic mine placement:** Places mines at chokepoints with density checks to prevent clustering
- **Unified shield logic:** Priority-based shield activation considering beam threats, mine danger, and predictive defense
- **Wall-aware dodging:** Checks perpendicular directions for walls before dodging, avoiding self-trapping
- **Strategy hysteresis:** Requires significant priority change to switch strategies, reducing erratic behavior
- **Energy management:** Context-aware shield/boost decisions; won't fire at shielded opponents; respects actual energy costs
- **Mine trap escape:** Calculates danger level from nearby mines; uses boost/shield to escape when surrounded
- **Smart unstuck recovery:** Wall-aware direction selection, prefers opposite of last movement direction

#### Audio
- **Minimal SFX:** Beam charge, shield activation, mine drop, detonation, damage, death (Web Audio API)
- **Silent fallback:** Game continues normally if audio fails or is muted

#### Multiplayer synchronization
Online multiplayer uses lockstep synchronization:
- Host generates maze seed, shared via signaling server
- Both clients use `seededRandom.js` for identical maze generation
- 2-frame input delay buffer for network latency compensation
- WebRTC P2P preferred; auto-fallback to WebSocket relay after 10s timeout
- Input serialized to 2-byte bitmask for bandwidth efficiency

---

## Installation & development

### Web version

**No build step required!** Everything is pure HTML/CSS/JavaScript.

1. Clone or download the repository
2. Open `docs/index.html` in a modern browser
3. Start playing

#### Local development

- Modify `config.js` to tune game constants (energy costs, timings, colors, collision parameters, etc.)
- Edit `mechanics.js` for gameplay logic changes
- Update `renderer.js` for visual tweaks
- Adjust modules under `ai/` for CPU difficulty and behavior (`ai/difficulty.js` for presets, `ai/strategy.js` for tactics)
- **Dev mode:** Append `?dev` to the URL to enable state invariant validation (logs warnings with frame counts to console)

#### Testing

The project uses [Vitest](https://vitest.dev/) for unit testing with jsdom environment.

```bash
npx vitest              # Run tests in watch mode
npx vitest run          # Run tests once
npx vitest run tests/grid.test.js  # Run single test file
```

**Test coverage includes:**
- Grid/maze generation and collision detection
- AI pathfinding and strategy selection
- Game state management and player mechanics
- Portal invulnerability and collision constants

#### Build & deploy

- Copy all files (HTML, CSS, JS) to a static web server
- Deploy to GitHub Pages, Netlify, or any CDN
- No compilation or bundling needed

### Multiplayer server

The online multiplayer mode requires a signaling server for WebRTC connection setup (with WebSocket fallback for relayed gameplay).

```bash
cd server
npm install
npm start          # Production
npm run dev        # Development with auto-reload (--watch)
```

- Server runs on port 8080 (configurable via `PORT` env var)
- Requires Node.js 18+
- Dependencies: `ws` (WebSocket), `uuid` (room IDs)

**Server modules:**
- **`server.js`** – WebSocket server entry point, client connection handling
- **`src/lobby.js`** – Room creation/joining, player management, game start coordination
- **`src/signaling.js`** – WebRTC signaling relay, ICE candidate exchange, WebSocket fallback mode
- **`src/protocol.js`** – Message type constants and error codes shared between client/server

### Hardware version (LED matrix)

Deploying to physical Raspberry Pi with HUB75 RGB LED matrix is **in progress**.

**Target setup:**
- Raspberry Pi Zero 2 W
- P2.5 128×64 RGB LED Matrix (HUB75 interface)
- RGB Matrix Bonnet for Pi (or equivalent HUB75 driver)
- 5V 10A power supply
- USB arcade controllers or gamepad adapters

**Status:** The browser demo's 128×64 logical framebuffer maps directly to the physical matrix. C/C++ driver code and deployment scripts coming soon.

---

## Configuration & customization

### Key config parameters (in `config.js`)

```javascript
// Display
LOGICAL_W: 128,      // Canvas width in LEDs
LOGICAL_H: 64,       // Canvas height in LEDs
PITCH: 10,           // Pixels per LED on screen

// Gameplay
MAX_SCORE: 5,        // Points to win match
GAME_TIME: 20000,    // Round duration (ms)
MAX_MINES: 4,        // Mines per player

// Energy costs (ENERGY_COSTS object)
BEAM: 30,                    // Tap beam
CHARGED_BEAM: 65,            // Charged beam
SHIELD_ACTIVATION: 10,       // Shield startup
DETONATION: 30,              // Mine detonation
BEAM_HIT_TRANSFER: 15,       // Energy gained/lost on beam hit

// Collision & movement (COLLISION object)
HITBOX_SIZE: 0.8,            // Player hitbox for wall collision
CORNER_ASSIST_OFFSET: 0.6,   // Look-ahead for corner assist
CORNER_NUDGE_SPEED: 0.15,    // Nudge speed around corners
PORTAL_COOLDOWN: 60,         // Frames before portal reuse
PORTAL_INVULN_FRAMES: 10,    // Invulnerability after teleport
DEATH_TIMER_FRAMES: 50,      // Delay before round ends after death

// Timings (TIMING object)
CHARGE_DURATION: 180,        // Frames to full charge (3 sec @ 60fps)
STUN_DURATION: 90,           // Stun effect duration (frames)
GLITCH_DURATION: 180,        // Control inversion duration (frames)

// Controls
CONTROLS_P1, CONTROLS_P2     // Keyboard key mappings
```

### AI difficulty presets (in `ai/difficulty.js`)

Available difficulty levels:
- **BEGINNER** – Slower reactions (thinks 3×/sec), 25% movement error chance, basic pathfinding, defensive mine placement
- **INTERMEDIATE** – Balanced behavior (thinks 6×/sec), moderate aggression, adaptive difficulty, distance-based firing, strategy hysteresis
- **HARD** – Fast reactions (thinks 15×/sec), predictive aiming, tactical charging, wall-aware dodging, mine density checks, combo chains
- **INSANE** – Every-frame reactions, advanced prediction (35-frame window), near-perfect aim, all AI features enabled
- **DYNAMIC** – Starts at INTERMEDIATE; adjusts to HARD when losing badly or BEGINNER when dominating

To change AI difficulty, call `setDifficulty('HARD')` from `ai/difficulty.js`. The active config is managed via `getActiveConfig()` / `setActiveConfig()` module exports (no global `window.AI_CONFIG`).

### High score system

High scores are persisted to browser `localStorage` under key `LED_MAZE_HIGHSCORES`. Clearing browser data will reset scores. Entry is via the **PLAYER_SETUP** screen where you choose a 3‑letter name.

---

## Known limitations & future work

- **Hardware deployment** – Pi/HUB75 driver coming soon
- **Sound effects** – Currently Web Audio API only; needs external audio for physical cabinet
- **Gamepad support** – Tested on Xbox and SNES controllers; other layouts may need remapping
- **Mobile responsiveness** – Optimized for portrait mobile; landscape recommended for best gameplay
- **Online multiplayer** – Server code included; self-hosting || `wss://maze-battlegrounds-tabletop-arcade.onrender.com` 
- **Customizable layouts** – Theme/color customization planned

---

## Contributing

This is an active hobby project. If you find bugs or have ideas, feel free to open an issue or submit a pull request!

---

## License

MIT License – Free for personal, educational, and non‑commercial use.

---

## Recent Changes (v0.5.0-beta)

### Major AI Overhaul
Comprehensive AI improvements for smarter combat, better navigation, and higher challenge at HARD/INSANE difficulties.

#### Smart Dodge System
- **Wall-aware dodging:** AI now checks both perpendicular directions for walls before dodging, preferring wall-free paths
- **No more suicidal dodges:** AI won't dodge into walls when evading beams (HARD+ difficulties)

#### Improved Beam Combat
- **Distance-based firing:** AI now considers distance when firing beams:
  - Close range (<12px): Always fires
  - Medium range (12-24px): 60% chance
  - Long range (>24px): 30% chance
- **Better accuracy:** Reduces wasted shots at max range where beams are easily dodged

#### Unified Shield Logic
- **Consolidated shield decisions:** Single priority-based system replaces scattered shield checks:
  1. Immediate beam threat (high urgency)
  2. Mine trap danger (multiple nearby mines)
  3. Predictive shielding when enemy can fire (HARD+ only)

#### Smarter Navigation
- **Intelligent stuck recovery:** When stuck, AI now:
  - Checks all 8 directions for walls
  - Prefers directions opposite to last movement
  - Only moves into wall-free paths
- **Strategy stability (hysteresis):** AI requires significant priority difference (2+) to switch strategies, reducing erratic behavior

#### Enhanced Mine Placement
- **Mine density check:** AI avoids clustering mines in the same area (HARD+ difficulties)
- **Better trap coverage:** Mines spread across chokepoints for more effective area denial

#### Combo Exploitation
- **Multi-phase stun combos:** When opponent is stunned, AI executes:
  - Phase 1: Boost to close distance if far
  - Phase 2: Charge beam when close enough
- **Glitch hunting:** Distance-based combo phases for aggressive pursuit of glitched opponents

#### New Difficulty Features
Added feature flags that scale by difficulty:
- `DODGE_WALL_AWARE`: HARD/INSANE only
- `DISTANCE_BEAM_FIRING`: INTERMEDIATE+
- `MINE_DENSITY_CHECK`: HARD/INSANE only
- `STRATEGY_HYSTERESIS`: INTERMEDIATE+

---

## Previous Changes (v0.1.5-alpha)

### Game Balance
- **Shield energy drain balanced:** Shield now drains at same rate as boost (~6 seconds to empty)
- **No energy regen while charging:** Charging a beam is now a commitment—no passive regen during charge
- **AI energy thresholds fixed:** AI no longer attempts to fire when lacking sufficient energy

### Bug Fixes
- **Beam collision detection:** High-speed beams no longer pass through each other; multi-point sampling added
- **Draw state tracking:** Timeout now properly determines winner by score or declares draw if tied
- **Sudden death mine density:** Limited to 12 mines max with minimum spacing to prevent screen flooding
- **Beam sound timing:** Sound only plays after path validation (no sound on blocked shots)

### AI Improvements
- **Shield awareness:** AI no longer wastes energy firing at shielded opponents
- **Mine trap escape:** Enhanced escape logic with danger level calculation, automatic shield/boost when surrounded
- **Combo system wired up:** AI now executes tactical combos (STUN_CHARGE when opponent stunned, BOOST_HUNT for chase)
- **DYNAMIC difficulty:** Properly implemented with inter-round difficulty adjustment based on score differential

---

## Previous Changes (v0.1.4-alpha)

### Bug Fixes
- **Portal-mine death trap:** Players now have brief invulnerability after teleporting to prevent instant mine deaths
- **Mine detonation race condition:** Fixed simultaneous detonations corrupting game state
- **Sudden death mine spawning:** Mines no longer spawn on top of players or at map edges
- **Pathfinding performance:** Removed expensive sort operation from BFS; uses heuristic priority instead

### Code Quality
- **Extracted magic numbers:** All collision/movement constants now in `config.js` (`COLLISION` object)
- **Input delay helper:** Replaced 19 duplicate assignments with `setInputDelay()` function
- **Refactored long functions:** Split player setup handling into focused sub-functions
- **HUD rendering cleanup:** Extracted `renderPlayerHUD()` to eliminate P1/P2 code duplication
- **Added JSDoc:** Type documentation for critical AI and mechanics functions
- **Added tests:** Portal invulnerability, collision constants, and config helpers

---

## Credits

- **Game design & code:** Obrelix
- **Bitmap font:** Custom 3×5 design
- **Joystick library:** [nipplejs](https://yomugames.com/nipplejs/) by Yannick Assogba
- **Inspiration:** Classic arcade games (Robotron, Gauntlet, Bomberman) adapted for LED displays

---

**Last updated:** January 30, 2026
**Version:** 0.5.0‑beta
