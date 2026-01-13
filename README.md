# Maze Battlegrounds – Tabletop Arcade (Pre‑Alpha)

A DIY head‑to‑head tabletop arcade console powered by a Raspberry Pi Zero 2 W and a P2.5 128×64 RGB LED Matrix.
This repository contains the source code for **Maze** Battlegrounds—a fast‑paced tactical shooter designed specifically for low‑resolution LED displays—along with the hardware specifications to build the physical machine.

Status: Pre‑Alpha – mechanics, balance, and UX are under active development and testing.

---

## Play the browser demo

You can test the current mechanics directly in your browser in a pixel‑perfect mockup of the 128×64 LED matrix.

- Online demo: 🕹️ [**PLAY ONLINE DEMO**](https://obrelix.github.io/Maze-Battlegrounds-Tabletop-Arcade/)
- Works in any modern desktop browser (Chrome, Firefox, Edge, Safari).
- Mobile is supported with on‑screen joystick and buttons, but a keyboard or gamepad on desktop gives the best experience.

---

## About the game

Maze Battlegrounds is a 1v1 top‑down shooter designed for a digital tabletop experience where both players sit on opposite sides of the same display.

- Goal: Be the first to reach 5 points. 
- Score is awarded by:
  - Reaching the opponent’s spawn zone (the “Goal”).
  - Eliminating the opponent with a mine, explosion, or charged beam.
- The battlefield is dynamic: walls can be destroyed, traps can be placed, portals used, and a shared energy resource must be managed carefully.

Two game modes are currently available:

- Single Player vs CPU (hard AI using pathfinding, dodging, shielding, and “battering ram” mine‑clearing behavior).
- Multiplayer PvP (local head‑to‑head; Player 2 can be keyboard, gamepad, or CPU depending on inputs and mode).

The HUD and canvas layout in the web demo mimic the final tabletop hardware: a 128×64 P2.5 RGB LED matrix with a split, flipped interface for opposing players.

---

## Core mechanics

### Energy system

You have a single **Energy** bar that slowly regenerates and is shared by all actions.

Energy is consumed by:

- Boosting (sprinting to chase or escape).
- Beams (tap and charge).
- Shield (blocks all damage while active; drains the bar in roughly 3 seconds in the current tuning).
- Remote detonation of mines (Boom).

Mismanaging energy leaves you unable to shield, escape, or fire at key moments.

### Offensive tools

- Tap Beam  
  - Quick, low‑cost beam that **stuns** / slows the enemy (80% speed for a few seconds).
- Charged Beam  
  - Hold the beam button for about 3 seconds to charge a lethal shot.
  - Slows you while charging, then fires a high‑velocity projectile that breaks walls and instantly kills.
- Mines  
  - Each player can hold up to 4 mines (refill via ammo crates).
  - Stepping on or detonating a mine creates a large explosion that destroys nearby walls and kills anything in range.

### Environment and pickups

- Ammo Crates  
  - Green crates spawn on the map and refill your mines to the maximum when collected.
- Portals  
  - Two portals (orange and blue) link two points on the map; entering one teleports you to the other.
  - Each portal use has a 30% chance to “glitch” your controls, inverting movement for a short period.
- Glitch  
  - Temporary control inversion status effect used mainly as portal risk and occasional effect. 

### Rounds, scoring, and sudden death

- A match is first to 5 points; rounds resolve on elimination or successful goal run.  
- Draws (“DOUBLE KO! DRAW!”) are handled when both players die simultaneously. 
- If time runs out, the round ends in a “TIME OUT!” state. 
- After time is low, **Sudden Death** triggers:
  - Warning message and scrolling text (“SUDDEN DEATH!”) on the LED matrix.
  - Neutral mines start spawning at random cells, damaging both players and increasing chaos.

The web demo includes a simple attract‑mode / idle demo loop that restarts rounds and uses AI for both players when no input is detected for a while.

---

## Controls (Web demo)

The web demo supports keyboard, gamepads, and mobile touch controls.

### Keyboard controls

Default bindings in the current build:

| Action        | Player 1 (Blue)                 | Player 2 / CPU (Right side) | Notes |
|--------------|----------------------------------|-----------------------------|-------|
| Move         | W / A / S / D                    | Arrow keys                  | Navigate the maze. |
| Tap / Hold Beam | F (tap / hold)               | K (tap / hold)              | Tap = stun; Hold ≈ 3s = lethal wall‑breaking beam. |
| Shield       | R                                | I                           | Blocks all damage while energy lasts. |
| Drop Mine    | E                                | O                           | Place a lethal mine (max 4, refilled by ammo crates). |
| Boost        | G                                | L                           | Momentum‑based speed boost; drains energy. |
| Boom (Detonate all mines) | Space               | Enter                       | Remote detonation; costs energy. |
| Start / Next Round / Reset | 1, 2, R, Enter (depending on context) | Same keys plus Select / Start on controllers | See menu / system controls below. |
| Menu         | Esc                              | Esc                         | Return to main menu “SELECT MODE”. |

The top UI bar in the web demo shows a quick reference for all of these actions around each player’s panel.

### Gamepad support

The web demo includes full gamepad support with sensible defaults:

- Left stick or D‑pad for movement.
- Standard SNES/Xbox‑style mapping:
  - Beam: A / Cross button.
  - Boom: B.
  - Mine: X / Y (depending on layout).
  - Shield: Y or shoulder buttons (L1/R1).
  - Boost: R1 (or another face/shoulder mapped in `input.js`).
- Start / Select buttons are used to start games and reset rounds/matches:
  - In main menu, pressing any gamepad button starts a game. Player 1 = gamepad 0, Player 2 = gamepad 1.
  - On Game Over or Round Over screens, Start/Select + Shield trigger next round or full reset, mirroring keyboard behavior.

All gamepad input is merged with keyboard for each player, so both can be used simultaneously.

### Mobile touch controls

For narrow viewports (mobile), the web demo activates a touch UI: 

- Virtual joystick on the left for movement (implemented via nipplejs).
- Touch buttons on the right for:
  - Shield (R).  
  - Boost (G).  
  - Beam (F).  
  - Boom (Space).  
  - Mine (E). 
- A “Start” button replaces keyboard/gamepad Start for beginning a match from the main menu.
- A small “SYSTEM MECHANICS” modal summarises Mines, Shield, Tap Beam, Hold Beam, Portals, and Glitch for quick reference. 

---

## Hardware (tabletop cabinet)

The target hardware is a compact, affordable tabletop arcade build using off‑the‑shelf components. 

Core components:

- Controller: Raspberry Pi Zero 2 W. 
- Display: P2.5 indoor HUB75 RGB LED matrix, 128×64 px (320 mm × 160 mm). 
- Interface: RGB Matrix Bonnet for Raspberry Pi (or equivalent HUB75 driver for 128×64).
- Power: 5 V 10 A power supply brick.
- Controls: Arcade buttons, gamepads, or USB controllers, depending on your cabinet design. 
- Audio: External USB sound card + speakers.

The LED matrix layout in the browser demo matches the logical resolution and aspect ratio used in the physical cabinet (configurable via `CONFIG` in `config.js`). 

A full Bill of Materials (BOM) is maintained in a separate Google Sheet referenced from this project.

---

## Installation and development

### Web version

- No build step is required for the browser demo; everything is pure HTML/CSS/JS.
- Main entry points:
  - `index.html` – layout, HUD, mobile controls, and canvas.
  - `style.css` – retro cabinet styling, dashboard, and responsive layout.x
  - `config.js` – game constants (grid size, energy costs, colors, etc.) and control mappings.
  - `main.js` – main loop, state transitions, sudden death, and round logic.
  - `mechanics.js`, `renderer.js`, `ai.js`, `grid.js`, `input.js`, `state.js`, `classes.js` – gameplay, visuals, AI, maze generation, input handling, and data structures. 

### Hardware version (LED matrix)

Hardware setup and deployment scripts for Raspberry Pi will be documented using the `rpi-rgb-led-matrix` library.

- Status: Coming Soon – current focus is on gameplay and browser demo polish. 
- The plan is to drive the same 128×64 logical framebuffer used in the browser to the physical HUB75 matrix. 
