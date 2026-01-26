/**
 * AI CONFIGURATION PRESETS
 * Pre-built difficulty profiles and tactical strategies
 * Use these to quickly adjust AI behavior without deep code diving
 */

// ============================================================
// DIFFICULTY PRESETS
// ============================================================

export const DIFFICULTY_PRESETS = {

  /**
   * BEGINNER - CPU plays carefully, makes mistakes
   * Best for: Learning the game, casual play
   */
  BEGINNER: {
    NAME: 'BEGINNER', 
    COLOR:"#00ff00ff",
    MIN_BEAM_ENERGY: 50,              // Rarely spams beams
    MIN_CHARGE_ENERGY: 85,            // Rarely charged beams
    SHIELD_HP_THRESHOLD: 35,          // Shields early (wastes energy)
    AGGRESSIVE_DISTANCE: 15,          // Keeps distance
    HUNT_THRESHOLD: 45,               // Hesitant to hunt
    DEFENSE_THRESHOLD: 35,            // Retreats often
    MINE_ARM_DISTANCE: 8,             // Mines placed far out
    COMBO_COOLDOWN: 180,              // Almost never combos
    TACTICAL_PROBABILITY: 0.3,        // Simple decision making
    REACTION_INTERVAL: 20,      // "Thinks" only 3 times per second (60fps/20)
    MOVEMENT_ERROR_CHANCE: 0.25, // 25% chance to move randomly instead of smartly},
    HIGHSCORE_MULTIPLIER: 0.25
  },
  /**
   * INTERMEDIATE - CPU plays smart and aggressive
   * Best for: Competitive play, standard difficulty
   */
  INTERMEDIATE: {
    NAME: 'INTERMEDIATE', 
    COLOR:"#ffff00ff" ,
    MIN_BEAM_ENERGY: 35,              // Regular beam attacks
    MIN_CHARGE_ENERGY: 70,            // Opportunistic charges
    SHIELD_HP_THRESHOLD: 30,          // Shields when threatened
    AGGRESSIVE_DISTANCE: 12,          // Medium engagement range
    HUNT_THRESHOLD: 60,               // Hunts when winning
    DEFENSE_THRESHOLD: 20,            // Retreats when desperate
    MINE_ARM_DISTANCE: 6,             // Strategic mine placement
    COMBO_COOLDOWN: 120,              // Occasional combos
    TACTICAL_PROBABILITY: 0.6,        // Adaptive tactics
    REACTION_INTERVAL: 10,       // "Thinks" 6 times per second
    MOVEMENT_ERROR_CHANCE: 0.05, // 5% chance to slip up},
    HIGHSCORE_MULTIPLIER: 0.4
  },
  /**
   * HARD - CPU plays like a pro player
   * Best for: Skilled players, arcade mode
   */
  HARD: {
    NAME: 'HARD', 
    COLOR:"#ff5100ff",
    MIN_BEAM_ENERGY: 25,              // Aggressive beam spam
    MIN_CHARGE_ENERGY: 60,            // Frequent charged beams
    SHIELD_HP_THRESHOLD: 25,          // Shields only when critical
    AGGRESSIVE_DISTANCE: 8,           // Closes distance fast
    HUNT_THRESHOLD: 75,               // Hunts relentlessly
    DEFENSE_THRESHOLD: 15,            // Doesn't retreat easily
    MINE_ARM_DISTANCE: 4,             // Precision mine placement
    COMBO_COOLDOWN: 60,               // Frequent combos
    TACTICAL_PROBABILITY: 0.8,        // Advanced tactics
    REACTION_INTERVAL: 4,       // Very fast updates
    MOVEMENT_ERROR_CHANCE: 0.0, // Precision movement},
    HIGHSCORE_MULTIPLIER: 0.8
  },
  /**
   * INSANE - CPU plays perfectly (almost cheating)
   * Best for: Extreme challenge, show-off AI
   */
  INSANE: {
    NAME: 'INSANE', 
    COLOR:"#ff0000ff",
    MIN_BEAM_ENERGY: 15,              // Beam spam at all times
    MIN_CHARGE_ENERGY: 50,            // Charged beams constantly
    SHIELD_HP_THRESHOLD: 20,          // Almost never shields
    AGGRESSIVE_DISTANCE: 5,           // Always in melee range
    HUNT_THRESHOLD: 85,               // Hunts at all times
    DEFENSE_THRESHOLD: 10,            // Never retreats
    MINE_ARM_DISTANCE: 3,             // Perfect mine placement
    COMBO_COOLDOWN: 40,               // Combo spam
    TACTICAL_PROBABILITY: 0.95,       // Perfect decision making
    REACTION_INTERVAL: 0,       // Thinks every single frame (God mode)
    MOVEMENT_ERROR_CHANCE: 0.0,
    HIGHSCORE_MULTIPLIER: 1
  },
  DYNAMIC: {
    NAME: 'DYNAMIC', 
    COLOR:"#00c3ffff",
    HIGHSCORE_MULTIPLIER: 0.85  
  }
};

// ============================================================
// TACTICAL SPECIALIZATIONS
// ============================================================

/**
 * Customize AI behavior around specific tactics
 * Mix and match with difficulty presets
 */
export const TACTICAL_STYLES = {

  /**
   * AGGRESSIVE - Focus on hunting and beams
   * Sacrifices defense for offense
   */
  AGGRESSIVE: {
    NAME: 'AGGRESSIVE',
    MIN_BEAM_ENERGY: 20,
    MIN_CHARGE_ENERGY: 55,
    SHIELD_HP_THRESHOLD: 20,
    HUNT_THRESHOLD: 70,
    DEFENSE_THRESHOLD: 10,
    COMBO_PROBABILITY: 0.7,
  },

  /**
   * DEFENSIVE - Focus on survival and shields
   * Prioritizes not dying over killing
   */
  DEFENSIVE: {
    NAME: 'DEFENSIVE',
    MIN_BEAM_ENERGY: 50,
    MIN_CHARGE_ENERGY: 80,
    SHIELD_HP_THRESHOLD: 40,
    HUNT_THRESHOLD: 40,
    DEFENSE_THRESHOLD: 30,
    COMBO_PROBABILITY: 0.2,
  },

  /**
   * MINE_SPECIALIST - Focus on traps and combos
   * Prefers tactical plays over direct combat
   */
  MINE_SPECIALIST: {
    NAME: 'MINE_SPECIALIST',
    MIN_BEAM_ENERGY: 40,
    MIN_CHARGE_ENERGY: 75,
    SHIELD_HP_THRESHOLD: 35,
    COMBO_PROBABILITY: 0.8,
    TRAP_SETUP_FREQUENCY: 0.6,
    MINE_PLACEMENT_DISTANCE: 5,
  },

  /**
   * BEAM_MASTER - Focus on charged attacks
   * Waits for perfect moments to fire devastating beams
   */
  BEAM_MASTER: {
    NAME: 'BEAM_MASTER',
    MIN_BEAM_ENERGY: 45,
    MIN_CHARGE_ENERGY: 65,
    HUNT_THRESHOLD: 65,
    DEFENSE_THRESHOLD: 25,
    CHARGE_PATIENCE: 1000,  // Hold beam longer
    BEAM_COOLDOWN_FRAMES: 120,
  },

  /**
   * BALANCED - Mix of all tactics
   * Good all-rounder, no weaknesses
   */
  BALANCED: {
    NAME: 'BALANCED',
    MIN_BEAM_ENERGY: 35,
    MIN_CHARGE_ENERGY: 70,
    SHIELD_HP_THRESHOLD: 30,
    COMBO_PROBABILITY: 0.5,
    TRAP_SETUP_FREQUENCY: 0.4,
  },
};

// ============================================================
// HOW TO USE THESE PRESETS
// ============================================================

/**
 * In your ai_enhanced.js, replace AI_CONFIG with a preset:
 * 
 * // OPTION 1: Import and use directly
 * import { DIFFICULTY_PRESETS } from './ai_config_presets.js';
 * const AI_CONFIG = DIFFICULTY_PRESETS.HARD;
 * 
 * // OPTION 2: Mix difficulty + tactical style
 * const AI_CONFIG = {
 *   ...DIFFICULTY_PRESETS.INTERMEDIATE,
 *   ...TACTICAL_STYLES.MINE_SPECIALIST,
 * };
 * 
 * // OPTION 3: Dynamic difficulty (based on player performance)
 * function selectDifficulty(playerScore, cpuScore) {
 *   if (playerScore > cpuScore + 2) return DIFFICULTY_PRESETS.HARD;
 *   if (playerScore < cpuScore - 2) return DIFFICULTY_PRESETS.BEGINNER;
 *   return DIFFICULTY_PRESETS.INTERMEDIATE;
 * }
 */

// ============================================================
// QUICK REFERENCE COMPARISON
// ============================================================

/**
 * Difficulty Comparison Chart
 * 
 * | Aspect | BEGINNER | INTERMEDIATE | HARD | INSANE |
 * |--------|----------|--------------|------|--------|
 * | Beam Frequency | Low | Medium | High | Constant |
 * | Charged Beams | Rare | Opportunistic | Frequent | Constant |
 * | Shield Usage | High | Medium | Low | Minimal |
 * | Aggression | Low | Medium | High | Max |
 * | Mine Usage | Defensive | Mixed | Aggressive | Combo-Spam |
 * | Goal Rushing | Rare | Occasional | Frequent | Always |
 * | Recovery Time | Long | Medium | Short | None |
 * | Tactical Depth | Simple | Mixed | Advanced | Perfect |
 * | Skill Required | Beginner | Intermediate | Advanced | Extreme |
 */

// ============================================================
// ADVANCED: DYNAMIC DIFFICULTY
// ============================================================

/**
 * Automatically adjust CPU difficulty based on player performance
 * Call this at the start of each round to recalibrate
 */
export function getDynamicDifficulty(playerScore, cpuScore, roundsPlayed) {
  const scoreDiff = cpuScore - playerScore;

  // Player is crushing the CPU (2+ points behind)
  if (scoreDiff <= -2) {
    console.log("🔥 Player dominating - increasing CPU difficulty!");
    return DIFFICULTY_PRESETS.HARD;
  }

  // Player is losing badly (2+ points ahead)
  if (scoreDiff >= 2) {
    console.log("😅 CPU dominating - decreasing difficulty for fun!");
    return DIFFICULTY_PRESETS.BEGINNER;
  }

  // Close match - keep it balanced
  return DIFFICULTY_PRESETS.INTERMEDIATE;
}

/**
 * Personality-based difficulty
 * Creates different "opponent personalities" for variety
 */
export function getPersonality(personalityType = 'random') {
  const personalities = {
    AGGRESSIVE: {
      ...DIFFICULTY_PRESETS.HARD,
      ...TACTICAL_STYLES.AGGRESSIVE,
      personality: "🔥 AGGRESSIVE - Hunting you down!",
    },
    DEFENSIVE: {
      ...DIFFICULTY_PRESETS.INTERMEDIATE,
      ...TACTICAL_STYLES.DEFENSIVE,
      personality: "🛡️ DEFENSIVE - Playing it safe!",
    },
    CLEVER: {
      ...DIFFICULTY_PRESETS.HARD,
      ...TACTICAL_STYLES.MINE_SPECIALIST,
      personality: "🧠 CLEVER - Setting traps!",
    },
    PRECISE: {
      ...DIFFICULTY_PRESETS.INTERMEDIATE,
      ...TACTICAL_STYLES.BEAM_MASTER,
      personality: "🎯 PRECISE - Aiming for headshots!",
    },
    BALANCED: {
      ...DIFFICULTY_PRESETS.INTERMEDIATE,
      ...TACTICAL_STYLES.BALANCED,
      personality: "⚡ BALANCED - Well-rounded!",
    },
  };

  if (personalityType === 'random') {
    const keys = Object.keys(personalities);
    personalityType = keys[Math.floor(Math.random() * keys.length)];
  }

  return personalities[personalityType] || personalities.BALANCED;
}

// ============================================================
// EXAMPLE USAGE IN GAME SETUP
// ============================================================

/**
 * In your game initialization (main.js or state.js):
 * 
 * // Get difficulty based on game mode
 * function initializeGame(gameMode) {
 *   let difficultyConfig;
 *   
 *   switch(gameMode) {
 *     case 'PRACTICE':
 *       difficultyConfig = DIFFICULTY_PRESETS.BEGINNER;
 *       break;
 *     case 'ARCADE':
 *       difficultyConfig = DIFFICULTY_PRESETS.HARD;
 *       break;
 *     case 'CHAMPIONSHIP':
 *       difficultyConfig = DIFFICULTY_PRESETS.INSANE;
 *       break;
 *     default:
 *       difficultyConfig = getDynamicDifficulty(
 *         STATE.players[0].score,
 *         STATE.players[1].score,
 *         STATE.roundNumber
 *       );
 *   }
 *   
 *   // Apply config to AI
 *   window.AI_CONFIG = difficultyConfig;
 * }
 */
