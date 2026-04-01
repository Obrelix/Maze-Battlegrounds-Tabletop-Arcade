# pi/ai/difficulty.py
# Difficulty presets ported from docs/js/ai/difficulty.js

# Energy thresholds must be >= actual costs: BEAM=30, CHARGED_BEAM=65, SHIELD_ACTIVATION=10, DETONATION=30

DIFFICULTY_PRESETS = {
    'BEGINNER': {
        'NAME': 'BEGINNER',
        'COLOR': '#00ff00ff',
        'MIN_BEAM_ENERGY': 50,
        'MIN_CHARGE_ENERGY': 85,
        'MIN_BOOST_ENERGY': 40,
        'SHIELD_HP_THRESHOLD': 35,
        'AGGRESSIVE_DISTANCE': 15,
        'HUNT_THRESHOLD': 45,
        'DEFENSE_THRESHOLD': 35,
        'MINE_ARM_DISTANCE': 8,
        'COMBO_COOLDOWN': 180,
        'TACTICAL_PROBABILITY': 0.3,
        'REACTION_INTERVAL': 20,
        'MOVEMENT_ERROR_CHANCE': 0.25,
        'HIGHSCORE_MULTIPLIER': 0.25,
    },
    'INTERMEDIATE': {
        'NAME': 'INTERMEDIATE',
        'COLOR': '#ffff00ff',
        'MIN_BEAM_ENERGY': 40,
        'MIN_CHARGE_ENERGY': 75,
        'MIN_BOOST_ENERGY': 30,
        'SHIELD_HP_THRESHOLD': 30,
        'AGGRESSIVE_DISTANCE': 12,
        'HUNT_THRESHOLD': 60,
        'DEFENSE_THRESHOLD': 20,
        'MINE_ARM_DISTANCE': 6,
        'COMBO_COOLDOWN': 120,
        'TACTICAL_PROBABILITY': 0.6,
        'REACTION_INTERVAL': 10,
        'MOVEMENT_ERROR_CHANCE': 0.05,
        'HIGHSCORE_MULTIPLIER': 0.4,
    },
    'HARD': {
        'NAME': 'HARD',
        'COLOR': '#ff5100ff',
        'MIN_BEAM_ENERGY': 32,
        'MIN_CHARGE_ENERGY': 68,
        'MIN_BOOST_ENERGY': 25,
        'SHIELD_HP_THRESHOLD': 25,
        'AGGRESSIVE_DISTANCE': 8,
        'HUNT_THRESHOLD': 75,
        'DEFENSE_THRESHOLD': 15,
        'MINE_ARM_DISTANCE': 4,
        'COMBO_COOLDOWN': 60,
        'TACTICAL_PROBABILITY': 0.8,
        'REACTION_INTERVAL': 4,
        'MOVEMENT_ERROR_CHANCE': 0.0,
        'HIGHSCORE_MULTIPLIER': 0.8,
    },
    'INSANE': {
        'NAME': 'INSANE',
        'COLOR': '#ff0000ff',
        'MIN_BEAM_ENERGY': 30,
        'MIN_CHARGE_ENERGY': 65,
        'MIN_BOOST_ENERGY': 15,
        'SHIELD_HP_THRESHOLD': 15,
        'AGGRESSIVE_DISTANCE': 3,
        'HUNT_THRESHOLD': 100,
        'DEFENSE_THRESHOLD': 8,
        'MINE_ARM_DISTANCE': 2,
        'COMBO_COOLDOWN': 30,
        'TACTICAL_PROBABILITY': 1.0,
        'REACTION_INTERVAL': 1,
        'MOVEMENT_ERROR_CHANCE': 0.0,
        'HIGHSCORE_MULTIPLIER': 1,
        'MINE_DETECT_RADIUS': 15,
        'INTERCEPT_PRIORITY': True,
    },
    'DYNAMIC': {
        'NAME': 'DYNAMIC',
        'COLOR': '#00c3ffff',
        'MIN_BEAM_ENERGY': 40,
        'MIN_CHARGE_ENERGY': 75,
        'MIN_BOOST_ENERGY': 30,
        'SHIELD_HP_THRESHOLD': 30,
        'AGGRESSIVE_DISTANCE': 12,
        'HUNT_THRESHOLD': 60,
        'DEFENSE_THRESHOLD': 20,
        'MINE_ARM_DISTANCE': 6,
        'COMBO_COOLDOWN': 120,
        'TACTICAL_PROBABILITY': 0.6,
        'REACTION_INTERVAL': 10,
        'MOVEMENT_ERROR_CHANCE': 0.05,
        'HIGHSCORE_MULTIPLIER': 0.85,
    },
}

TACTICAL_STYLES = {
    'AGGRESSIVE': {
        'NAME': 'AGGRESSIVE',
        'MIN_BEAM_ENERGY': 20,
        'MIN_CHARGE_ENERGY': 55,
        'SHIELD_HP_THRESHOLD': 20,
        'HUNT_THRESHOLD': 70,
        'DEFENSE_THRESHOLD': 10,
        'COMBO_PROBABILITY': 0.7,
    },
    'DEFENSIVE': {
        'NAME': 'DEFENSIVE',
        'MIN_BEAM_ENERGY': 50,
        'MIN_CHARGE_ENERGY': 80,
        'SHIELD_HP_THRESHOLD': 40,
        'HUNT_THRESHOLD': 40,
        'DEFENSE_THRESHOLD': 30,
        'COMBO_PROBABILITY': 0.2,
    },
    'MINE_SPECIALIST': {
        'NAME': 'MINE_SPECIALIST',
        'MIN_BEAM_ENERGY': 40,
        'MIN_CHARGE_ENERGY': 75,
        'SHIELD_HP_THRESHOLD': 35,
        'COMBO_PROBABILITY': 0.8,
        'TRAP_SETUP_FREQUENCY': 0.6,
        'MINE_PLACEMENT_DISTANCE': 5,
    },
    'BEAM_MASTER': {
        'NAME': 'BEAM_MASTER',
        'MIN_BEAM_ENERGY': 45,
        'MIN_CHARGE_ENERGY': 65,
        'HUNT_THRESHOLD': 65,
        'DEFENSE_THRESHOLD': 25,
        'CHARGE_PATIENCE': 1000,
        'BEAM_COOLDOWN_FRAMES': 120,
    },
    'BALANCED': {
        'NAME': 'BALANCED',
        'MIN_BEAM_ENERGY': 35,
        'MIN_CHARGE_ENERGY': 70,
        'SHIELD_HP_THRESHOLD': 30,
        'COMBO_PROBABILITY': 0.5,
        'TRAP_SETUP_FREQUENCY': 0.4,
    },
}

DIFFICULTY_FEATURES = {
    'BEGINNER': {
        'ADVANCED_MINING_ENABLED': False,
        'TACTICAL_CHARGING_ENABLED': False,
        'SHIELD_CHANCE': 0.30,
        'ADAPTIVE_DIFFICULTY_ENABLED': False,
        'PREDICTIVE_MOVEMENT_ENABLED': False,
        'COMBO_CHAINS_ENABLED': False,
        'CORNER_CUT_DETECTION': False,
        'RESOURCE_DENIAL_ENABLED': False,
        'PORTAL_AWARENESS_ENABLED': False,
        'BEAM_DODGE_ENABLED': False,
        'DODGE_WALL_AWARE': False,
        'DISTANCE_BEAM_FIRING': False,
        'MINE_DENSITY_CHECK': False,
        'STRATEGY_HYSTERESIS': False,
        'PREDICTION_WINDOW': 5,
        'BASE_AGGRESSION': 0.15,
        'AGGRESSION_SCALE_UP': 0.5,
        'AGGRESSION_SCALE_DOWN': 0.8,
        'MINE_STRATEGY': 'DEFENSIVE',
    },
    'INTERMEDIATE': {
        'ADVANCED_MINING_ENABLED': False,
        'TACTICAL_CHARGING_ENABLED': False,
        'SHIELD_CHANCE': 0.60,
        'ADAPTIVE_DIFFICULTY_ENABLED': True,
        'PREDICTIVE_MOVEMENT_ENABLED': False,
        'COMBO_CHAINS_ENABLED': False,
        'CORNER_CUT_DETECTION': True,
        'RESOURCE_DENIAL_ENABLED': False,
        'PORTAL_AWARENESS_ENABLED': True,
        'BEAM_DODGE_ENABLED': True,
        'DODGE_WALL_AWARE': False,
        'DISTANCE_BEAM_FIRING': True,
        'MINE_DENSITY_CHECK': True,
        'STRATEGY_HYSTERESIS': True,
        'PREDICTION_WINDOW': 15,
        'BASE_AGGRESSION': 0.35,
        'AGGRESSION_SCALE_UP': 1,
        'AGGRESSION_SCALE_DOWN': 0.4,
        'MINE_STRATEGY': 'DEFENSIVE',
    },
    'HARD': {
        'ADVANCED_MINING_ENABLED': True,
        'TACTICAL_CHARGING_ENABLED': True,
        'SHIELD_CHANCE': 0.80,
        'ADAPTIVE_DIFFICULTY_ENABLED': True,
        'PREDICTIVE_MOVEMENT_ENABLED': True,
        'COMBO_CHAINS_ENABLED': True,
        'CORNER_CUT_DETECTION': True,
        'RESOURCE_DENIAL_ENABLED': True,
        'PORTAL_AWARENESS_ENABLED': True,
        'BEAM_DODGE_ENABLED': True,
        'DODGE_WALL_AWARE': True,
        'DISTANCE_BEAM_FIRING': True,
        'MINE_DENSITY_CHECK': True,
        'STRATEGY_HYSTERESIS': True,
        'PREDICTION_WINDOW': 20,
        'BASE_AGGRESSION': 0.75,
        'AGGRESSION_SCALE_UP': 1.4,
        'AGGRESSION_SCALE_DOWN': 0.3,
        'MINE_STRATEGY': 'BALANCED',
    },
    'INSANE': {
        'ADVANCED_MINING_ENABLED': True,
        'TACTICAL_CHARGING_ENABLED': True,
        'SHIELD_CHANCE': 1,
        'ADAPTIVE_DIFFICULTY_ENABLED': False,
        'PREDICTIVE_MOVEMENT_ENABLED': True,
        'COMBO_CHAINS_ENABLED': True,
        'CORNER_CUT_DETECTION': True,
        'RESOURCE_DENIAL_ENABLED': True,
        'PORTAL_AWARENESS_ENABLED': True,
        'BEAM_DODGE_ENABLED': True,
        'DODGE_WALL_AWARE': True,
        'DISTANCE_BEAM_FIRING': False,
        'MINE_DENSITY_CHECK': True,
        'STRATEGY_HYSTERESIS': False,
        'PREDICTION_WINDOW': 45,
        'BASE_AGGRESSION': 1.0,
        'AGGRESSION_SCALE_UP': 2.0,
        'AGGRESSION_SCALE_DOWN': 0.1,
        'MINE_STRATEGY': 'AGGRESSIVE',
        'ALWAYS_INTERCEPT': True,
    },
    'DYNAMIC': {
        'ADVANCED_MINING_ENABLED': False,
        'TACTICAL_CHARGING_ENABLED': False,
        'SHIELD_CHANCE': 0.60,
        'ADAPTIVE_DIFFICULTY_ENABLED': True,
        'PREDICTIVE_MOVEMENT_ENABLED': False,
        'COMBO_CHAINS_ENABLED': False,
        'CORNER_CUT_DETECTION': True,
        'RESOURCE_DENIAL_ENABLED': False,
        'PORTAL_AWARENESS_ENABLED': True,
        'BEAM_DODGE_ENABLED': True,
        'DODGE_WALL_AWARE': False,
        'DISTANCE_BEAM_FIRING': True,
        'MINE_DENSITY_CHECK': False,
        'STRATEGY_HYSTERESIS': True,
        'PREDICTION_WINDOW': 15,
        'BASE_AGGRESSION': 0.35,
        'AGGRESSION_SCALE_UP': 1,
        'AGGRESSION_SCALE_DOWN': 0.4,
        'MINE_STRATEGY': 'DEFENSIVE',
    },
}

# Active configuration (module-level singleton, starts at INTERMEDIATE per JS)
_active_config = {}


def get_active_config() -> dict:
    """Return the current active AI configuration dict."""
    return _active_config


def set_active_config(config: dict) -> None:
    """Replace the active AI configuration."""
    global _active_config
    _active_config = config


def set_difficulty(difficulty: str = 'INTERMEDIATE', tactical_style: str = None) -> None:
    """
    Merge difficulty preset + optional tactical style + features into _active_config.
    Mirrors JS setDifficulty().
    """
    global _active_config
    base = dict(DIFFICULTY_PRESETS.get(difficulty, DIFFICULTY_PRESETS['INTERMEDIATE']))
    style = dict(TACTICAL_STYLES.get(tactical_style, {})) if tactical_style else {}
    features = dict(DIFFICULTY_FEATURES.get(difficulty, DIFFICULTY_FEATURES['INTERMEDIATE']))
    _active_config = {**base, **style, **features}


def get_difficulty_preset(difficulty: str = 'INTERMEDIATE') -> dict:
    """Return a copy of the preset for the given difficulty name."""
    return dict(DIFFICULTY_PRESETS.get(difficulty, DIFFICULTY_PRESETS['INTERMEDIATE']))


def adjust_difficulty_dynamically(player_score: int, cpu_score: int, current_config: dict) -> dict:
    """
    Intra-round adaptive difficulty tweak.
    Returns a (possibly modified) copy of current_config.
    Mirrors JS adjustDifficultyDynamically().
    """
    if not current_config.get('ADAPTIVE_DIFFICULTY_ENABLED'):
        return current_config

    score_diff = cpu_score - player_score
    cfg = dict(current_config)

    if score_diff <= -3:
        cfg['MIN_BEAM_ENERGY'] = max(15, int(cfg['MIN_BEAM_ENERGY'] * 0.6))
        cfg['MIN_CHARGE_ENERGY'] = max(50, int(cfg['MIN_CHARGE_ENERGY'] * 0.7))
        cfg['HUNT_THRESHOLD'] = 85
        cfg['TACTICAL_PROBABILITY'] = min(0.95, cfg.get('TACTICAL_PROBABILITY', 0.6) + 0.15)
        return cfg

    if score_diff >= 3:
        cfg['MIN_BEAM_ENERGY'] = min(50, int(cfg['MIN_BEAM_ENERGY'] * 1.3))
        cfg['MIN_CHARGE_ENERGY'] = min(85, int(cfg['MIN_CHARGE_ENERGY'] * 1.2))
        cfg['HUNT_THRESHOLD'] = 40
        cfg['TACTICAL_PROBABILITY'] = max(0.5, cfg.get('TACTICAL_PROBABILITY', 0.6) - 0.1)
        return cfg

    return current_config


def get_dynamic_difficulty(player_score: int, cpu_score: int, rounds_played: int) -> dict:
    """
    Inter-round dynamic difficulty selection.
    Mirrors JS getDynamicDifficulty().
    """
    score_diff = cpu_score - player_score
    if score_diff <= -2:
        return get_difficulty_preset('HARD')
    if score_diff >= 2:
        return get_difficulty_preset('BEGINNER')
    return get_difficulty_preset('INTERMEDIATE')


def get_energy_strategy(player, opponent, current_config: dict, threat_context: dict = None) -> dict:
    """
    Determine energy usage strategy.
    Returns {'shield': bool, 'boost': bool}.
    Mirrors JS getEnergyStrategy().
    """
    import math
    import random

    if threat_context is None:
        threat_context = {}

    if current_config.get('NAME') == 'BEGINNER':
        return {'shield': random.random() > 0.9, 'boost': random.random() > 0.9}

    dist = math.hypot(opponent.x - player.x, opponent.y - player.y)
    is_insane = current_config.get('NAME') == 'INSANE'

    if is_insane:
        incoming = threat_context.get('incomingThreat') or {}
        if incoming.get('urgency', 0) > 0.5:
            return {'shield': True, 'boost': False}
        if dist < 12 and opponent.boost_energy > 40:
            return {'shield': True, 'boost': False}
        if dist > 40 and player.boost_energy > 85:
            return {'shield': False, 'boost': True}
        return {'shield': False, 'boost': False}

    # Non-INSANE
    shield_threshold = current_config.get('SHIELD_HP_THRESHOLD', 30)
    boost_threshold = current_config.get('MIN_BOOST_ENERGY', 25)
    aggressive_dist = current_config.get('AGGRESSIVE_DISTANCE', 12)

    threat_score = 0.0
    # Proximity threat (0-3)
    threat_score += max(0.0, (20 - dist) / 7)
    # Alignment threat (0-2)
    if threat_context.get('isAligned'):
        threat_score += 2
    # Opponent energy threat (0-1)
    if opponent.boost_energy > 50:
        threat_score += 1
    # Incoming beam threat (0-3)
    incoming = threat_context.get('incomingThreat') or {}
    if incoming.get('urgency', 0) > 0.5:
        threat_score += incoming.get('urgency', 0) * 3
    # Mine proximity threat (0-2)
    threat_score += min(2.0, float(threat_context.get('dangerLevel', 0)))

    if threat_score > 4 and player.boost_energy > 15:
        return {'shield': True, 'boost': False}
    if 2 < threat_score <= 4 and dist > aggressive_dist:
        return {'shield': False, 'boost': player.boost_energy > boost_threshold}
    if player.boost_energy < shield_threshold and threat_score > 1:
        return {'shield': False, 'boost': False}
    if player.boost_energy > boost_threshold * 2:
        return {'shield': False, 'boost': True}

    return {'shield': False, 'boost': random.random() < 0.4}


# Initialise to INTERMEDIATE on module import (mirrors JS end-of-file call)
set_difficulty('INTERMEDIATE')
