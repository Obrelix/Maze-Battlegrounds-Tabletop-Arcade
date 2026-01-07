# 🕹️ Maze Battlegrounds: Tabletop Arcade (v2.5 - AI Update)

A DIY head-to-head tabletop arcade console powered by a **Raspberry Pi Zero 2 W** and a **P2.5 128x64 RGB LED Matrix**.

This repository contains the source code for the game *Maze Battleground*—a fast-paced tactical shooter designed specifically for low-resolution LED displays—along with the hardware specifications to build the physical machine.

**New in v2.5:** Now features a smart CPU opponent for single-player practice!

---

### 🌐 [**PLAY ONLINE DEMO**](https://obrelix.github.io/Maze-Battlegrounds-Tabletop-Arcade/)
*(Test the mechanics directly in your browser!)*

---

## 📖 About The Game

**Maze Battleground** is a top-down shooter designed for a digital tabletop experience. The goal is to be the first to reach **5 Points**.

Points are awarded for:
1.  **Reaching the Goal:** Navigating to the opponent's spawn zone.
2.  **Elimination:** Killing the opponent with a Mine, Explosion, or Charged Beam.

The battlefield is dynamic. Players can destroy walls, set traps, teleport, and utilize a new charging mechanic to break through defenses.

### Key Features
* **Two Game Modes:** Choose between **Single Player (vs CPU)** or **Multiplayer (PvP)** via the new start menu.
* **Smart AI:** The CPU opponent uses advanced pathfinding to dodge shots, avoid mines, use shields strategically, and aggressively hunt the player.
* **Destructible Environment:** Use mines or the **Charged Beam** to blast through walls and create shortcuts.
* **Tactical Physics:** Movement is momentum-based. Managing your **Boost Energy** is key to survival.
* **Tabletop HUD:** The interface is split and oriented for players sitting opposite each other.

## 🎮 Controls & Menu

The game now starts with a mode selection menu.

### Menu Navigation
| Key | Action |
| :---: | :--- |
| `1` | Start **Single Player** (vs CPU Hard) |
| `2` | Start **Multiplayer** (1v1) |
| `ESC` | Return to Main Menu at any time |

### Gameplay Controls

| Action | **Player 1 (Left/Blue)** | **Player 2 / CPU (Right/Pink)** | Description |
| :--- | :---: | :---: | :--- |
| **Move** | `W` `A` `S` `D` | `Arrow Keys` | Navigate the maze. |
| **Beam (Tap)** | `F` | `K` | Fires a quick beam. **Stuns** enemies (Slows them). Costs Energy. |
| **Beam (Hold)** | `F` (Hold 3s) | `K` (Hold 3s) | Charges a massive shot. **Breaks Walls & Kills**. Slows you while charging. |
| **Boost** | `G` | `L` | Hold to move faster. Drains Energy. |
| **Shield** | `R` | `I` | Blocks Stuns and Lethal damage. Drains Energy rapidly. |
| **Drop Mine** | `E` | `O` | Place a lethal mine. Max 4 mines. |
| **Detonate** | `SPACE` | `ENTER` | Explode all your active mines remotely. Costs Energy. |
| **Reset** | `R` | `R` | **Round Over:** Starts next round.<br>**Game Over:** Resets entire match. |

## 🧠 The "Aggressive" AI

The Single Player mode features a fully autonomous bot designed to mimic human play:
* **Pathfinding:** It calculates the shortest path to your base but will dynamically reroute if it detects mines in its way.
* **Battering Ram:** If the path is blocked by too many mines, it may activate its shield and intentionally detonate them to clear a path.
* **Self-Preservation:** It scans for incoming projectiles and will attempt to dodge sideways or pop its shield at the last second.
* **Stuck Detection:** If the AI gets stuck on geometry, it performs a "wiggle" maneuver to free itself.

## 🛠️ Hardware Bill of Materials (BOM)

This project is built using affordable, off-the-shelf components. You can view the [Full BOM Google Sheet here](https://docs.google.com/spreadsheets/d/12uv0eTk2EPSbfXsSc8Y3BzwX-76kk82TglhOV1aZT8A/edit?usp=sharing).

### Core Components
* **Controller:** Raspberry Pi Zero 2 W
* **Display:** P2.5 Indoor HUB75 RGB LED Matrix (128x64 px, 320mm x 160mm)
* **Interface:** RGB Matrix Bonnet for Raspberry Pi
* **Power:** 5V 10A Power Supply Brick
* **Controls:** Arcade Buttons or USB Controllers
* **Audio:** External USB Sound Card

## 🧩 Gameplay Mechanics

### 1. The Energy System
Your lifeblood. You have a single energy bar that recharges slowly. You must manage it between:
* **Boosting:** Sprinting to chase or escape.
* **Beams:** Firing offensive shots.
* **Shielding:** Blocking damage (Prevents death, but drains energy fast).
* **Detonating:** Triggering your traps manually.

### 2. Offensive Capabilities
* **Tap Beam (Stun):** A quick laser that slows the enemy to 80% speed for 6 seconds.
* **Charged Beam (Lethal):** Hold the beam button for 3 seconds. Your player slows down, flashes white, and releases a high-velocity projectile that destroys walls and instantly kills the opponent.
* **Mines:** You start with **4 Mines**. Stealing or stepping on a mine causes a massive explosion. This destroys nearby walls and kills anyone caught in the blast radius.

### 3. Pickups & Environment
* **Ammo Crates:** Green boxes spawn randomly on the map. Collecting one refills your mine inventory to max (4).
* **Portals:** Two teleporters spawn on the map (Orange/Blue). Entering one instantly moves you to the other, but be careful—entering a portal has a 30% chance to **Glitch** your controls (invert them) for a few seconds.

---

## 🚀 Installation (Web Version)

To run the game locally on your computer:
1.  Clone this repository.
2.  Open `index.html` in any modern web browser.

## 📟 Installation (Hardware Version)
*(Coming Soon: Instructions for setting up the Raspberry Pi environment using rpi-rgb-led-matrix library)*2.  Open `index.html` in any modern web browser.

## 📟 Installation (Hardware Version)
*(Coming Soon: Instructions for setting up the Raspberry Pi environment using rpi-rgb-led-matrix library)*
