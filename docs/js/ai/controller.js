import { CONFIG, TIMING } from '../config.js';
import { STATE } from '../state.js';
import { hasLineOfSight } from '../grid.js';
import { findPathToTarget, isPlayerStuck, getUnstuckDirection } from './pathfinding.js';
import { decideStrategy, shouldExecuteCombo } from './strategy.js';
import { shouldChargeBeam, shouldFireBeamBasic, shouldDetonateNearbyMines, calculateAdvancedMinePositions, isOpponentAimingAtMe, getDodgeDirection, recordMinePlacement } from './combat.js';
import { getActiveConfig, adjustDifficultyDynamically, getEnergyStrategy } from './difficulty.js';

/**
 * Unified shield decision function
 * Consolidates all shield activation logic into single priority-based check
 * @param {Object} player - AI player
 * @param {Object} opponent - Opponent player
 * @param {Object} currentConfig - AI difficulty configuration
 * @param {Object} context - Additional context (threatAssessment, dangerLevel, etc.)
 * @returns {boolean} True if shield should be activated
 */
function shouldActivateShield(player, opponent, currentConfig, context = {}) {
  // No energy for shield
  if (player.boostEnergy < 15) {
    return false;
  }

  const { threatAssessment, dangerLevel = 0 } = context;

  // Priority 1: Immediate beam threat (urgency > 0.7)
  if (threatAssessment && threatAssessment.danger && threatAssessment.urgency > 0.7) {
    return true;
  }

  // Priority 2: Mine trap danger (dangerLevel > 2.5)
  if (dangerLevel > 2.5 && player.boostEnergy > 20) {
    return true;
  }

  // Priority 3: Predictive shielding (HARD+ only)
  if (currentConfig.NAME === 'HARD' || currentConfig.NAME === 'INSANE') {
    const dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);
    const enemyHasEnergy = opponent.boostEnergy >= 30;

    // Only check alignment if basic conditions are met (avoid expensive LoS check)
    if (enemyHasEnergy && dist < 20 && player.boostEnergy > 20) {
      const playerCenterX = player.x + player.size / 2;
      const playerCenterY = player.y + player.size / 2;
      const oppCenterX = opponent.x + opponent.size / 2;
      const oppCenterY = opponent.y + opponent.size / 2;
      const dx = Math.abs(playerCenterX - oppCenterX);
      const dy = Math.abs(playerCenterY - oppCenterY);
      const isAligned = dx < 3 || dy < 3;

      if (isAligned && hasLineOfSight(oppCenterX, oppCenterY, playerCenterX, playerCenterY)) {
        // Enemy can hit us - probabilistic preemptive shield
        const shieldChance = currentConfig.SHIELD_CHANCE || 0.5;
        return Math.random() < shieldChance * 0.7;
      }
    }
  }

  return false;
}

/**
 * Track opponent behavior patterns over time
 * Used to predict and counter opponent strategies
 * @param {Object} player - AI player (stores tracking data)
 * @param {Object} opponent - Opponent to track
 */
function trackOpponentBehavior(player, opponent) {
  if (!player.opponentProfile) {
    player.opponentProfile = {
      beamsFired: 0,
      beamsHit: 0,
      shieldUsage: 0,
      boostUsage: 0,
      avgDistanceKept: 0,
      distanceSamples: 0,
      favoredDirection: null,
      directionCounts: { up: 0, down: 0, left: 0, right: 0 },
      lastBeamFrame: 0,
      beamCooldownPattern: []
    };
  }

  const profile = player.opponentProfile;

  // Track distance preference
  const dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);
  profile.avgDistanceKept = (profile.avgDistanceKept * profile.distanceSamples + dist) / (profile.distanceSamples + 1);
  profile.distanceSamples++;

  // Track movement direction preference
  if (opponent.lastDir) {
    if (Math.abs(opponent.lastDir.x) > Math.abs(opponent.lastDir.y)) {
      if (opponent.lastDir.x > 0) profile.directionCounts.right++;
      else profile.directionCounts.left++;
    } else if (Math.abs(opponent.lastDir.y) > 0) {
      if (opponent.lastDir.y > 0) profile.directionCounts.down++;
      else profile.directionCounts.up++;
    }

    // Update favored direction
    const counts = profile.directionCounts;
    const maxDir = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    if (counts[maxDir] > 20) {
      profile.favoredDirection = maxDir;
    }
  }

  // Track shield usage
  if (opponent.shieldActive) {
    profile.shieldUsage++;
  }
}

/**
 * Get prediction data from opponent profile for use in combat/strategy decisions
 * @param {Object} player - AI player with opponentProfile
 * @param {Object} opponent - Opponent player
 * @returns {Object|null} Prediction data or null if not enough samples
 */
export function getOpponentPrediction(player, opponent) {
  const profile = player.opponentProfile;
  if (!profile || profile.distanceSamples < 30) {
    return null; // Not enough data
  }

  return {
    preferredDirection: profile.favoredDirection,
    preferredDistance: profile.avgDistanceKept,
    shieldProbability: profile.shieldUsage / profile.distanceSamples,
    directionWeights: profile.directionCounts
  };
}

/**
 * Validate if combo conditions are still met (mid-combo validation)
 * @param {Object} combo - Active combo object
 * @param {Object} player - AI player
 * @param {Object} opponent - Opponent player
 * @returns {boolean} True if combo should continue
 */
function validateComboConditions(combo, player, opponent) {
  if (!combo || !combo.type) return false;

  const stunTime = opponent.stunRemaining(STATE.frameCount);
  const glitchTime = opponent.glitchRemaining(STATE.frameCount);
  const dist = Math.hypot(player.x - opponent.x, player.y - opponent.y);

  switch (combo.type) {
    case 'STUN_EXECUTE_CLOSE':
    case 'STUN_EXECUTE_FIRE':
    case 'STUN_CHARGE':
      return stunTime > 10; // Still stunned with some margin
    case 'GLITCH_HUNT':
    case 'GLITCH_APPROACH':
    case 'GLITCH_EXECUTE':
      return glitchTime > 30; // Still glitched
    case 'BOOST_HUNT':
      return dist > 15; // Still far enough to need boost
    case 'SHIELD_BAIT':
      return dist < 12 && player.boostEnergy > 10; // Still close and can shield
    default:
      return true;
  }
}

/**
 * Check if player is aligned with opponent (can hit with beam)
 * @param {Object} player - AI player
 * @param {Object} opponent - Opponent player
 * @returns {boolean} True if aligned horizontally or vertically
 */
function isAlignedWithOpponent(player, opponent) {
  const dx = Math.abs((player.x + player.size/2) - (opponent.x + opponent.size/2));
  const dy = Math.abs((player.y + player.size/2) - (opponent.y + opponent.size/2));
  return dx < 3 || dy < 3;
}

/**
 * Calculate movement direction toward target using pathfinding
 * Includes human error simulation for more realistic AI behavior
 * @param {Object} player - AI player object
 * @param {Object} target - Target position {x, y}
 * @param {Object} currentConfig - AI difficulty configuration
 * @returns {{dx: number, dy: number}} Movement vector
 */
function getSmartMovementDirection(player, target, currentConfig) {
  // Safety check for target
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
    return { dx: 0, dy: 0 };
  }

  // 1. HUMAN ERROR SIMULATION
  if (player.confusionTimer > 0) {
    player.confusionTimer--;
    if (player.confusedDir) return player.confusedDir;
  }

  // Roll for error (only if not already confused)
  if (currentConfig.MOVEMENT_ERROR_CHANCE > 0 && Math.random() < currentConfig.MOVEMENT_ERROR_CHANCE * 0.1) {
     player.confusionTimer = Math.floor(Math.random() * 10) + 5;
     let dirs = [{dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}];
     player.confusedDir = dirs[Math.floor(Math.random() * dirs.length)];
     player.confusedDir.dx *= CONFIG.BASE_SPEED;
     player.confusedDir.dy *= CONFIG.BASE_SPEED;
     return player.confusedDir;
  }

  // 2. STANDARD PATHFINDING
  let path = findPathToTarget(player, target.x, target.y);

  let dxRaw = target.x - player.x;
  let dyRaw = target.y - player.y;

  // Direct line if very close
  if (Math.hypot(dxRaw, dyRaw) < CONFIG.CELL_SIZE * 1.5) {
    let dist = Math.hypot(dxRaw, dyRaw);
    if (dist < 0.5) return { dx: 0, dy: 0 };
    return { dx: (dxRaw / dist) * CONFIG.BASE_SPEED, dy: (dyRaw / dist) * CONFIG.BASE_SPEED };
  }

  if (path.length < 2) return { dx: 0, dy: 0 };

  let targetIndex = 1;
  if (path.length > 2) {
    let c1 = path[1];
    let p1x = CONFIG.MAZE_OFFSET_X + c1.c * CONFIG.CELL_SIZE + 1.5;
    let p1y = c1.r * CONFIG.CELL_SIZE + 1.5;

    if (Math.hypot(p1x - player.x, p1y - player.y) < 2.5) {
      targetIndex = 2;
    }
  }

  let nextCell = path[targetIndex];
  let tx = CONFIG.MAZE_OFFSET_X + (nextCell.c * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let ty = (nextCell.r * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

  let dx = tx - (player.x + player.size / 2);
  let dy = ty - (player.y + player.size / 2);
  let dist = Math.hypot(dx, dy);

  if (dist < 0.1) return { dx: 0, dy: 0 };
  return { dx: (dx / dist) * CONFIG.BASE_SPEED, dy: (dy / dist) * CONFIG.BASE_SPEED };
}

/**
 * Generate AI input commands for a CPU-controlled player
 * Main entry point for AI decision making
 * @param {Object} player - AI player object
 * @param {Object} opponent - Human/other player object
 * @returns {Object} Input command object with movement and action flags
 */
export function getCpuInput(player, opponent) {
  let cmd = {
    up: false, down: false, left: false, right: false,
    boost: false, beam: false, shield: false, mine: false, boom: false, start: false
  };

  if (!player || !opponent) return cmd;

  // --- 0. CONFIG LOADING ---
  let currentConfig = getActiveConfig();

  if (currentConfig.ADAPTIVE_DIFFICULTY_ENABLED) {
    currentConfig = adjustDifficultyDynamically(player.score, opponent.score, currentConfig);
  }

  // --- 1. STUCK DETECTION ---
  if (isPlayerStuck(player)) {
    player.stuckCounter = (player.stuckCounter || 0) + 1;
    if (player.stuckCounter > 15) {
      player.unstuckDir = getUnstuckDirection(player);
      player.forceUnstuckTimer = 30;
      player.stuckCounter = 0;
    }
  } else {
    player.stuckCounter = 0;
  }

  if (player.forceUnstuckTimer > 0) {
    player.forceUnstuckTimer--;
    let dir = player.unstuckDir || { x: 0, y: 0 };
    if (dir.x < 0) cmd.left = true;
    if (dir.x > 0) cmd.right = true;
    if (dir.y < 0) cmd.up = true;
    if (dir.y > 0) cmd.down = true;
    return cmd;
  }

  // --- 2. REACTION LATENCY ---
  if (!player.aiMentalModel) {
      player.aiMentalModel = {
          strategy: null,
          moveDir: { dx: 0, dy: 0 },
          energyStrat: { shield: false, boost: false },
          combo: null,
          lastThinkTime: 0
      };
  }

  player.aiFrameCounter = (player.aiFrameCounter || 0) + 1;

  const shouldThink = player.aiFrameCounter % (currentConfig.REACTION_INTERVAL || 1) === 0;

  if (shouldThink) {
      // Track opponent behavior for pattern recognition
      trackOpponentBehavior(player, opponent);

      // Get opponent prediction data for use in decisions
      const opponentPrediction = getOpponentPrediction(player, opponent);
      player.aiMentalModel.opponentPrediction = opponentPrediction;

      // A. Decide High-Level Strategy
      player.aiMentalModel.strategy = decideStrategy(player, opponent, currentConfig, opponentPrediction);

      // Pre-calculate alignment for threat context (used by energy strategy)
      const preAligned = isAlignedWithOpponent(player, opponent);

      // B. Decide Energy Usage (will be updated with full threat context after tactical adjustments)
      // Initial pass without full threat context
      player.aiMentalModel.energyStrat = { shield: false, boost: false };

      // B2. Check for Combo Opportunities
      player.aiMentalModel.combo = shouldExecuteCombo(player, opponent, currentConfig);

      // C. Calculate Pathfinding Vector
      player.aiMentalModel.moveDir = getSmartMovementDirection(player, player.aiMentalModel.strategy, currentConfig);

      // D. Beam Dodge Logic - Detect if opponent is aiming at us (HARD+ only)
      let threatAssessment = null;
      if (currentConfig.NAME === 'HARD' || currentConfig.NAME === 'INSANE') {
        threatAssessment = isOpponentAimingAtMe(player, opponent);
        if (threatAssessment.danger && threatAssessment.urgency > 0.3) {
          player.aiMentalModel.incomingThreat = threatAssessment;

          // Medium threat - try to dodge (wall-aware for HARD+)
          if (threatAssessment.urgency > 0.4 && threatAssessment.urgency <= 0.7) {
            const useWallAware = currentConfig.DODGE_WALL_AWARE || false;
            const dodgeDir = getDodgeDirection(threatAssessment.direction, player, useWallAware);
            player.aiMentalModel.moveDir.dx += dodgeDir.dx * CONFIG.BASE_SPEED * 1.5;
            player.aiMentalModel.moveDir.dy += dodgeDir.dy * CONFIG.BASE_SPEED * 1.5;

            // Also boost if available for faster dodge
            if (player.boostEnergy > 40) {
              player.aiMentalModel.energyStrat.boost = true;
            }
          }
        } else {
          player.aiMentalModel.incomingThreat = null;
        }
      }

      // E. Tactical Adjustments (Mine avoidance and escape)
      let nearbyMines = [];
      let dangerLevel = 0;
      const mineDetectRadius = currentConfig.MINE_DETECT_RADIUS || 8;

      STATE.mines.forEach(mine => {
        let dist = Math.hypot(mine.x - player.x, mine.y - player.y);
        if (dist < mineDetectRadius) {
          nearbyMines.push({ mine, dist });
          // Closer mines are more dangerous
          dangerLevel += (mineDetectRadius - dist) / mineDetectRadius;
        }
      });

      // Calculate escape vector
      let escapeX = 0;
      let escapeY = 0;
      nearbyMines.forEach(({ mine, dist }) => {
        let pushX = player.x - mine.x;
        let pushY = player.y - mine.y;
        let pushDist = Math.hypot(pushX, pushY);
        if (pushDist > 0.1) {
          // Stronger push for closer mines
          let pushStrength = (mineDetectRadius - dist) / dist;
          escapeX += (pushX / pushDist) * pushStrength;
          escapeY += (pushY / pushDist) * pushStrength;
        }
      });

      // Apply escape vector with increased urgency based on danger
      if (nearbyMines.length > 0) {
        // INSANE AI reacts more strongly to mines
        const escapeMultiplier = currentConfig.NAME === 'INSANE' ? 2.5 : 1.5;
        const escapeMax = currentConfig.NAME === 'INSANE' ? 6 : 4;
        let escapeStrength = Math.min(dangerLevel * escapeMultiplier, escapeMax);
        player.aiMentalModel.moveDir.dx += escapeX * escapeStrength;
        player.aiMentalModel.moveDir.dy += escapeY * escapeStrength;

        // If trapped by multiple mines (high danger), use defensive measures
        const dangerThreshold = currentConfig.NAME === 'INSANE' ? 1.0 : 1.5;
        if (dangerLevel > dangerThreshold) {
          player.aiMentalModel.mineTrapDanger = true;
          // Boost to escape faster if possible
          if (player.boostEnergy > 20) {
            player.aiMentalModel.energyStrat.boost = true;
          }
        } else {
          player.aiMentalModel.mineTrapDanger = false;
        }
      }

      // F. Threat-aware Energy Strategy - Pass full threat context
      const isAligned = isAlignedWithOpponent(player, opponent);
      player.aiMentalModel.energyStrat = getEnergyStrategy(player, opponent, currentConfig, {
        incomingThreat: player.aiMentalModel.incomingThreat,
        dangerLevel: dangerLevel,
        isAligned: isAligned
      });

      // G. Unified Shield Decision - Additional shield check for urgent threats
      if (!player.aiMentalModel.energyStrat.shield) {
        player.aiMentalModel.energyStrat.shield = shouldActivateShield(
          player, opponent, currentConfig,
          { threatAssessment, dangerLevel }
        );
      }

      // H. Sudden Death Urgency - Move faster when time is critical
      if (STATE.gameTime < TIMING.SUDDEN_DEATH_TIME && player.aiMentalModel.strategy?.urgent) {
        // Boost more aggressively in sudden death
        if (player.boostEnergy > 25) {
          player.aiMentalModel.energyStrat.boost = true;
        }
      }

      // I. INSANE Aggression - Always boost when pursuing, intercepting, or rushing
      if (currentConfig.NAME === 'INSANE') {
        const stratType = player.aiMentalModel.strategy?.type;
        const isAggressive = ['HUNT', 'INTERCEPT', 'BLOCK_GOAL', 'EXECUTE', 'GOAL_RUSH'].includes(stratType);
        if (isAggressive && player.boostEnergy > 20) {
          player.aiMentalModel.energyStrat.boost = true;
        }
      }

      // J. Goal Rush Boost - All difficulties boost when rushing to goal with advantage
      if (player.aiMentalModel.strategy?.type === 'GOAL_RUSH' && player.boostEnergy > 30) {
        player.aiMentalModel.energyStrat.boost = true;
      }
  }

  // --- 3. EXECUTION PHASE ---
  let moveDir = player.aiMentalModel.moveDir;
  let energyStrat = player.aiMentalModel.energyStrat;
  let strategy = player.aiMentalModel.strategy;
  let combo = player.aiMentalModel.combo;

  const DEADZONE = 0.05;
  if (Math.abs(moveDir.dx) > DEADZONE) {
    cmd.left = moveDir.dx < 0;
    cmd.right = moveDir.dx > 0;
  }
  if (Math.abs(moveDir.dy) > DEADZONE) {
    cmd.up = moveDir.dy < 0;
    cmd.down = moveDir.dy > 0;
  }

  // Execute Combo if active (high priority) with mid-combo validation
  if (combo && combo.actions) {
    // Re-validate combo conditions
    const stillValid = validateComboConditions(combo, player, opponent);

    if (!stillValid) {
      // Abort combo, try immediate action instead
      player.aiMentalModel.combo = null;
      combo = null;

      // If we were charging, fire immediately if aligned
      if (combo?.type?.includes('CHARGE') || combo?.type?.includes('EXECUTE')) {
        const aligned = isAlignedWithOpponent(player, opponent);
        if (aligned && player.boostEnergy > 30) {
          cmd.beam = true; // Fire immediately instead of continuing charge
        }
      }
    } else {
      // Original combo execution
      for (let action of combo.actions) {
        switch (action) {
          case 'charge_beam':
            // Hold beam for charged shot when opponent is stunned
            cmd.beam = true;
            break;
          case 'boost':
            cmd.boost = true;
            break;
          case 'shield':
            cmd.shield = true;
            break;
        }
      }
    }
  }

  // Actions (Shield/Boost) - only if not overridden by combo
  if (!combo) {
    if (energyStrat.shield && Math.random() <= currentConfig.SHIELD_CHANCE) cmd.shield = true;
    const minBoostEnergy = currentConfig.MIN_BOOST_ENERGY || 25;
    if (player.boostEnergy > minBoostEnergy && energyStrat.boost) cmd.boost = true;
  }

  if (shouldDetonateNearbyMines(player, opponent)) cmd.boom = true;

  // Beam Logic (only if combo doesn't override)
  if (!combo && player.boostEnergy > currentConfig.MIN_BEAM_ENERGY) {
    let shouldFire = false;
    const opponentPrediction = player.aiMentalModel.opponentPrediction;
    if (currentConfig.TACTICAL_CHARGING_ENABLED && strategy?.canCharge) {
      shouldFire = shouldChargeBeam(player, opponent, currentConfig);
    } else {
      // Use distance-based firing probability if enabled
      const useDistanceCheck = currentConfig.DISTANCE_BEAM_FIRING || false;
      shouldFire = shouldFireBeamBasic(player, opponent, useDistanceCheck, opponentPrediction, currentConfig);
    }

    // INSANE: Pressure firing when energy is high - fire more aggressively
    if (!shouldFire && currentConfig.NAME === 'INSANE' && player.boostEnergy > 70) {
      // Check if roughly aligned (within 8 pixels) and has line of sight
      const playerCX = player.x + player.size / 2;
      const playerCY = player.y + player.size / 2;
      const oppCX = opponent.x + opponent.size / 2;
      const oppCY = opponent.y + opponent.size / 2;
      const dx = Math.abs(playerCX - oppCX);
      const dy = Math.abs(playerCY - oppCY);
      if ((dx < 8 || dy < 8) && hasLineOfSight(playerCX, playerCY, oppCX, oppCY)) {
        shouldFire = Math.random() < 0.5; // 50% chance to pressure fire
      }
    }

    // INSANE has no random miss, others have 5% miss chance
    const fireChance = currentConfig.NAME === 'INSANE' ? 1.0 : 0.95;
    if (shouldFire && Math.random() < fireChance) cmd.beam = true;
  }

  // Mine Drop Logic
  let distToEnemy = Math.hypot(player.x - opponent.x, player.y - opponent.y);
  if (player.minesLeft > 0 && distToEnemy < 8.0 && Math.random() < 0.25) {
    cmd.mine = true;
  }

  // Advanced Mine Logic
  if (cmd.mine && currentConfig.ADVANCED_MINING_ENABLED) {
    let strategicPos = calculateAdvancedMinePositions(player, opponent, currentConfig);
    player._suggestedMinePos = strategicPos;
  }

  // Record mine placement for density tracking
  if (cmd.mine) {
    recordMinePlacement(player, player.x, player.y, STATE.frameCount);
  }

  // Update State for next frame
  player.lastPos = { x: player.x, y: player.y };

  return cmd;
}
