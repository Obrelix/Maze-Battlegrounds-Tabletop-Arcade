# Maze Battlegrounds – Tabletop Arcade (Pre‑Alpha)

A DIY head‑to‑head tabletop arcade console powered by a Raspberry Pi Zero 2 W and a P2.5 128×64 RGB LED Matrix.

This repository contains the source code for **Maze Battlegrounds**—a fast‑paced tactical 1v1 shooter designed specifically for low‑resolution LED displays—along with the hardware specifications to build the physical machine.

**Status:** Pre‑Alpha – mechanics, balance, and UX are under active development and testing.

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

- **Single Player vs CPU** – Hard AI with advanced pathfinding, dodging, shielding, and tactical mine-clearing
- **Multiplayer PvP** – Local head‑to‑head; Player 2 can be human (keyboard/gamepad) or CPU depending on inputs

The HUD and canvas layout mimic the final tabletop hardware: a 128×64 P2.5 RGB LED matrix with a split, flipped interface for opposing players.

---

## Core mechanics

### Energy system

Players have a single **Energy** bar (0–100) that slowly regenerates and is shared by all actions:

- **Tap Beam** – Quick, low‑cost stun attack (30 energy)
- **Charged Beam** – Hold ~3 seconds for lethal wall‑breaking shot (65 energy)
- **Shield** – Block all incoming damage; drains ~3 seconds to empty (10 activation + continuous drain)
- **Boost** – Sprint to chase or escape; slows energy regen while active (drain ~5 seconds to empty)
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
- Respawn every 300ms if empty

#### Portals
- Two portals (blue and cyan) link two points on the map; entering one teleports you to the other
- Each portal use has a **30% chance to "glitch"** your controls, inverting movement for a few seconds
- Animated 4×4 LED display with rotating center pattern

#### Glitch effect
- Temporary control inversion (inverts `dx` and `dy`)
- Duration: ~3 seconds (180 frames)
- Triggered by portal use or environmental hazards

### Rounds, scoring & sudden death

- A match is **first to 5 points**; rounds resolve on elimination or goal score
- **Double KO / Draws** are handled when both players die simultaneously
- **TIME OUT!** ends a round if time expires
- **Sudden Death** triggers when time runs low (<30 seconds):
  - Warning message and scrolling text on the LED matrix
  - Neutral mines spawn at random cells every ~830ms, damaging both players and increasing chaos
  - No timer limit—play until one player is eliminated

### Game states

- **MENU** – Main screen; select "1" for Single Player, "2" for PvP, "3" for High Scores
- **PLAYER_SETUP** – Color selection (arrow keys) and 3‑letter name entry (customizable)
- **PLAYING** – Active gameplay with HUD, energy bars, and real‑time action
- **ROUND_OVER** – Displays winner and scores; waits for next round
- **GAME_OVER** – Full match winner with taunt message (best of 5 rounds)
- **HIGH_SCORES** – Displays top recorded player names and wins
- **ATTRACT_MODE** – Auto‑demo when idle (both players AI‑controlled)

---

## Controls (Web demo)

The web demo supports keyboard, gamepads, and mobile touch controls.

### Keyboard controls

| Action | Player 1 (Blue) | Player 2 (Right) | Notes |
|--------|-----------------|------------------|-------|
| **Move** | W / A / S / D | Arrow Keys | Navigate the maze |
| **Tap/Hold Beam** | F (tap/hold) | K (tap/hold) | Tap = stun; hold ≈3s = lethal shot |
| **Shield** | R | I | Block all damage while energy lasts |
| **Drop Mine** | E | O | Place mine (max 4, refilled by crates) |
| **Boost** | G | L | Speed boost; drains energy quickly |
| **Boom** (Detonate) | Space | Enter | Remote detonation; costs 30 energy |
| **Start/Menu** | 1, 2, R, Enter | Same | Context‑dependent: start game, next round, or reset |
| **Menu** | Esc | Esc | Return to main menu |

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

### File structure

- **`config.js`** – All game constants (grid size, energy costs, colors, control mappings, bitmap fonts)
- **`main.js`** – Main game loop, state machine, round/match logic, sudden death handling
- **`state.js`** – Global game state, player objects, initialization, high score persistence
- **`mechanics.js`** – Core gameplay: player actions, collisions, projectiles, mines, explosions, portals
- **`renderer.js`** – LED matrix rendering, camera shake, HUD display, text rendering (bitmap fonts)
- **`grid.js`** – Maze generation (recursive backtracking), wall collision detection, cell indexing
- **`input.js`** – Keyboard, gamepad, and touch input polling; idle detection for attract mode
- **`ai.js`** – CPU pathfinding (BFS), target detection, combat tactics, unstuck logic
- **`classes.js`** – Player, projectile, and particle class definitions
- **`utils.js`** – Utility functions
- **`style.css`** – Retro cabinet styling, responsive layout, mobile UI
- **`index.html`** – Main entry point: canvas, HUD, mobile controls, nipplejs integration

### Key systems

#### Rendering
- **LED-accurate simulation:** 128×64 logical grid at P2.5 pitch (10px per LED on screen)
- **Dynamic wall coloring:** Walls shift through HSL spectrum based on round timer (red→yellow→cyan)
- **Bitmap font rendering:** Custom 3×5 font for on‑screen text and HUD
- **Pre‑rendered background:** Static LED grid cached for performance
- **Camera shake:** Screen jitter on impacts and explosions

#### Physics & collision
- **Pixel‑perfect wall collisions:** Per‑pixel hitbox checking with corner‑assist for smooth movement
- **Entity overlap detection:** AABB checks for mines, crates, portals, and projectiles
- **Momentum‑based movement:** Substepped collision resolution with nudging for tight corners

#### AI
- **Breadth‑First Search (BFS) pathfinding:** Computes safe paths around mines and walls
- **Opportunity fire:** Checks if enemy is within range and line‑of‑sight before attacking
- **Survival mode:** Shields incoming projectiles and retreats to ammo crates when low on energy
- **Tactical sprinting:** Boosts in straight lines towards objectives when energy permits
- **Unstuck detection:** Breaks out of stuck states with randomized jiggle

#### Audio
- **Minimal SFX:** Beam charge, shield activation, mine drop, detonation, damage, death (Web Audio API)
- **Silent fallback:** Game continues normally if audio fails or is muted

---

## Installation & development

### Web version

**No build step required!** Everything is pure HTML/CSS/JavaScript.

1. Clone or download the repository
2. Open `index.html` in a modern browser
3. Start playing

#### Local development

- Modify `config.js` to tune game constants (energy costs, timings, colors, etc.)
- Edit `mechanics.js` for gameplay logic changes
- Update `renderer.js` for visual tweaks
- Adjust `ai.js` for CPU difficulty

#### Build & deploy

- Copy all files (HTML, CSS, JS) to a static web server
- Deploy to GitHub Pages, Netlify, or any CDN
- No compilation or bundling needed

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

// Energy costs
BEAM_ENERGY_COST: 30,        // Tap beam
CHARGED_BEAM_COST: 65,       // Charged beam
SHIELD_ACTIVATION_COST: 10,  // Shield startup
SHIELD_DRAIN: 0.556,         // Per-frame drain (~3 sec to empty)
BOOST_DRAIN: 0.333,          // Per-frame drain (~5 sec to empty)
DETONATE_COST: 30,           // Mine detonation

// Timings
CHARGE_TIME: 3000,           // Time to full charge (ms)
STUN_DURATION: 300,          // Stun effect duration (ms)
GLITCH_DURATION: 180,        // Control inversion duration (frames)

// Controls
CONTROLS_P1, CONTROLS_P2     // Keyboard key mappings
```

### High score system

High scores are persisted to browser `localStorage` under key `LED_MAZE_HIGHSCORES`. Clearing browser data will reset scores. Entry is via the **PLAYER_SETUP** screen where you choose a 3‑letter name.

---

## Known limitations & future work

- **Hardware deployment** – Pi/HUB75 driver coming soon
- **Sound effects** – Currently Web Audio API only; needs external audio for physical cabinet
- **Gamepad support** – Tested on Xbox and SNES controllers; other layouts may need remapping
- **Mobile responsiveness** – Optimized for portrait mobile; landscape recommended for best gameplay
- **Network multiplayer** – Not yet supported; local play only
- **Customizable layouts** – Theme/color customization planned

---

## Contributing

This is an active hobby project. If you find bugs or have ideas, feel free to open an issue or submit a pull request!

---

## License

MIT License – Free for personal, educational, and non‑commercial use.

---

## Credits

- **Game design & code:** Obrelix
- **Bitmap font:** Custom 3×5 design
- **Joystick library:** [nipplejs](https://yomugames.com/nipplejs/) by Yannick Assogba
- **Inspiration:** Classic arcade games (Robotron, Gauntlet, Bomberman) adapted for LED displays

---

**Last updated:** January 2026  
**Version:** 0.1.0‑alpha
