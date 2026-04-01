# pi/tests/test_effects.py
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from effects import spawn_explosion_particles, update_particles, check_boost_trail
from state import GameState
from classes import Player
from config import MAX_ENERGY, BASE_SPEED, MAX_SPEED


def test_spawn_explosion_particles():
    state = GameState()
    spawn_explosion_particles(state, 10, 20)
    assert len(state.particles) == 30


def test_update_particles_decay():
    state = GameState()
    state.particles = [{'x': 0, 'y': 0, 'vx': 1, 'vy': 0, 'life': 0.1, 'decay': 0.2, 'color': (255, 255, 255)}]
    update_particles(state)
    assert len(state.particles) == 0


def test_update_particles_movement():
    state = GameState()
    state.particles = [{'x': 0, 'y': 0, 'vx': 10, 'vy': 5, 'life': 1.0, 'decay': 0.01, 'color': (255, 255, 255)}]
    update_particles(state)
    assert state.particles[0]['x'] == 10
    assert state.particles[0]['vx'] == 10 * 0.85


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
