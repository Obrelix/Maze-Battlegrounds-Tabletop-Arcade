# pi/state.py
# Central game state management ported from docs/js/state.js

import os
import json
import random

from config import (
    COLORS, TIMING, GAME_TIME, INPUT_DELAY,
)
from classes import Camera, Player

HIGHSCORE_PATH = os.path.join(os.path.dirname(__file__), 'highscores.json')

_DEFAULT_HIGH_SCORES = [
    {'name': 'ZEU', 'win_color': '#aa00ffff', 'opp_color': '#ff0000ff', 'score': 10, 'opp_score': 6, 'opponent': 'CPU-INSANE', 'multiplier': 1},
    {'name': 'ARE', 'win_color': '#ffffffff', 'opp_color': '#ff5100ff', 'score': 8, 'opp_score': 5, 'opponent': 'CPU-HARD', 'multiplier': 0.8},
    {'name': 'HER', 'win_color': '#00aaffff', 'opp_color': '#ffff00ff', 'score': 8, 'opp_score': 5, 'opponent': 'CPU-INTERME', 'multiplier': 0.4},
]


def _load_high_scores():
    """Load high scores from JSON file, returning defaults on failure."""
    try:
        if os.path.exists(HIGHSCORE_PATH):
            with open(HIGHSCORE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception as e:
        print(f'[state] Failed to load high scores: {e}')
    return list(_DEFAULT_HIGH_SCORES)


def save_high_scores(state):
    """Persist high scores to JSON file."""
    try:
        with open(HIGHSCORE_PATH, 'w', encoding='utf-8') as f:
            json.dump(state.high_scores, f, indent=2)
    except Exception as e:
        print(f'[state] Failed to save high scores: {e}')


def sudden_death_is_active(state):
    """Return True if game time is at or below the sudden-death threshold."""
    if state.game_time:
        return state.game_time <= TIMING.SUDDEN_DEATH_TIME
    return False


def should_spawn_ammo_crate(state):
    """Return True if it's time to spawn a new ammo crate."""
    if state.game_time and not state.ammo_crate:
        return state.frame_count - state.ammo_last_take_time >= TIMING.AMMO_RESPAWN_DELAY
    return False


def get_two_player_colors():
    """Return two random distinct, non-BLACK, non-WHITE Color objects."""
    excluded = {'BLACK', 'WHITE'}
    available = [c for c in COLORS if c.name not in excluded]
    p1_color = random.choice(available)
    rest = [c for c in available if c is not p1_color]
    p2_color = random.choice(rest)
    return [p1_color, p2_color]


def reset_state_for_match(state, p1_color_idx=None, p2_color_idx=None):
    """Reset game state for a new match, preserving player names and scores."""
    excluded = {'BLACK', 'ORANGE', 'BLUE', 'RED', 'PURPLE'}
    available = [c for c in COLORS if c.name not in excluded]

    # Determine P1 colour
    if p1_color_idx is not None:
        p1_color = COLORS[p1_color_idx]
    elif state.players[0] and state.players[0].color:
        p1_color = state.players[0].color
    else:
        p1_color = random.choice(available)

    avail2 = [c for c in available if c is not p1_color]

    # Determine P2 colour
    if p2_color_idx is not None:
        p2_color = COLORS[p2_color_idx]
    elif state.players[1] and state.players[1].color:
        p2_color = state.players[1].color
    else:
        p2_color = random.choice(avail2) if avail2 else available[0]

    # Preserve names
    p1_name = state.players[0].name if state.players[0] else 'CPU'
    p2_name = state.players[1].name if (state.game_mode == 'MULTI' and state.players[1]) else 'CPU'

    new_p1 = Player(0, name=p1_name, color=p1_color)
    new_p2 = Player(1, name=p2_name, color=p2_color)

    state.players = [new_p1, new_p2]
    state.frame_count = 0
    state.is_game_over = False
    state.is_round_over = False
    state.maze = []
    state.mines = []
    state.particles = []
    state.portals = []
    state.projectiles = []
    state.ammo_crate = None
    state.ammo_last_take_time = -999
    state.game_time = GAME_TIME
    state.max_game_time = GAME_TIME
    state.death_timer = 0
    state.victim_idx = -1
    state.is_paused = False
    state.is_draw = False
    state.pause_menu_selection = 0
    state.portal_reverse_colors = False
    state.scroll_x = 0
    state.messages = {
        'death_reason': '',
        'win': '',
        'taunt': '',
        'round': '',
        'win_color': None,
        'round_color': None,
    }


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

        # High scores (loaded from JSON file)
        self.high_scores = _load_high_scores()

        # Screen state
        self.screen = 'MENU'
        self.game_mode = 'SINGLE'
        self.is_attract_mode = False
        self.demo_reset_timer = 0
        self.difficulty = 'INTERMEDIATE'
        self.menu_selection = 0
        self.pause_menu_selection = 0
        self.high_score_tab = 0
        self.input_delay = INPUT_DELAY

        # Player setup
        self.player_setup = {
            'active_player': 0,
            'difficulty_idx': 1,
            'color_idx': 0,
            'name_char_idx': 0,
            'name_chars': [ord('A'), ord('A'), ord('A')],
            'phase': 'DIFFICULTY',
            'is_done': False,
        }

        # Input state
        self.gamepad_state = {0: {}, 1: {}}
        self.keyboard_state = {}
        self.running = True
