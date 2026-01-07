# 🕹️ Maze Battlegrounds: Tabletop Arcade (v2.0)

A DIY head-to-head tabletop arcade console powered by a **Raspberry Pi Zero 2 W** and a **P2.5 128x64 RGB LED Matrix**.

This repository contains the source code for the game *Maze Battleground*—a fast-paced tactical shooter designed specifically for low-resolution LED displays—along with the hardware specifications to build the physical machine.

---

### 🌐 [**PLAY ONLINE DEMO**](https://obrelix.github.io/Maze-Battlegrounds-Tabletop-Arcade/)
*(Test the mechanics directly in your browser!)*

---

## 📖 About The Game

**Maze Battleground v2.0** is a 1v1 top-down shooter where two players face each other on a digital table. The goal is to be the first to reach **5 Points**.

Points are awarded for:
1.  **Reaching the Goal:** Navigating to the opponent's spawn zone.
2.  **Elimination:** Killing the opponent with a Mine, Explosion, or Charged Beam.

The battlefield is dynamic. Players can destroy walls, set traps, teleport, and utilize a new charging mechanic to break through defenses.

### Key Features
* **Tabletop Mode:** The HUD is split and oriented for players sitting opposite each other.
* **Destructible Environment:** Use mines or the **Charged Beam** to blast through walls and create shortcuts.
* **Tactical Physics:** Movement is momentum-based. Managing your **Boost Energy** is key to survival.
* **Unstable Portals:** Teleporters allow instant travel, but have a chance to **Glitch**, inverting your controls for a short duration.

## 🎮 Controls (v2.0 Update)

The controls have been refactored for better ergonomics.

| Action | **Player 1 (Left/Blue)** | **Player 2 (Right/Pink)** | Description |
| :--- | :---: | :---: | :--- |
| **Move** | `W` `A` `S` `D` | `Arrow Keys` | Navigate the maze. |
| **Beam (Tap)** | `F` | `K` | Fires a quick beam. **Stuns** enemies (Slows them). Costs Energy. |
| **Beam (Hold)** | `F` (Hold 3s) | `K` (Hold 3s) | Charges a massive shot. **Breaks Walls & Kills**. Slows you while charging. |
| **Boost** | `G` | `L` | Hold to move faster. Drains Energy. |
| **Shield** | `R` | `I` | Blocks Stuns and Lethal damage. Drains Energy rapidly. |
| **Drop Mine** | `E` | `O` | Place a lethal mine. Max 4 mines. |
| **Detonate** | `SPACE` | `ENTER` | Explode all your active mines remotely. Costs Energy. |
| **Reset** | `R` (On Game Over) | `R` (On Game Over) | Reset the round/game. |

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

### 3. Pickups
* **Ammo Crates:** Green boxes spawn randomly on the map. Collecting one refills your mine inventory to max (4).

---

## 🚀 Installation (Web Version)

To run the game locally on your computer:
1.  Clone this repository.
2.  Open `index.html` in any modern web browser.

## 📟 Installation (Hardware Version)
*(Coming Soon: Instructions for setting up the Raspberry Pi environment using rpi-rgb-led-matrix library)*
