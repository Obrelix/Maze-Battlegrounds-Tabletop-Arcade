export const DIFFICULTY_PRESETS = {
  BEGINNER: {
    NAME: 'BEGINNER',
    COLOR:"#00ff00ff",
    MIN_BEAM_ENERGY: 50,
    MIN_CHARGE_ENERGY: 85,
    SHIELD_HP_THRESHOLD: 35,
    AGGRESSIVE_DISTANCE: 15,
    HUNT_THRESHOLD: 45,
    DEFENSE_THRESHOLD: 35,
    MINE_ARM_DISTANCE: 8,
    COMBO_COOLDOWN: 180,
    TACTICAL_PROBABILITY: 0.3,
    REACTION_INTERVAL: 20,
    MOVEMENT_ERROR_CHANCE: 0.25,
    HIGHSCORE_MULTIPLIER: 0.25
  },
  INTERMEDIATE: {
    NAME: 'INTERMEDIATE',
    COLOR:"#ffff00ff",
    MIN_BEAM_ENERGY: 35,
    MIN_CHARGE_ENERGY: 70,
    SHIELD_HP_THRESHOLD: 30,
    AGGRESSIVE_DISTANCE: 12,
    HUNT_THRESHOLD: 60,
    DEFENSE_THRESHOLD: 20,
    MINE_ARM_DISTANCE: 6,
    COMBO_COOLDOWN: 120,
    TACTICAL_PROBABILITY: 0.6,
    REACTION_INTERVAL: 10,
    MOVEMENT_ERROR_CHANCE: 0.05,
    HIGHSCORE_MULTIPLIER: 0.4
  },
  HARD: {
    NAME: 'HARD',
    COLOR:"#ff5100ff",
    MIN_BEAM_ENERGY: 25,
    MIN_CHARGE_ENERGY: 60,
    SHIELD_HP_THRESHOLD: 25,
    AGGRESSIVE_DISTANCE: 8,
    HUNT_THRESHOLD: 75,
    DEFENSE_THRESHOLD: 15,
    MINE_ARM_DISTANCE: 4,
    COMBO_COOLDOWN: 60,
    TACTICAL_PROBABILITY: 0.8,
    REACTION_INTERVAL: 4,
    MOVEMENT_ERROR_CHANCE: 0.0,
    HIGHSCORE_MULTIPLIER: 0.8
  },
  INSANE: {
    NAME: 'INSANE',
    COLOR:"#ff0000ff",
    MIN_BEAM_ENERGY: 15,
    MIN_CHARGE_ENERGY: 50,
    SHIELD_HP_THRESHOLD: 20,
    AGGRESSIVE_DISTANCE: 5,
    HUNT_THRESHOLD: 85,
    DEFENSE_THRESHOLD: 10,
    MINE_ARM_DISTANCE: 3,
    COMBO_COOLDOWN: 40,
    TACTICAL_PROBABILITY: 0.95,
    REACTION_INTERVAL: 0,
    MOVEMENT_ERROR_CHANCE: 0.0,
    HIGHSCORE_MULTIPLIER: 1
  },
  DYNAMIC: {
    NAME: 'DYNAMIC',
    COLOR:"#00c3ffff",
    HIGHSCORE_MULTIPLIER: 0.85
  }
};

export const TACTICAL_STYLES = {
  AGGRESSIVE: {
    NAME: 'AGGRESSIVE',
    MIN_BEAM_ENERGY: 20,
    MIN_CHARGE_ENERGY: 55,
    SHIELD_HP_THRESHOLD: 20,
    HUNT_THRESHOLD: 70,
    DEFENSE_THRESHOLD: 10,
    COMBO_PROBABILITY: 0.7,
  },
  DEFENSIVE: {
    NAME: 'DEFENSIVE',
    MIN_BEAM_ENERGY: 50,
    MIN_CHARGE_ENERGY: 80,
    SHIELD_HP_THRESHOLD: 40,
    HUNT_THRESHOLD: 40,
    DEFENSE_THRESHOLD: 30,
    COMBO_PROBABILITY: 0.2,
  },
  MINE_SPECIALIST: {
    NAME: 'MINE_SPECIALIST',
    MIN_BEAM_ENERGY: 40,
    MIN_CHARGE_ENERGY: 75,
    SHIELD_HP_THRESHOLD: 35,
    COMBO_PROBABILITY: 0.8,
    TRAP_SETUP_FREQUENCY: 0.6,
    MINE_PLACEMENT_DISTANCE: 5,
  },
  BEAM_MASTER: {
    NAME: 'BEAM_MASTER',
    MIN_BEAM_ENERGY: 45,
    MIN_CHARGE_ENERGY: 65,
    HUNT_THRESHOLD: 65,
    DEFENSE_THRESHOLD: 25,
    CHARGE_PATIENCE: 1000,
    BEAM_COOLDOWN_FRAMES: 120,
  },
  BALANCED: {
    NAME: 'BALANCED',
    MIN_BEAM_ENERGY: 35,
    MIN_CHARGE_ENERGY: 70,
    SHIELD_HP_THRESHOLD: 30,
    COMBO_PROBABILITY: 0.5,
    TRAP_SETUP_FREQUENCY: 0.4,
  },
};

export const DIFFICULTY_FEATURES = {
  BEGINNER: {
    ADVANCED_MINING_ENABLED: false,
    TACTICAL_CHARGING_ENABLED: false,
    SHIELD_CHANCE: 0.30,
    ADAPTIVE_DIFFICULTY_ENABLED: false,
    PREDICTIVE_MOVEMENT_ENABLED: false,
    COMBO_CHAINS_ENABLED: false,
    CORNER_CUT_DETECTION: false,
    RESOURCE_DENIAL_ENABLED: false,
    PREDICTION_WINDOW: 5,
    BASE_AGGRESSION: 0.15,
    AGGRESSION_SCALE_UP: 0.5,
    AGGRESSION_SCALE_DOWN: 0.8,
    MINE_STRATEGY: 'DEFENSIVE',
  },
  INTERMEDIATE: {
    ADVANCED_MINING_ENABLED: false,
    TACTICAL_CHARGING_ENABLED: false,
    SHIELD_CHANCE: 0.60,
    ADAPTIVE_DIFFICULTY_ENABLED: true,
    PREDICTIVE_MOVEMENT_ENABLED: false,
    COMBO_CHAINS_ENABLED: false,
    CORNER_CUT_DETECTION: true,
    RESOURCE_DENIAL_ENABLED: false,
    PREDICTION_WINDOW: 15,
    BASE_AGGRESSION: 0.35,
    AGGRESSION_SCALE_UP: 1,
    AGGRESSION_SCALE_DOWN: 0.4,
    MINE_STRATEGY: 'DEFENSIVE',
  },
  HARD: {
    ADVANCED_MINING_ENABLED: true,
    TACTICAL_CHARGING_ENABLED: true,
    SHIELD_CHANCE: 0.80,
    ADAPTIVE_DIFFICULTY_ENABLED: true,
    PREDICTIVE_MOVEMENT_ENABLED: true,
    COMBO_CHAINS_ENABLED: true,
    CORNER_CUT_DETECTION: true,
    RESOURCE_DENIAL_ENABLED: true,
    PREDICTION_WINDOW: 20,
    BASE_AGGRESSION: 0.75,
    AGGRESSION_SCALE_UP: 1.4,
    AGGRESSION_SCALE_DOWN: 0.3,
    MINE_STRATEGY: 'BALANCED',
  },
  INSANE: {
    ADVANCED_MINING_ENABLED: true,
    TACTICAL_CHARGING_ENABLED: true,
    SHIELD_CHANCE: 1,
    ADAPTIVE_DIFFICULTY_ENABLED: false,
    PREDICTIVE_MOVEMENT_ENABLED: true,
    COMBO_CHAINS_ENABLED: true,
    CORNER_CUT_DETECTION: true,
    RESOURCE_DENIAL_ENABLED: true,
    PREDICTION_WINDOW: 35,
    BASE_AGGRESSION: 0.98,
    AGGRESSION_SCALE_UP: 1.7,
    AGGRESSION_SCALE_DOWN: 0.2,
    MINE_STRATEGY: 'AGGRESSIVE',
  },
};

let activeConfig = { ...DIFFICULTY_PRESETS.INSANE };

export function getActiveConfig() {
  return activeConfig;
}

export function setActiveConfig(config) {
  activeConfig = config;
}

export function setDifficulty(difficulty = 'INTERMEDIATE', tacticalStyle = null) {
  const baseConfig = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.INTERMEDIATE;
  let styleConfig = {};

  if (tacticalStyle && TACTICAL_STYLES[tacticalStyle]) {
    styleConfig = TACTICAL_STYLES[tacticalStyle];
  }

  const features = DIFFICULTY_FEATURES[difficulty] || DIFFICULTY_FEATURES.INTERMEDIATE;

  let enhancedConfig = {
    ...baseConfig,
    ...styleConfig,
    ...features,
  };

  activeConfig = enhancedConfig;

  console.log(`AI Enhanced - Difficulty set to ${difficulty}`);
}

export function getDifficultyPreset(difficulty = 'INTERMEDIATE') {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.INTERMEDIATE;
}

export function adjustDifficultyDynamically(playerScore, cpuScore, currentConfig) {
  if (!currentConfig.ADAPTIVE_DIFFICULTY_ENABLED) return currentConfig;

  const scoreDiff = cpuScore - playerScore;

  if (scoreDiff <= -3) {
    console.log("Player crushing CPU - ramping up difficulty!");
    return {
      ...currentConfig,
      MIN_BEAM_ENERGY: Math.max(15, currentConfig.MIN_BEAM_ENERGY * 0.6),
      MIN_CHARGE_ENERGY: Math.max(50, currentConfig.MIN_CHARGE_ENERGY * 0.7),
      HUNT_THRESHOLD: 85,
      TACTICAL_PROBABILITY: Math.min(0.95, currentConfig.TACTICAL_PROBABILITY + 0.15),
    };
  }

  if (scoreDiff >= 3) {
    console.log("CPU crushing player - easing off slightly");
    return {
      ...currentConfig,
      MIN_BEAM_ENERGY: Math.min(50, currentConfig.MIN_BEAM_ENERGY * 1.3),
      MIN_CHARGE_ENERGY: Math.min(85, currentConfig.MIN_CHARGE_ENERGY * 1.2),
      HUNT_THRESHOLD: 40,
      TACTICAL_PROBABILITY: Math.max(0.5, currentConfig.TACTICAL_PROBABILITY - 0.1),
    };
  }

  return currentConfig;
}

export function getEnergyStrategy(player, opponent, currentConfig) {
  if (currentConfig.NAME === 'BEGINNER') return { shield: Math.random() > 0.9, boost: Math.random() > 0.9 };
  let dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);

  if (dist < 8 && player.boostEnergy > 30) return { shield: true, boost: false };
  if (player.boostEnergy > 65) return { shield: false, boost: true };
  if (player.boostEnergy < 35) return { shield: false, boost: false };

  return { shield: false, boost: Math.random() < 0.4 };
}

export function getDynamicDifficulty(playerScore, cpuScore, roundsPlayed) {
  const scoreDiff = cpuScore - playerScore;

  if (scoreDiff <= -2) {
    console.log("Player dominating - increasing CPU difficulty!");
    return DIFFICULTY_PRESETS.HARD;
  }

  if (scoreDiff >= 2) {
    console.log("CPU dominating - decreasing difficulty for fun!");
    return DIFFICULTY_PRESETS.BEGINNER;
  }

  return DIFFICULTY_PRESETS.INTERMEDIATE;
}

export function getPersonality(personalityType = 'random') {
  const personalities = {
    AGGRESSIVE: {
      ...DIFFICULTY_PRESETS.HARD,
      ...TACTICAL_STYLES.AGGRESSIVE,
      personality: "AGGRESSIVE - Hunting you down!",
    },
    DEFENSIVE: {
      ...DIFFICULTY_PRESETS.INTERMEDIATE,
      ...TACTICAL_STYLES.DEFENSIVE,
      personality: "DEFENSIVE - Playing it safe!",
    },
    CLEVER: {
      ...DIFFICULTY_PRESETS.HARD,
      ...TACTICAL_STYLES.MINE_SPECIALIST,
      personality: "CLEVER - Setting traps!",
    },
    PRECISE: {
      ...DIFFICULTY_PRESETS.INTERMEDIATE,
      ...TACTICAL_STYLES.BEAM_MASTER,
      personality: "PRECISE - Aiming for headshots!",
    },
    BALANCED: {
      ...DIFFICULTY_PRESETS.INTERMEDIATE,
      ...TACTICAL_STYLES.BALANCED,
      personality: "BALANCED - Well-rounded!",
    },
  };

  if (personalityType === 'random') {
    const keys = Object.keys(personalities);
    personalityType = keys[Math.floor(Math.random() * keys.length)];
  }

  return personalities[personalityType] || personalities.BALANCED;
}

setDifficulty('INTERMEDIATE');
