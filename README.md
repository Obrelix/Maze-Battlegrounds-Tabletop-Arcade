# 🕹️ Maze Battlegrounds: Tabletop Arcade

A DIY head-to-head tabletop arcade console powered by a **Raspberry Pi Zero 2 W** and a **P2.5 128x64 RGB LED Matrix**. 

This repository contains the source code for the game *Maze Battleground*—a fast-paced tactical shooter designed specifically for low-resolution LED displays—along with the hardware specifications to build the physical machine.

---

### 🌐 [**PLAY ONLINE DEMO**](https://obrelix.github.io/Maze-Battlegrounds-Tabletop-Arcade/)
*(Test the mechanics directly in your browser!)*

---

## 📖 About The Game

**Maze Battleground** is a 1v1 top-down shooter where two players face each other on opposite ends of a digital table. The goal is simple: **Score 5 Points** by reaching the enemy's spawn zone.

However, the battlefield is dynamic. Players can destroy walls, set traps, teleport, and stun enemies using a limited energy supply.

### Key Features
* **Tabletop Mode:** The UI is mirrored and rotated so players sitting opposite each other have their own dedicated HUD.
* **Destructible Environment:** Use mines to blast through walls and create your own shortcuts.
* **Tactical Physics:** Movement is momentum-based. Managing your **Boost Energy** is key to survival.
* **Unstable Portals:** Teleporters allow instant travel across the map, but beware—they have a **30% chance to glitch**, inverting your controls for 3 seconds!

## 🎮 Controls

The game is designed for a physical arcade table with 6 buttons per player, but it is fully playable on a keyboard.

| Action | **Player 1 (Left Side)** | **Player 2 (Right Side)** | Description |
| :--- | :---: | :---: | :--- |
| **Move** | `W` `A` `S` `D` | `Arrow Keys` | Navigate the maze. |
| **Beam** | `F` | `K` | Fire a long-range laser. **Stuns** enemies but costs **20% Energy**. |
| **Boost** | `G` | `L` | Hold to move 3x faster. Drains Energy. |
| **Shield** | `V` | `B` | Hold to become invulnerable. Drains Energy very fast (1.5x). |
| **Drop Mine** | `H` | `M` | Place a mine. Max 5 mines. |
| **Detonate** | `J` | `N` | Explode all your active mines remotely. Costs **30% Energy**. |
| **Reset** | `R` | `R` | Reset the round/game (when Game Over). |

## 🛠️ Hardware Bill of Materials (BOM)

This project is built using affordable, off-the-shelf components. You can view the [Full BOM Google Sheet here](https://docs.google.com/spreadsheets/d/12uv0eTk2EPSbfXsSc8Y3BzwX-76kk82TglhOV1aZT8A/edit?usp=sharing).

### Core Components 
* **Controller:** Raspberry Pi Zero 2 W
* **Display:** P2.5 Indoor HUB75 RGB LED Matrix (128x64 px, 320mm x 160mm)
* **Interface:** RGB Matrix Bonnet for Raspberry Pi
* **Power:** 5V 10A Power Supply Brick
* **Controls:** 2x Wired USB Controllers (SNES Style)
* **Audio:** External USB Sound Card (7.1 Adapter)

## 🧩 Gameplay Mechanics

### 1. The Energy System
Your lifeblood. You have a single energy bar that recharges slowly (0.4x rate). You must manage it between:
* **Sprinting** (Chasing/Escaping)
* **Shooting** (Stunning the enemy)
* **Shielding** (Blocking damage)
* **Detonating** (Triggering traps)

### 2. Destruction & Ammo
* You start with **5 Mines**.
* Mines do **not** regenerate over time.
* **Ammo Crates** (Green Boxes) spawn randomly on the map every 5 seconds (if not already present). Collecting one fully refills your mines.

### 3. Combat
* **Beams:** If you hit an enemy, they are **STUNNED** for 6 seconds. A stunned player moves at 80% speed and cannot use Boost or Shield.
* **Mines:** Stealing a mine causes a massive explosion. This destroys nearby walls (opening paths) and stuns anyone caught in the blast.

---

## 🚀 Installation (Web Version)

To run the game locally on your computer:
1.  Clone this repository.
2.  Open `index.html` in any modern web browser.

## 📟 Installation (Hardware Version)
*(Coming Soon: Instructions for setting up the Raspberry Pi environment using rpi-rgb-led-matrix library)*
