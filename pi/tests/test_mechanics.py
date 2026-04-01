# pi/tests/test_mechanics.py
import math
from mechanics import check_player_collision, handle_movement, handle_shield, resolve_round
from grid import init_maze
from state import GameState
from classes import Player
from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, MAX_ENERGY, ENERGY_COSTS, COLLISION, MAX_SCORE, COLORS


def _setup():
    state = GameState()
    maze, portals, gt, mgt = init_maze(seed=42)
    state.maze = maze
    state.portals = portals
    state.game_time = gt
    state.max_game_time = mgt
    state.players = [Player(0, 'P-1', COLORS[0]), Player(1, 'P-2', COLORS[1])]
    state.players[0].x = MAZE_OFFSET_X + 1 * CELL_SIZE + 1
    state.players[0].y = 1 * CELL_SIZE + 1
    state.players[1].x = MAZE_OFFSET_X + (COLS - 2) * CELL_SIZE + 1
    state.players[1].y = (ROWS - 2) * CELL_SIZE + 1
    return state


def test_collision_with_boundary():
    state = _setup()
    p = state.players[0]
    p.x = MAZE_OFFSET_X + 0.5
    p.y = 1 * CELL_SIZE + 1
    assert check_player_collision(state.maze, p, -5, 0)


def test_movement_updates_position():
    state = _setup()
    p = state.players[0]
    inp = {'up': False, 'down': False, 'left': False, 'right': True,
           'shield': False, 'beam': False, 'mine': False, 'boost': False,
           'boom': False, 'start': False}
    handle_movement(state, p, inp)
    assert isinstance(p.x, float)


def test_shield_drains_energy():
    state = _setup()
    p = state.players[0]
    initial = p.boost_energy
    handle_shield(p, {'shield': True})
    assert p.shield_active
    assert p.boost_energy < initial


def test_resolve_round_goal():
    state = _setup()
    state.players[0].goal_c = COLS - 1
    state.players[0].goal_r = ROWS - 1
    resolve_round(state, 0, 'GOAL')
    assert state.is_round_over
    assert state.players[0].score == 1


def test_resolve_round_game_over():
    state = _setup()
    state.players[0].score = MAX_SCORE - 1
    resolve_round(state, 0, 'GOAL')
    assert state.is_game_over
    assert state.players[0].score == MAX_SCORE
