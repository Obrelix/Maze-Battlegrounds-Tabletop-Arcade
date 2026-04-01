# pi/effects.py
# Particle system and camera shake, ported from docs/js/effects.js

import random
import math

from config import BASE_SPEED, MAX_SPEED, TRAIL_LENGTH


# ---------------------------------------------------------------------------
# Color ramp helper
# ---------------------------------------------------------------------------

def _ramp_color(life: float) -> tuple:
    """Return an (r, g, b) colour based on particle life fraction (0-1)."""
    if life > 0.75:
        return (255, 255, 255)   # white
    elif life > 0.5:
        return (255, 255, 0)     # yellow
    elif life > 0.25:
        return (255, 128, 0)     # orange
    else:
        return (80, 0, 0)        # dark red


# ---------------------------------------------------------------------------
# Particle spawners
# ---------------------------------------------------------------------------

def spawn_death_particles(state, player) -> None:
    """Spawn 30 particles at the player's position."""
    for _ in range(30):
        angle = random.uniform(0, math.pi * 2)
        speed = random.uniform(0.5, 2.5)
        state.particles.append({
            'x': player.x,
            'y': player.y,
            'vx': math.cos(angle) * speed,
            'vy': math.sin(angle) * speed,
            'life': 1.0,
            'decay': random.uniform(0.02, 0.05),
            'color': _ramp_color(1.0),
        })


def spawn_explosion_particles(state, x: float, y: float) -> None:
    """Spawn 30 radial particles at (x, y)."""
    for i in range(30):
        angle = (i / 30) * math.pi * 2 + random.uniform(-0.2, 0.2)
        speed = random.uniform(0.5, 3.0)
        state.particles.append({
            'x': x,
            'y': y,
            'vx': math.cos(angle) * speed,
            'vy': math.sin(angle) * speed,
            'life': 1.0,
            'decay': random.uniform(0.02, 0.06),
            'color': _ramp_color(1.0),
        })


def spawn_wall_hit_particles(state, x: float, y: float, vx: float, vy: float) -> None:
    """Spawn 1 particle when a projectile hits a wall."""
    state.particles.append({
        'x': x,
        'y': y,
        'vx': -vx * random.uniform(0.2, 0.6),
        'vy': -vy * random.uniform(0.2, 0.6),
        'life': 1.0,
        'decay': random.uniform(0.1, 0.2),
        'color': _ramp_color(1.0),
    })


def spawn_muzzle_flash_particles(state, x: float, y: float) -> None:
    """Spawn 10 particles for a muzzle flash."""
    for _ in range(10):
        angle = random.uniform(0, math.pi * 2)
        speed = random.uniform(0.3, 1.5)
        state.particles.append({
            'x': x,
            'y': y,
            'vx': math.cos(angle) * speed,
            'vy': math.sin(angle) * speed,
            'life': 1.0,
            'decay': random.uniform(0.08, 0.15),
            'color': _ramp_color(1.0),
        })


# ---------------------------------------------------------------------------
# Particle update
# ---------------------------------------------------------------------------

def update_particles(state) -> None:
    """
    Advance all particles one frame.

    - Move:   x += vx, y += vy
    - Friction: vx *= 0.85, vy *= 0.85
    - Decay:  life -= decay
    - Colour ramp applied each frame
    - Dead particles (life <= 0) are removed
    """
    alive = []
    for p in state.particles:
        p['x'] += p['vx']
        p['y'] += p['vy']
        p['vx'] *= 0.85
        p['vy'] *= 0.85
        p['life'] -= p['decay']
        if p['life'] > 0:
            p['color'] = _ramp_color(p['life'])
            alive.append(p)
    state.particles = alive


# ---------------------------------------------------------------------------
# Boost trail
# ---------------------------------------------------------------------------

def check_boost_trail(player) -> None:
    """
    Maintain the player's boost trail.

    - If the player is boosting (current_speed >= MAX_SPEED), append current
      position to trail and cap at TRAIL_LENGTH.
    - Otherwise clear the trail.
    """
    if player.current_speed >= MAX_SPEED:
        player.trail.append({'x': player.x, 'y': player.y})
        if len(player.trail) > TRAIL_LENGTH:
            player.trail = player.trail[-TRAIL_LENGTH:]
    else:
        player.trail = []


# ---------------------------------------------------------------------------
# Camera shake
# ---------------------------------------------------------------------------

def shake_camera(state, amount: float) -> None:
    """Trigger a camera shake of the given strength."""
    state.camera.shake(amount)
