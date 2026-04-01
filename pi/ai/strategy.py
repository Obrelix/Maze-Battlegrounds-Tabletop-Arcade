# pi/ai/strategy.py
# High-level AI strategy, ported from docs/js/ai/strategy.js

import math
import random

from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, LOGICAL_W, LOGICAL_H, TIMING


# ---------------------------------------------------------------------------
# Internal portal helpers
# ---------------------------------------------------------------------------

def _evaluate_portal_strategy(player, portals: list, goal_x: float, goal_y: float,
                                current_config: dict) -> dict:
    if not portals or len(portals) < 2:
        return {'use_portal': False, 'portal': None, 'benefit': 0}
    if getattr(player, 'portal_cooldown', 0) > 0:
        return {'use_portal': False, 'portal': None, 'benefit': 0}

    diff_name = (current_config or {}).get('NAME', 'INTERMEDIATE')
    benefit_threshold = 8 if diff_name == 'INSANE' else (12 if diff_name == 'HARD' else 15)
    distance_threshold = 35 if diff_name == 'INSANE' else (30 if diff_name == 'HARD' else 25)

    size = getattr(player, 'size', 2.0)
    pcx = player.x + size / 2
    pcy = player.y + size / 2

    best_portal = None
    best_benefit = 0

    for i, portal in enumerate(portals):
        other = portals[(i + 1) % len(portals)]
        dist_to_portal = math.hypot(portal['x'] - pcx, portal['y'] - pcy)
        dist_exit_to_goal = math.hypot(other['x'] - goal_x, other['y'] - goal_y)
        current_dist = math.hypot(goal_x - pcx, goal_y - pcy)
        benefit = current_dist - (dist_to_portal + dist_exit_to_goal)

        if benefit > benefit_threshold and dist_to_portal < distance_threshold:
            if benefit > best_benefit:
                best_benefit = benefit
                best_portal = portal

    return {'use_portal': best_portal is not None, 'portal': best_portal, 'benefit': best_benefit}


def _evaluate_portal_flank(player, opponent, portals: list) -> dict:
    if not portals or len(portals) < 2:
        return {'should_flank': False, 'portal': None}
    if getattr(player, 'portal_cooldown', 0) > 0:
        return {'should_flank': False, 'portal': None}

    for i, portal in enumerate(portals):
        exit_p = portals[(i + 1) % len(portals)]
        dist_to_portal = math.hypot(portal['x'] - player.x, portal['y'] - player.y)
        if dist_to_portal > 15:
            continue
        exit_to_opp = math.hypot(exit_p['x'] - opponent.x, exit_p['y'] - opponent.y)
        current_to_opp = math.hypot(player.x - opponent.x, player.y - opponent.y)
        if exit_to_opp < current_to_opp * 0.7 and exit_to_opp < 20:
            return {'should_flank': True, 'portal': portal}

    return {'should_flank': False, 'portal': None}


def _evaluate_portal_escape(player, opponent, portals: list) -> dict:
    if not portals or len(portals) < 2:
        return {'should_escape': False, 'portal': None}
    if getattr(player, 'portal_cooldown', 0) > 0:
        return {'should_escape': False, 'portal': None}

    size = getattr(player, 'size', 2.0)
    pcx = player.x + size / 2
    pcy = player.y + size / 2
    dist_to_enemy = math.hypot(opponent.x - pcx, opponent.y - pcy)

    if dist_to_enemy > 12 or player.boost_energy > 40:
        return {'should_escape': False, 'portal': None}

    nearest = None
    nearest_dist = float('inf')
    for portal in portals:
        d = math.hypot(portal['x'] - pcx, portal['y'] - pcy)
        if d < nearest_dist and d < 10:
            nearest_dist = d
            nearest = portal

    return {'should_escape': nearest is not None, 'portal': nearest}


def _is_strategy_still_valid(strategy: dict, player, opponent, state) -> bool:
    if not strategy or not strategy.get('type'):
        return False
    stype = strategy['type']
    fc = state.frame_count

    if stype == 'EXECUTE':
        return (opponent.stun_remaining(fc) > 0 or
                opponent.glitch_remaining(fc) > 0)
    if stype == 'PORTAL_ESCAPE':
        dist = math.hypot(opponent.x - player.x, opponent.y - player.y)
        return dist < 15 and player.boost_energy < 40
    if stype == 'SCAVENGE':
        return state.ammo_crate is not None
    return True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def decide_strategy(player, opponent, state, current_config: dict,
                    opponent_prediction=None) -> dict:
    """
    Decide high-level AI strategy.  Returns a strategy dict with at least:
      {'x', 'y', 'type', 'priority'}
    May also contain 'urgent', 'can_charge', 'aggressive'.
    Mirrors JS decideStrategy().
    """
    goal_x = MAZE_OFFSET_X + player.goal_c * CELL_SIZE + CELL_SIZE / 2
    goal_y = player.goal_r * CELL_SIZE + CELL_SIZE / 2
    opp_goal_x = MAZE_OFFSET_X + opponent.goal_c * CELL_SIZE + CELL_SIZE / 2
    opp_goal_y = opponent.goal_r * CELL_SIZE + CELL_SIZE / 2

    if not hasattr(player, 'ai_strategy_state') or player.ai_strategy_state is None:
        player.ai_strategy_state = {'current_strategy': None, 'frames_since_change': 0}

    player.ai_strategy_state['frames_since_change'] += 1

    my_dist = math.hypot(goal_x - player.x, goal_y - player.y)
    enemy_dist = math.hypot(opp_goal_x - opponent.x, opp_goal_y - opponent.y)
    dist_to_enemy = math.hypot(opponent.x - player.x, opponent.y - player.y)
    opp_size = getattr(opponent, 'size', 2.0)

    aggression = current_config.get('BASE_AGGRESSION', 0.6)
    name = current_config.get('NAME', 'INTERMEDIATE')
    if name not in ('INSANE', 'BEGINNER'):
        score_diff = opponent.score - player.score
        if score_diff >= 2:
            aggression *= current_config.get('AGGRESSION_SCALE_UP', 1.3)
        if score_diff <= -2:
            aggression *= current_config.get('AGGRESSION_SCALE_DOWN', 0.8)
    elif name == 'BEGINNER':
        aggression = 0.4
    else:
        aggression *= current_config.get('AGGRESSION_SCALE_UP', 1.3)

    best = {'x': goal_x, 'y': goal_y, 'type': 'GOAL', 'priority': 1}

    fc = state.frame_count
    opp_stunned = opponent.stun_remaining(fc) > 30
    opp_glitched = opponent.glitch_remaining(fc) > 60
    opp_disabled = opp_stunned or opp_glitched
    opp_far = dist_to_enemy > 35
    closer = my_dist < enemy_dist
    much_closer = my_dist < enemy_dist * 0.7

    # ADVANTAGE RUSH
    if name != 'BEGINNER':
        if opp_disabled and my_dist < 50:
            best = {'x': goal_x, 'y': goal_y, 'type': 'GOAL_RUSH', 'priority': 10, 'urgent': True, 'can_charge': False}
        elif much_closer and my_dist < 40:
            best = {'x': goal_x, 'y': goal_y, 'type': 'GOAL_RUSH', 'priority': 9, 'urgent': True}
        elif opp_far and closer and my_dist < 45:
            best = {'x': goal_x, 'y': goal_y, 'type': 'GOAL_RUSH', 'priority': 8.5, 'urgent': True}

    # SUDDEN DEATH
    is_sudden_death = state.game_time < TIMING.SUDDEN_DEATH_TIME if state.game_time else False
    if is_sudden_death and name != 'BEGINNER':
        if my_dist < enemy_dist * 1.5:
            best = {'x': goal_x, 'y': goal_y, 'type': 'GOAL_RUSH', 'priority': 11, 'urgent': True}
        else:
            best = {'x': opp_goal_x, 'y': opp_goal_y, 'type': 'BLOCK_GOAL', 'priority': 11, 'urgent': True}

    portals = getattr(state, 'portals', []) or []

    if best['priority'] < 11:
        # PORTAL ESCAPE
        if name != 'BEGINNER' and current_config.get('PORTAL_AWARENESS_ENABLED', False):
            esc = _evaluate_portal_escape(player, opponent, portals)
            if esc['should_escape'] and esc['portal']:
                candidate = {'x': esc['portal']['x'], 'y': esc['portal']['y'], 'type': 'PORTAL_ESCAPE', 'priority': 10}
                if candidate['priority'] > best['priority']:
                    best = candidate

        # PANIC DEFENSE
        if (enemy_dist < 10 or (enemy_dist + 80 < my_dist)) and name != 'BEGINNER':
            candidate = {'x': opp_goal_x, 'y': opp_goal_y, 'type': 'BLOCK_GOAL', 'priority': 10}
            if candidate['priority'] > best['priority']:
                best = candidate

        # EXECUTE STUNNED
        if (opponent.stun_remaining(fc) > 0 or opponent.glitch_remaining(fc) > 0) and name != 'BEGINNER':
            candidate = {
                'x': opponent.x + opp_size / 2,
                'y': opponent.y + opp_size / 2,
                'type': 'EXECUTE',
                'priority': 9,
                'can_charge': True,
            }
            if candidate['priority'] > best['priority']:
                best = candidate

        # PORTAL SHORTCUT
        if name != 'BEGINNER' and current_config.get('PORTAL_AWARENESS_ENABLED', False):
            ps = _evaluate_portal_strategy(player, portals, goal_x, goal_y, current_config)
            if ps['use_portal'] and ps['portal']:
                candidate = {'x': ps['portal']['x'], 'y': ps['portal']['y'], 'type': 'PORTAL_SHORTCUT', 'priority': 8}
                if candidate['priority'] > best['priority']:
                    best = candidate

            if name in ('HARD', 'INSANE') and best['priority'] < 8:
                pf = _evaluate_portal_flank(player, opponent, portals)
                if pf['should_flank'] and pf['portal']:
                    candidate = {'x': pf['portal']['x'], 'y': pf['portal']['y'], 'type': 'PORTAL_FLANK', 'priority': 7.5}
                    if candidate['priority'] > best['priority']:
                        best = candidate

        # RESOURCE DENIAL
        ammo = state.ammo_crate
        if ammo and current_config.get('RESOURCE_DENIAL_ENABLED', False):
            dist_to_ammo = math.hypot(ammo['x'] - player.x, ammo['y'] - player.y)
            enemy_dist_to_ammo = math.hypot(ammo['x'] - opponent.x, ammo['y'] - opponent.y)
            if dist_to_ammo < enemy_dist_to_ammo * 1.2 and dist_to_ammo < 40:
                candidate = {'x': ammo['x'], 'y': ammo['y'], 'type': 'SCAVENGE', 'priority': 8}
                if candidate['priority'] > best['priority']:
                    best = candidate

        # AGGRESSIVE INTERCEPT
        if name != 'BEGINNER':
            opp_dist_to_goal = math.hypot(opp_goal_x - opponent.x, opp_goal_y - opponent.y)
            ai_dist_to_opp_goal = math.hypot(opp_goal_x - player.x, opp_goal_y - player.y)

            if name == 'INSANE':
                if opp_dist_to_goal < 25:
                    candidate = {'x': opp_goal_x, 'y': opp_goal_y, 'type': 'BLOCK_GOAL', 'priority': 11, 'urgent': True}
                    if candidate['priority'] > best['priority']:
                        best = candidate
                elif my_dist < 60:
                    candidate = {'x': goal_x, 'y': goal_y, 'type': 'GOAL_RUSH', 'priority': 10.5, 'urgent': True}
                    if candidate['priority'] > best['priority']:
                        best = candidate
                elif opp_dist_to_goal < 40:
                    candidate = {'x': opp_goal_x, 'y': opp_goal_y, 'type': 'BLOCK_GOAL', 'priority': 10, 'urgent': True}
                    if candidate['priority'] > best['priority']:
                        best = candidate
                else:
                    candidate = {'x': goal_x, 'y': goal_y, 'type': 'GOAL_RUSH', 'priority': 9, 'urgent': True}
                    if candidate['priority'] > best['priority']:
                        best = candidate
            elif current_config.get('ALWAYS_INTERCEPT') or current_config.get('INTERCEPT_PRIORITY'):
                if opp_dist_to_goal < ai_dist_to_opp_goal and opp_dist_to_goal < 50:
                    ix = (opponent.x + opp_goal_x) / 2
                    iy = (opponent.y + opp_goal_y) / 2
                    candidate = {'x': ix, 'y': iy, 'type': 'INTERCEPT', 'priority': 9.5, 'urgent': True}
                    if candidate['priority'] > best['priority']:
                        best = candidate
                if opp_dist_to_goal < 20:
                    candidate = {'x': opp_goal_x, 'y': opp_goal_y, 'type': 'BLOCK_GOAL', 'priority': 10.5, 'urgent': True}
                    if candidate['priority'] > best['priority']:
                        best = candidate

        # PREDICTIVE INTERCEPT
        if player.boost_energy > 15 and name != 'BEGINNER':
            predicted = predict_player_movement(opponent, current_config, opponent_prediction)
            dist_to_predicted = math.hypot(predicted['x'] - player.x, predicted['y'] - player.y)
            hunt_threshold = current_config.get('HUNT_THRESHOLD', 60)
            if opponent_prediction and opponent_prediction.get('preferredDistance', 0) > 25:
                hunt_threshold *= 1.2
            if dist_to_predicted < hunt_threshold and aggression > 0.5:
                candidate = {'x': predicted['x'], 'y': predicted['y'], 'type': 'HUNT', 'priority': 7, 'aggressive': True}
                if candidate['priority'] > best['priority']:
                    best = candidate

    # Hysteresis
    if current_config.get('STRATEGY_HYSTERESIS'):
        current_strat = player.ai_strategy_state.get('current_strategy')
        frames_since = player.ai_strategy_state.get('frames_since_change', 0)

        if current_strat and _is_strategy_still_valid(current_strat, player, opponent, state):
            priority_diff = best['priority'] - current_strat['priority']
            base_threshold = 3
            min_threshold = 1
            decay_rate = 0.015
            dyn_threshold = max(min_threshold, base_threshold - frames_since * decay_rate)

            critical = ('EXECUTE', 'PORTAL_ESCAPE', 'GOAL_RUSH', 'BLOCK_GOAL')
            eff_threshold = min(dyn_threshold, 1.5) if best['type'] in critical else dyn_threshold

            if priority_diff < eff_threshold:
                if current_strat['type'] in ('HUNT', 'EXECUTE'):
                    current_strat['x'] = opponent.x + opp_size / 2
                    current_strat['y'] = opponent.y + opp_size / 2
                return current_strat

    # INSANE fallback: always rush
    if name == 'INSANE' and best['type'] == 'GOAL' and best['priority'] <= 1:
        best = {'x': goal_x, 'y': goal_y, 'type': 'GOAL_RUSH', 'priority': 9, 'urgent': True}

    player.ai_strategy_state['current_strategy'] = best
    player.ai_strategy_state['frames_since_change'] = 0
    return best


def get_strategy_target(player, opponent, state, current_config: dict) -> dict:
    """Convenience wrapper — returns strategy dict."""
    return decide_strategy(player, opponent, state, current_config)


def predict_player_movement(opponent, current_config: dict, opponent_prediction=None) -> dict:
    """
    Predict where the opponent will be in ~PREDICTION_WINDOW frames.
    Mirrors JS predictPlayerMovement().
    """
    prediction_frames = current_config.get('PREDICTION_WINDOW', 15)
    history = getattr(opponent, 'direction_history', None) or []

    if len(history) < 2:
        last_dir = getattr(opponent, 'last_dir', None) or {'x': 0, 'y': 0}
        px = opponent.x + last_dir.get('x', 0) * prediction_frames
        py = opponent.y + last_dir.get('y', 0) * prediction_frames
        return {
            'x': max(0.0, min(px, LOGICAL_W)),
            'y': max(0.0, min(py, LOGICAL_H)),
        }

    # Exponential decay weighting
    weighted_dx = 0.0
    weighted_dy = 0.0
    total_weight = 0.0
    for i, d in enumerate(history):
        weight = 1.5 ** i
        weighted_dx += d.get('x', 0) * weight
        weighted_dy += d.get('y', 0) * weight
        total_weight += weight

    avg_dx = weighted_dx / total_weight if total_weight > 0 else 0
    avg_dy = weighted_dy / total_weight if total_weight > 0 else 0

    turning_factor = _analyze_direction_changes(opponent)
    confidence = max(0.3, 1 - turning_factor)

    px = opponent.x + avg_dx * prediction_frames * confidence
    py = opponent.y + avg_dy * prediction_frames * confidence

    if opponent_prediction and opponent_prediction.get('preferredDirection'):
        dir_bias = 0.15
        dw = opponent_prediction.get('directionWeights', {})
        total = sum(dw.get(k, 0) for k in ('up', 'down', 'left', 'right'))
        if total > 50:
            horiz_bias = (dw.get('right', 0) - dw.get('left', 0)) / total
            vert_bias = (dw.get('down', 0) - dw.get('up', 0)) / total
            px += horiz_bias * prediction_frames * dir_bias
            py += vert_bias * prediction_frames * dir_bias

    if current_config.get('CORNER_CUT_DETECTION', False) and turning_factor > 0.3:
        px, py = _predict_corner_cut(opponent, px, py)

    return {
        'x': max(0.0, min(px, LOGICAL_W)),
        'y': max(0.0, min(py, LOGICAL_H)),
    }


def _analyze_direction_changes(opponent) -> float:
    if not hasattr(opponent, 'direction_history') or opponent.direction_history is None:
        opponent.direction_history = []

    last_dir = getattr(opponent, 'last_dir', None)
    if last_dir:
        opponent.direction_history.append(dict(last_dir))
        if len(opponent.direction_history) > 5:
            opponent.direction_history.pop(0)

    dirs = opponent.direction_history
    if len(dirs) < 2:
        return 0.0

    variance = 0.0
    for i in range(1, len(dirs)):
        prev = dirs[i - 1]
        curr = dirs[i]
        dot = prev.get('x', 0) * curr.get('x', 0) + prev.get('y', 0) * curr.get('y', 0)
        variance += (1 - dot) / 2
    return variance / (len(dirs) - 1)


def _predict_corner_cut(opponent, predicted_x: float, predicted_y: float):
    mid_x = (opponent.x + predicted_x) / 2
    mid_y = (opponent.y + predicted_y) / 2
    mid_c = max(0, min(int((mid_x - MAZE_OFFSET_X) // CELL_SIZE), COLS - 1))
    mid_r = max(0, min(int(mid_y // CELL_SIZE), ROWS - 1))
    return (
        MAZE_OFFSET_X + mid_c * CELL_SIZE + CELL_SIZE / 2,
        mid_r * CELL_SIZE + CELL_SIZE / 2,
    )


def should_execute_combo(player, opponent, state, current_config: dict):
    """
    Determine if a combo should be executed.
    Returns combo dict or None.
    Mirrors JS shouldExecuteCombo().
    """
    if not current_config.get('COMBO_CHAINS_ENABLED'):
        return None

    from config import BASE_SPEED
    fc = state.frame_count
    dist = math.hypot(player.x - opponent.x, player.y - opponent.y)
    stun_time = opponent.stun_remaining(fc)
    glitch_time = opponent.glitch_remaining(fc) if opponent.glitch_start_time != 0 else 0

    # STUN_EXECUTE
    if stun_time > 0:
        close_time = dist / (BASE_SPEED * 2)
        charge_time = 30
        if stun_time > close_time + charge_time + 10:
            if dist > 12 and player.boost_energy > 50:
                return {'type': 'STUN_EXECUTE_CLOSE', 'actions': ['boost'], 'priority': 11, 'window': stun_time}
            elif dist <= 12 and player.boost_energy > 65:
                return {'type': 'STUN_EXECUTE_FIRE', 'actions': ['charge_beam'], 'priority': 11, 'window': stun_time}
        elif stun_time > charge_time and player.boost_energy > 65 and dist < 20:
            return {'type': 'STUN_CHARGE', 'actions': ['charge_beam'], 'priority': 10, 'window': stun_time}

    # GLITCH_HUNT
    if glitch_time > 60 and player.boost_energy > 50:
        if dist > 20:
            return {'type': 'GLITCH_HUNT', 'actions': ['boost'], 'priority': 9}
        elif dist > 10:
            return {'type': 'GLITCH_APPROACH', 'actions': ['boost'], 'priority': 9}
        elif player.boost_energy > 65:
            return {'type': 'GLITCH_EXECUTE', 'actions': ['charge_beam'], 'priority': 10}

    # BOOST_HUNT
    name = current_config.get('NAME', 'INTERMEDIATE')
    boost_min = 90 if name == 'INSANE' else 40
    boost_max_dist = 35 if name == 'INSANE' else 25
    if player.boost_energy > boost_min and dist > boost_max_dist:
        return {'type': 'BOOST_HUNT', 'actions': ['boost'], 'priority': 6}

    # SHIELD_BAIT
    if 15 < player.boost_energy < 30 and dist < 10:
        return {'type': 'SHIELD_BAIT', 'actions': ['shield'], 'priority': 5}

    return None
