# pi/ai/controller.py
# CPU AI orchestrator, ported from docs/js/ai/controller.js

import math
import random

from config import BASE_SPEED, CELL_SIZE, MAZE_OFFSET_X, TIMING
from grid import is_wall

from .difficulty import get_active_config, adjust_difficulty_dynamically, get_energy_strategy
from .pathfinding import find_path_to_target, is_player_stuck, get_unstuck_direction
from .strategy import decide_strategy, should_execute_combo
from .combat import (
    is_opponent_aiming_at_me, get_dodge_direction,
    should_charge_beam, should_fire_beam_basic,
    should_detonate_nearby_mines, calculate_mine_position, record_mine_placement,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_aligned_with_opponent(player, opponent) -> bool:
    size = getattr(player, 'size', 2.0)
    opp_size = getattr(opponent, 'size', 2.0)
    dx = abs((player.x + size / 2) - (opponent.x + opp_size / 2))
    dy = abs((player.y + size / 2) - (opponent.y + opp_size / 2))
    return dx < 3 or dy < 3


def _track_opponent_behavior(player, opponent) -> None:
    """Maintain a lightweight opponent behavior profile on the player object."""
    if not hasattr(player, 'opponent_profile') or player.opponent_profile is None:
        player.opponent_profile = {
            'beams_fired': 0,
            'beams_hit': 0,
            'shield_usage': 0,
            'boost_usage': 0,
            'avg_distance_kept': 0,
            'distance_samples': 0,
            'favored_direction': None,
            'direction_counts': {'up': 0, 'down': 0, 'left': 0, 'right': 0},
            'last_beam_frame': 0,
        }

    profile = player.opponent_profile
    dist = math.hypot(opponent.x - player.x, opponent.y - player.y)
    n = profile['distance_samples']
    profile['avg_distance_kept'] = (profile['avg_distance_kept'] * n + dist) / (n + 1)
    profile['distance_samples'] += 1

    last_dir = getattr(opponent, 'last_dir', None)
    if last_dir:
        ldx = last_dir.get('x', 0)
        ldy = last_dir.get('y', 0)
        if abs(ldx) > abs(ldy):
            if ldx > 0:
                profile['direction_counts']['right'] += 1
            else:
                profile['direction_counts']['left'] += 1
        elif abs(ldy) > 0:
            if ldy > 0:
                profile['direction_counts']['down'] += 1
            else:
                profile['direction_counts']['up'] += 1

        counts = profile['direction_counts']
        max_dir = max(counts, key=lambda k: counts[k])
        if counts[max_dir] > 20:
            profile['favored_direction'] = max_dir

    if getattr(opponent, 'shield_active', False):
        profile['shield_usage'] += 1


def _get_opponent_prediction(player, opponent):
    """Return opponent prediction data or None if insufficient data."""
    profile = getattr(player, 'opponent_profile', None)
    if not profile or profile['distance_samples'] < 30:
        return None
    return {
        'preferredDirection': profile['favored_direction'],
        'preferredDistance': profile['avg_distance_kept'],
        'shieldProbability': profile['shield_usage'] / profile['distance_samples'],
        'directionWeights': profile['direction_counts'],
    }


def _validate_combo_conditions(combo: dict, player, opponent, state) -> bool:
    """Check if combo conditions still hold mid-combo."""
    if not combo or not combo.get('type'):
        return False
    fc = state.frame_count
    stun_time = opponent.stun_remaining(fc)
    glitch_time = opponent.glitch_remaining(fc)
    dist = math.hypot(player.x - opponent.x, player.y - opponent.y)
    ctype = combo['type']

    if ctype in ('STUN_EXECUTE_CLOSE', 'STUN_EXECUTE_FIRE', 'STUN_CHARGE'):
        return stun_time > 10
    if ctype in ('GLITCH_HUNT', 'GLITCH_APPROACH', 'GLITCH_EXECUTE'):
        return glitch_time > 30
    if ctype == 'BOOST_HUNT':
        return dist > 15
    if ctype == 'SHIELD_BAIT':
        return dist < 12 and player.boost_energy > 10
    return True


def _should_activate_shield(player, opponent, current_config: dict, context: dict = None) -> bool:
    """Unified shield decision (mirrors JS shouldActivateShield)."""
    if context is None:
        context = {}
    if player.boost_energy < 15:
        return False

    threat = context.get('threat_assessment') or {}
    danger_level = context.get('danger_level', 0)
    nearby_mines = context.get('nearby_mines', [])
    name = current_config.get('NAME')

    if name == 'INSANE':
        if threat.get('danger') and threat.get('urgency', 0) > 0.3:
            return True
        if nearby_mines:
            closest_dist = min(m['dist'] for m in nearby_mines)
            if closest_dist < 6:
                return True
        if danger_level > 0.5:
            return True
        opp_size = getattr(opponent, 'size', 2.0)
        dist = math.hypot(opponent.x - player.x, opponent.y - player.y)
        if dist < 12 and opponent.boost_energy > 35:
            return True
        return False

    # Non-INSANE
    if threat.get('danger') and threat.get('urgency', 0) > 0.7:
        return True
    if danger_level > 2.5 and player.boost_energy > 20:
        return True

    if name == 'HARD':
        size = getattr(player, 'size', 2.0)
        opp_size = getattr(opponent, 'size', 2.0)
        dist = math.hypot(opponent.x - player.x, opponent.y - player.y)
        if opponent.boost_energy >= 30 and dist < 20 and player.boost_energy > 20:
            dx = abs((player.x + size / 2) - (opponent.x + opp_size / 2))
            dy = abs((player.y + size / 2) - (opponent.y + opp_size / 2))
            if dx < 3 or dy < 3:
                shield_chance = current_config.get('SHIELD_CHANCE', 0.5)
                return random.random() < shield_chance * 0.7

    return False


def _get_smart_movement_direction(maze: list, player, target: dict, current_config: dict) -> dict:
    """
    Compute movement direction toward target using A* pathfinding.
    Mirrors JS getSmartMovementDirection().
    """
    if not target or not isinstance(target.get('x'), (int, float)):
        return {'dx': 0, 'dy': 0}

    name = current_config.get('NAME', 'INTERMEDIATE')
    size = getattr(player, 'size', 2.0)

    # Human error simulation for non-INSANE
    if name != 'INSANE':
        if getattr(player, 'confusion_timer', 0) > 0:
            player.confusion_timer -= 1
            if player.confused_dir:
                return player.confused_dir

        err_chance = current_config.get('MOVEMENT_ERROR_CHANCE', 0)
        if err_chance > 0 and random.random() < err_chance * 0.1:
            player.confusion_timer = random.randint(5, 14)
            dirs = [{'dx': 1, 'dy': 0}, {'dx': -1, 'dy': 0}, {'dx': 0, 'dy': 1}, {'dx': 0, 'dy': -1}]
            d = random.choice(dirs)
            d['dx'] *= BASE_SPEED
            d['dy'] *= BASE_SPEED
            player.confused_dir = d
            return d

    tx, ty = target['x'], target['y']
    path = find_path_to_target(maze, player.x, player.y, tx, ty)

    dx_raw = tx - player.x
    dy_raw = ty - player.y
    dist_raw = math.hypot(dx_raw, dy_raw)

    # Direct approach if very close
    if dist_raw < CELL_SIZE * 1.5:
        if dist_raw < 0.5:
            return {'dx': 0, 'dy': 0}
        return {'dx': (dx_raw / dist_raw) * BASE_SPEED, 'dy': (dy_raw / dist_raw) * BASE_SPEED}

    # Fallback if path too short
    if len(path) < 2:
        if dist_raw < 0.5:
            return {'dx': 0, 'dy': 0}
        return {'dx': (dx_raw / dist_raw) * BASE_SPEED, 'dy': (dy_raw / dist_raw) * BASE_SPEED}

    target_idx = 1
    p_cx = player.x + size / 2
    p_cy = player.y + size / 2

    if len(path) > 2:
        c1 = path[1]
        c1x = MAZE_OFFSET_X + c1.c * CELL_SIZE + CELL_SIZE / 2
        c1y = c1.r * CELL_SIZE + CELL_SIZE / 2
        if math.hypot(c1x - p_cx, c1y - p_cy) < CELL_SIZE * 0.5:
            target_idx = 2

    next_cell = path[target_idx]
    ntx = MAZE_OFFSET_X + next_cell.c * CELL_SIZE + CELL_SIZE / 2
    nty = next_cell.r * CELL_SIZE + CELL_SIZE / 2

    dx = ntx - p_cx
    dy = nty - p_cy
    dist = math.hypot(dx, dy)
    if dist < 0.5:
        return {'dx': 0, 'dy': 0}

    return {'dx': (dx / dist) * BASE_SPEED, 'dy': (dy / dist) * BASE_SPEED}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_cpu_input(player, opponent, state) -> dict:
    """
    Generate AI input commands for a CPU-controlled player.
    Main entry point for AI decision-making.
    Returns an input dict matching the human input format.
    Mirrors JS getCpuInput().
    """
    cmd = {
        'up': False, 'down': False, 'left': False, 'right': False,
        'boost': False, 'beam': False, 'shield': False,
        'mine': False, 'boom': False, 'start': False,
    }

    if player is None or opponent is None:
        return cmd

    maze = state.maze or []

    # --- 0. CONFIG LOADING ---
    current_config = dict(get_active_config())
    if current_config.get('ADAPTIVE_DIFFICULTY_ENABLED'):
        current_config = adjust_difficulty_dynamically(player.score, opponent.score, current_config)

    # --- 1. STUCK DETECTION ---
    if is_player_stuck(player):
        player.stuck_counter = getattr(player, 'stuck_counter', 0) + 1
        if player.stuck_counter > 15:
            player.unstuck_dir = get_unstuck_direction(maze, player)
            player.force_unstuck_timer = 30
            player.stuck_counter = 0
    else:
        player.stuck_counter = 0

    if getattr(player, 'force_unstuck_timer', 0) > 0:
        player.force_unstuck_timer -= 1
        d = player.unstuck_dir or {'x': 0, 'y': 0}
        if d.get('x', 0) < 0:
            cmd['left'] = True
        if d.get('x', 0) > 0:
            cmd['right'] = True
        if d.get('y', 0) < 0:
            cmd['up'] = True
        if d.get('y', 0) > 0:
            cmd['down'] = True
        return cmd

    # --- 2. REACTION LATENCY / MENTAL MODEL INIT ---
    if not hasattr(player, 'ai_mental_model') or player.ai_mental_model is None:
        player.ai_mental_model = {
            'strategy': None,
            'move_dir': {'dx': 0, 'dy': 0},
            'energy_strat': {'shield': False, 'boost': False},
            'combo': None,
            'incoming_threat': None,
            'opponent_prediction': None,
            'force_shield_for_mine': False,
            'mine_trap_danger': False,
        }

    player.ai_frame_counter = getattr(player, 'ai_frame_counter', 0) + 1
    reaction_interval = current_config.get('REACTION_INTERVAL', 1) or 1
    should_think = (player.ai_frame_counter % reaction_interval) == 0

    if should_think:
        model = player.ai_mental_model
        model['force_shield_for_mine'] = False

        _track_opponent_behavior(player, opponent)
        opp_pred = _get_opponent_prediction(player, opponent)
        model['opponent_prediction'] = opp_pred

        # A. Strategy
        model['strategy'] = decide_strategy(player, opponent, state, current_config, opp_pred)

        # B. Combo
        model['combo'] = should_execute_combo(player, opponent, state, current_config)

        # C. Movement
        model['move_dir'] = _get_smart_movement_direction(maze, player, model['strategy'], current_config)

        # D. Beam dodge (HARD+)
        threat_assessment = None
        name = current_config.get('NAME', 'INTERMEDIATE')
        if name in ('HARD', 'INSANE') and maze:
            threat_assessment = is_opponent_aiming_at_me(maze, player, opponent)
            if threat_assessment['danger'] and threat_assessment['urgency'] > 0.3:
                model['incoming_threat'] = threat_assessment
                if 0.4 < threat_assessment['urgency'] <= 0.7:
                    use_wall_aware = current_config.get('DODGE_WALL_AWARE', False)
                    dodge = get_dodge_direction(threat_assessment['direction'], player, use_wall_aware)
                    model['move_dir']['dx'] += dodge.get('dx', 0) * BASE_SPEED * 1.5
                    model['move_dir']['dy'] += dodge.get('dy', 0) * BASE_SPEED * 1.5
                    if name != 'INSANE' and player.boost_energy > 40:
                        model['energy_strat'] = {'shield': False, 'boost': True}
            else:
                model['incoming_threat'] = None
        else:
            model['incoming_threat'] = None

        # E. Mine avoidance
        nearby_mines = []
        danger_level = 0.0
        mine_detect_radius = current_config.get('MINE_DETECT_RADIUS', 8)
        own_mine_radius = 12 if name == 'INSANE' else mine_detect_radius
        critical_mine = False

        for mine in (state.mines or []):
            dist = math.hypot(mine['x'] - player.x, mine['y'] - player.y)
            is_own = mine.get('owner') == player.id
            detect_r = own_mine_radius if is_own else mine_detect_radius
            if dist < detect_r:
                danger_mult = 1.5 if (name == 'INSANE' and is_own) else 1.0
                nearby_mines.append({'mine': mine, 'dist': dist, 'is_own': is_own})
                danger_level += ((detect_r - dist) / detect_r) * danger_mult
                if dist < 5:
                    critical_mine = True

        escape_x = escape_y = 0.0
        for m_info in nearby_mines:
            mine, dist, is_own = m_info['mine'], m_info['dist'], m_info['is_own']
            push_x = player.x - mine['x']
            push_y = player.y - mine['y']
            push_dist = math.hypot(push_x, push_y)
            if push_dist > 0.1:
                own_mult = 3.0 if (name == 'INSANE' and is_own) else 1.0
                push_strength = ((mine_detect_radius - dist) / dist) * own_mult
                escape_x += (push_x / push_dist) * push_strength
                escape_y += (push_y / push_dist) * push_strength

        if nearby_mines:
            esc_mult = 4.0 if name == 'INSANE' else 1.5
            esc_max = 10 if name == 'INSANE' else 4
            esc_strength = min(danger_level * esc_mult, esc_max)
            model['move_dir']['dx'] += escape_x * esc_strength
            model['move_dir']['dy'] += escape_y * esc_strength

            if name == 'INSANE' and critical_mine and player.boost_energy > 10:
                model['energy_strat']['shield'] = True
                model['force_shield_for_mine'] = True

            danger_threshold = 0.5 if name == 'INSANE' else 1.5
            if danger_level > danger_threshold:
                model['mine_trap_danger'] = True
                if name != 'INSANE' and player.boost_energy > 20:
                    model['energy_strat']['boost'] = True
                elif name == 'INSANE' and player.boost_energy > 85:
                    model['energy_strat']['boost'] = True
            else:
                model['mine_trap_danger'] = False

        # F. Energy strategy
        model['energy_strat'] = get_energy_strategy(player, opponent, current_config, {
            'incomingThreat': model.get('incoming_threat'),
            'dangerLevel': danger_level,
            'isAligned': _is_aligned_with_opponent(player, opponent),
        })

        # G. Unified shield decision
        if not model['energy_strat']['shield']:
            model['energy_strat']['shield'] = _should_activate_shield(
                player, opponent, current_config,
                {'threat_assessment': threat_assessment, 'danger_level': danger_level, 'nearby_mines': nearby_mines}
            )

        # H. Sudden death urgency
        if state.game_time and state.game_time < TIMING.SUDDEN_DEATH_TIME:
            if (model.get('strategy') or {}).get('urgent') and player.boost_energy > 25:
                model['energy_strat']['boost'] = True

        # I. INSANE tactical boost
        if name == 'INSANE':
            strat_type = (model.get('strategy') or {}).get('type')
            if player.boost_energy > 80:
                if strat_type == 'BLOCK_GOAL' and (model.get('strategy') or {}).get('urgent'):
                    model['energy_strat']['boost'] = True
                elif strat_type == 'GOAL_RUSH' and (model.get('strategy') or {}).get('urgent'):
                    model['energy_strat']['boost'] = True

        # J. Goal rush boost (non-INSANE)
        if name != 'INSANE':
            if (model.get('strategy') or {}).get('type') == 'GOAL_RUSH' and player.boost_energy > 50:
                model['energy_strat']['boost'] = True

    # --- 3. EXECUTION PHASE ---
    model = player.ai_mental_model
    move_dir = model.get('move_dir', {'dx': 0, 'dy': 0})
    energy_strat = model.get('energy_strat', {'shield': False, 'boost': False})
    strategy = model.get('strategy')
    combo = model.get('combo')

    DEADZONE = 0.05
    if abs(move_dir.get('dx', 0)) > DEADZONE:
        cmd['left'] = move_dir['dx'] < 0
        cmd['right'] = move_dir['dx'] > 0
    if abs(move_dir.get('dy', 0)) > DEADZONE:
        cmd['up'] = move_dir['dy'] < 0
        cmd['down'] = move_dir['dy'] > 0

    # Execute combo
    if combo and combo.get('actions'):
        still_valid = _validate_combo_conditions(combo, player, opponent, state)
        if not still_valid:
            player.ai_mental_model['combo'] = None
            combo = None
            if player.boost_energy > 30 and _is_aligned_with_opponent(player, opponent):
                cmd['beam'] = True
        else:
            name_cfg = current_config.get('NAME', 'INTERMEDIATE')
            for action in combo['actions']:
                if action == 'charge_beam':
                    cmd['beam'] = True
                elif action == 'boost':
                    if name_cfg != 'INSANE' or player.boost_energy > 80:
                        cmd['boost'] = True
                elif action == 'shield':
                    cmd['shield'] = True

    # Shield / boost
    if not combo:
        if model.get('force_shield_for_mine'):
            cmd['shield'] = True
        elif energy_strat.get('shield') and random.random() <= current_config.get('SHIELD_CHANCE', 0.6):
            cmd['shield'] = True

        min_boost = current_config.get('MIN_BOOST_ENERGY', 25)
        if player.boost_energy > min_boost and energy_strat.get('boost'):
            cmd['boost'] = True

    # Detonate
    if maze and should_detonate_nearby_mines(state.mines or [], player, opponent):
        cmd['boom'] = True

    # Beam logic
    if not combo and player.boost_energy > current_config.get('MIN_BEAM_ENERGY', 30):
        should_fire = False
        opp_pred = model.get('opponent_prediction')
        if current_config.get('TACTICAL_CHARGING_ENABLED') and (strategy or {}).get('can_charge'):
            should_fire = should_charge_beam(maze, player, opponent, current_config)
        else:
            use_dist = current_config.get('DISTANCE_BEAM_FIRING', False)
            should_fire = should_fire_beam_basic(maze, player, opponent, use_dist, opp_pred, current_config)

        fire_chance = 1.0 if current_config.get('NAME') == 'INSANE' else 0.95
        if should_fire and random.random() < fire_chance:
            cmd['beam'] = True

    # Mine drop
    dist_to_enemy = math.hypot(player.x - opponent.x, player.y - opponent.y)
    if getattr(player, 'mines_left', 0) > 0 and dist_to_enemy < 8.0 and random.random() < 0.25:
        cmd['mine'] = True

    if cmd['mine'] and current_config.get('ADVANCED_MINING_ENABLED') and maze:
        pos = calculate_mine_position(maze, player, opponent, current_config)
        player._suggested_mine_pos = pos

    if cmd['mine']:
        record_mine_placement(player, player.x, player.y, state.frame_count)

    # Update last position for stuck detection
    player.last_pos = {'x': player.x, 'y': player.y}

    return cmd
