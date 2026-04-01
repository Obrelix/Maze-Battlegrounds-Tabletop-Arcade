# pi/ai/combat.py
# Combat decision helpers ported from docs/js/ai/combat.js

import math
import random
from collections import deque

from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X
from grid import grid_index, is_wall


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_beam_visited = bytearray(COLS * ROWS)
_beam_dist = [0] * (COLS * ROWS)

def _check_beam_path(maze: list, player, opponent) -> dict:
    """
    Fast BFS check for a valid beam path between player and opponent cells.
    Returns {'has_path': bool, 'path_length': int}.
    """
    if not maze:
        return {'has_path': False, 'path_length': float('inf')}

    sc = int((player.x - MAZE_OFFSET_X + 1) // CELL_SIZE)
    sr = int((player.y + 1) // CELL_SIZE)
    size = getattr(opponent, 'size', 2.0)
    ec = int((opponent.x + size / 2 - MAZE_OFFSET_X) // CELL_SIZE)
    er = int((opponent.y + size / 2) // CELL_SIZE)

    sc = max(0, min(sc, COLS - 1))
    sr = max(0, min(sr, ROWS - 1))
    ec = max(0, min(ec, COLS - 1))
    er = max(0, min(er, ROWS - 1))

    si = sc + sr * COLS
    ei = ec + er * COLS

    if si == ei:
        return {'has_path': True, 'path_length': 0}

    visited = _beam_visited
    dist = _beam_dist
    total = COLS * ROWS
    for i in range(total):
        visited[i] = 0

    visited[si] = 1
    dist[si] = 0
    queue = deque()
    queue.append(si)

    directions = ((0, -1, 0), (1, 0, 1), (0, 1, 2), (-1, 0, 3))

    while queue:
        ci = queue.popleft()
        if ci == ei:
            return {'has_path': True, 'path_length': dist[ci]}

        cell = maze[ci]
        cc, cr = cell.c, cell.r
        d = dist[ci] + 1

        for dc, dr, wi in directions:
            nc, nr = cc + dc, cr + dr
            if nc < 0 or nc >= COLS or nr < 0 or nr >= ROWS:
                continue
            ni = nc + nr * COLS
            if visited[ni]:
                continue
            if cell.walls[wi]:
                continue
            if maze[ni].walls[(wi + 2) & 3]:
                continue
            visited[ni] = 1
            dist[ni] = d
            queue.append(ni)

    return {'has_path': False, 'path_length': float('inf')}


def _find_chokepoints(maze: list, near_pos: dict, radius: int) -> list:
    """
    Find cells with limited exits (chokepoints) near near_pos.
    Returns list of dicts sorted by tactical value.
    """
    radius = min(radius, 5)
    chokepoints = []
    center_c = int((near_pos['x'] - MAZE_OFFSET_X) // CELL_SIZE)
    center_r = int(near_pos['y'] // CELL_SIZE)

    for dc in range(-radius, radius + 1):
        for dr in range(-radius, radius + 1):
            c = center_c + dc
            r = center_r + dr
            if c < 0 or c >= COLS or r < 0 or r >= ROWS:
                continue
            cell = maze[c + r * COLS]
            if cell is None:
                continue

            open_passages = sum(1 for w in cell.walls if not w)

            if 1 <= open_passages <= 2:
                dist_from_center = math.hypot(dc, dr)
                cp = {
                    'cell': cell,
                    'x': MAZE_OFFSET_X + c * CELL_SIZE + CELL_SIZE / 2,
                    'y': r * CELL_SIZE + CELL_SIZE / 2,
                    'passages': open_passages,
                    'distance': dist_from_center,
                    'value': (radius - dist_from_center) * (3 - open_passages),
                }
                chokepoints.append(cp)
                if len(chokepoints) >= 5:
                    chokepoints.sort(key=lambda cp_: cp_['value'], reverse=True)
                    return chokepoints

    chokepoints.sort(key=lambda cp_: cp_['value'], reverse=True)
    return chokepoints


def _is_mine_area_crowded(maze_mines: list, x: float, y: float,
                          player=None, min_distance: int = 2, max_nearby: int = 1) -> bool:
    """Check if placing a mine at (x, y) would cause clustering."""
    min_dist_px = min_distance * CELL_SIZE
    nearby = 0

    for mine in maze_mines:
        if math.hypot(mine['x'] - x, mine['y'] - y) < min_dist_px:
            nearby += 1
            if nearby > max_nearby:
                return True

    if player is not None:
        history = getattr(player, 'mine_placement_history', [])
        for placement in history:
            if math.hypot(placement['x'] - x, placement['y'] - y) < min_dist_px * 1.5:
                nearby += 1
                if nearby > max_nearby:
                    return True

    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_opponent_aiming_at_me(maze: list, player, opponent) -> dict:
    """
    Check if opponent has a beam path to the player.
    Returns {'danger': bool, 'direction': str|None, 'urgency': float}.
    Mirrors JS isOpponentAimingAtMe().
    """
    if opponent.boost_energy < 30:
        return {'danger': False, 'direction': None, 'urgency': 0}

    result = _check_beam_path(maze, opponent, player)
    if not result['has_path']:
        return {'danger': False, 'direction': None, 'urgency': 0}

    size = getattr(player, 'size', 2.0)
    opp_size = getattr(opponent, 'size', 2.0)
    p_cx = player.x + size / 2
    p_cy = player.y + size / 2
    o_cx = opponent.x + opp_size / 2
    o_cy = opponent.y + opp_size / 2

    dx = p_cx - o_cx
    dy = p_cy - o_cy
    if abs(dx) > abs(dy):
        direction = 'right' if dx > 0 else 'left'
    else:
        direction = 'down' if dy > 0 else 'up'

    path_len = result['path_length']
    urgency = max(0.0, 1.0 - (path_len - 1) / 6.0)

    return {'danger': True, 'direction': direction, 'urgency': urgency}


def get_dodge_direction(threat_direction: str, player=None, wall_aware: bool = False) -> dict:
    """
    Return {dx, dy} perpendicular dodge vector for the given threat direction.
    Mirrors JS getDodgeDirection().
    """
    if threat_direction in ('left', 'right'):
        option1 = {'dx': 0, 'dy': -1}
        option2 = {'dx': 0, 'dy': 1}
    elif threat_direction in ('up', 'down'):
        option1 = {'dx': -1, 'dy': 0}
        option2 = {'dx': 1, 'dy': 0}
    else:
        return {'dx': 0, 'dy': 0}

    if not wall_aware or player is None:
        return option1 if random.random() < 0.5 else option2

    check_dist = 4
    size = getattr(player, 'size', 2.0)
    cx = player.x + size / 2
    cy = player.y + size / 2

    # We need maze reference — skip wall check when not available
    try:
        from state import get_state  # type: ignore
        maze = get_state().maze
        wall1 = is_wall(maze, cx + option1['dx'] * check_dist, cy + option1['dy'] * check_dist)
        wall2 = is_wall(maze, cx + option2['dx'] * check_dist, cy + option2['dy'] * check_dist)
        if wall1 and not wall2:
            return option2
        if not wall1 and wall2:
            return option1
    except Exception:
        pass

    return option1 if random.random() < 0.5 else option2


def should_charge_beam(maze: list, player, opponent, current_config: dict) -> bool:
    """
    Return True if AI should charge beam at opponent.
    Mirrors JS shouldChargeBeam().
    """
    if not current_config.get('TACTICAL_CHARGING_ENABLED'):
        return should_fire_beam_basic(maze, player, opponent, False, None, current_config)

    if getattr(opponent, 'shield_active', False):
        return False

    if player.boost_energy < current_config.get('MIN_CHARGE_ENERGY', 65):
        return False

    result = _check_beam_path(maze, player, opponent)
    if not result['has_path']:
        return False

    path_len = result['path_length']

    # Check if opponent is glitched
    try:
        from state import get_state  # type: ignore
        frame = get_state().frame_count
        if opponent.glitch_remaining(frame) > 60:
            return path_len <= 6
    except Exception:
        pass

    return path_len <= 4


def should_fire_beam_basic(maze: list, player, opponent,
                            use_distance_check: bool = False,
                            opponent_prediction=None,
                            current_config: dict = None) -> bool:
    """
    Return True if AI should fire a basic beam at opponent.
    Mirrors JS shouldFireBeamBasic().
    """
    if getattr(opponent, 'shield_active', False):
        return False

    is_insane = (current_config or {}).get('NAME') == 'INSANE'
    result = _check_beam_path(maze, player, opponent)

    if not result['has_path']:
        return False

    path_len = result['path_length']

    if is_insane:
        if path_len <= 3:
            return True
        if path_len <= 6 and player.boost_energy > 50:
            return True
        if path_len <= 10 and player.boost_energy > 70:
            return True
        return False

    # Non-INSANE
    if opponent_prediction and opponent_prediction.get('shieldProbability', 0) > 0.3:
        if random.random() < 0.4:
            return False

    if use_distance_check:
        if path_len <= 2:
            fire_chance = 1.0
        elif path_len <= 4:
            fire_chance = 0.8
        elif path_len <= 6:
            fire_chance = 0.5
        else:
            fire_chance = 0.2
        return random.random() < fire_chance

    return path_len <= 8


def should_detonate_nearby_mines(mines: list, player, opponent) -> bool:
    """
    Return True if AI should detonate mines close to the opponent.
    Mirrors JS shouldDetonateNearbyMines().
    """
    if not mines:
        return False

    for mine in mines:
        owner = mine.get('owner', -1)
        if owner not in (player.id, -1):
            continue
        dist_opp = math.hypot(mine['x'] - opponent.x, mine['y'] - opponent.y)
        dist_self = math.hypot(mine['x'] - player.x, mine['y'] - player.y)
        if dist_opp < 6 and dist_self > 5:
            return player.boost_energy > 20

    return False


def calculate_mine_position(maze: list, player, opponent, current_config: dict) -> dict:
    """
    Calculate a strategic mine placement position.
    Returns {'x': float, 'y': float}.
    Mirrors JS calculateAdvancedMinePositions().
    """
    if not current_config.get('ADVANCED_MINING_ENABLED'):
        if maze:
            cell = maze[int(random.random() * len(maze))]
            return {
                'x': MAZE_OFFSET_X + cell.c * CELL_SIZE + CELL_SIZE / 2,
                'y': cell.r * CELL_SIZE + CELL_SIZE / 2,
            }
        return {'x': player.x, 'y': player.y}

    mine_strategy = current_config.get('MINE_STRATEGY', 'BALANCED')
    check_density = current_config.get('MINE_DENSITY_CHECK', False)
    mines = []
    try:
        from state import get_state  # type: ignore
        mines = get_state().mines
    except Exception:
        pass

    opp_goal_x = MAZE_OFFSET_X + opponent.goal_c * CELL_SIZE + CELL_SIZE / 2
    opp_goal_y = opponent.goal_r * CELL_SIZE + CELL_SIZE / 2

    if mine_strategy in ('AGGRESSIVE', 'BALANCED'):
        midpoint = {
            'x': (opponent.x + opp_goal_x) / 2,
            'y': (opponent.y + opp_goal_y) / 2,
        }
        chokepoints = _find_chokepoints(maze, midpoint, 5)

        if chokepoints and random.random() < 0.6:
            valid = chokepoints
            if check_density:
                valid = [cp for cp in chokepoints
                         if not _is_mine_area_crowded(mines, cp['x'], cp['y'], player)]
            if valid:
                pick = valid[int(random.random() * min(3, len(valid)))]
                return {'x': pick['x'], 'y': pick['y']}

    if mine_strategy == 'DEFENSIVE':
        our_goal_x = MAZE_OFFSET_X + player.goal_c * CELL_SIZE + CELL_SIZE / 2
        our_goal_y = player.goal_r * CELL_SIZE + CELL_SIZE / 2
        goal_cps = _find_chokepoints(maze, {'x': our_goal_x, 'y': our_goal_y}, 5)
        if goal_cps and random.random() < 0.7:
            pick = goal_cps[int(random.random() * min(3, len(goal_cps)))]
            return {'x': pick['x'], 'y': pick['y']}
        angle = random.random() * math.pi * 2
        dist_from_goal = CELL_SIZE * 2.5 + random.random() * CELL_SIZE * 0.5
        return {
            'x': our_goal_x + math.cos(angle) * dist_from_goal,
            'y': our_goal_y + math.sin(angle) * dist_from_goal,
        }

    if mine_strategy == 'AGGRESSIVE':
        dir_x = opp_goal_x - opponent.x
        dir_y = opp_goal_y - opponent.y
        dist = math.hypot(dir_x, dir_y)
        if dist > 0.1:
            intercept_dist = CELL_SIZE * (3 + random.random() * 3)
            return {
                'x': opponent.x + (dir_x / dist) * intercept_dist,
                'y': opponent.y + (dir_y / dist) * intercept_dist,
            }

    # BALANCED fallback
    roll = random.random()
    if roll < 0.5:
        dir_x = opp_goal_x - opponent.x
        dir_y = opp_goal_y - opponent.y
        dist = math.hypot(dir_x, dir_y)
        if dist > 0.1:
            intercept_dist = CELL_SIZE * (3 + random.random() * 3)
            return {
                'x': opponent.x + (dir_x / dist) * intercept_dist,
                'y': opponent.y + (dir_y / dist) * intercept_dist,
            }
    elif roll < 0.8:
        mid_x = (player.x + opponent.x) / 2
        mid_y = (player.y + opponent.y) / 2
        cps = _find_chokepoints(maze, {'x': mid_x, 'y': mid_y}, 5)
        if cps:
            pick = cps[int(random.random() * min(3, len(cps)))]
            return {'x': pick['x'], 'y': pick['y']}

    # DEFENSIVE fallback
    our_goal_x = MAZE_OFFSET_X + player.goal_c * CELL_SIZE + CELL_SIZE / 2
    our_goal_y = player.goal_r * CELL_SIZE + CELL_SIZE / 2
    angle = random.random() * math.pi * 2
    dist_from_goal = CELL_SIZE * 2.5 + random.random() * CELL_SIZE * 0.5
    return {
        'x': our_goal_x + math.cos(angle) * dist_from_goal,
        'y': our_goal_y + math.sin(angle) * dist_from_goal,
    }


def record_mine_placement(player, x: float, y: float, frame_count: int) -> None:
    """Record mine placement in player history for density tracking."""
    if not hasattr(player, 'mine_placement_history') or player.mine_placement_history is None:
        player.mine_placement_history = []
    player.mine_placement_history.append({'x': x, 'y': y, 'frame': frame_count})
    if len(player.mine_placement_history) > 10:
        player.mine_placement_history.pop(0)
