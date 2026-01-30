import { CONFIG, TIMING } from '../config.js';
import { STATE } from '../state.js';
import { hasLineOfSight } from '../grid.js';

/**
 * Check if using a portal would help reach the goal faster
 * Thresholds adjusted based on difficulty level
 * @param {Object} player - AI player
 * @param {number} goalX - Goal X position
 * @param {number} goalY - Goal Y position
 * @param {Object} currentConfig - AI difficulty configuration (optional)
 * @returns {{usePortal: boolean, portal: Object|null, benefit: number}} Portal recommendation
 */
function evaluatePortalStrategy(player, goalX, goalY, currentConfig = null) {
  if (!STATE.portals || STATE.portals.length < 2) {
    return { usePortal: false, portal: null, benefit: 0 };
  }

  // Check portal cooldown
  if (player.portalCooldown > 0) {
    return { usePortal: false, portal: null, benefit: 0 };
  }

  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;

  // Adjust thresholds based on difficulty
  const difficultyName = currentConfig?.NAME || 'INTERMEDIATE';
  const benefitThreshold = difficultyName === 'INSANE' ? 8 :
                           difficultyName === 'HARD' ? 12 : 15;
  const distanceThreshold = difficultyName === 'INSANE' ? 35 :
                            difficultyName === 'HARD' ? 30 : 25;

  let bestPortal = null;
  let bestBenefit = 0;

  for (let i = 0; i < STATE.portals.length; i++) {
    const portal = STATE.portals[i];
    const otherPortal = STATE.portals[(i + 1) % STATE.portals.length];

    // Distance from player to this portal
    const distToPortal = Math.hypot(portal.x - playerCenterX, portal.y - playerCenterY);

    // Distance from other portal exit to goal
    const distFromExitToGoal = Math.hypot(otherPortal.x - goalX, otherPortal.y - goalY);

    // Current distance to goal
    const currentDistToGoal = Math.hypot(goalX - playerCenterX, goalY - playerCenterY);

    // Benefit = how much closer we get by using portal
    const benefit = currentDistToGoal - (distToPortal + distFromExitToGoal);

    // Only consider if benefit is significant and portal is reasonably close
    if (benefit > benefitThreshold && distToPortal < distanceThreshold) {
      if (benefit > bestBenefit) {
        bestBenefit = benefit;
        bestPortal = portal;
      }
    }
  }

  return {
    usePortal: bestPortal !== null,
    portal: bestPortal,
    benefit: bestBenefit
  };
}

/**
 * Evaluate if using portal would help flank/reposition behind opponent
 * @param {Object} player - AI player
 * @param {Object} opponent - Opponent player
 * @returns {{shouldFlank: boolean, portal: Object|null}} Flank recommendation
 */
function evaluatePortalFlank(player, opponent) {
  if (!STATE.portals || STATE.portals.length < 2 || player.portalCooldown > 0) {
    return { shouldFlank: false, portal: null };
  }

  // Check if using portal would put us closer to opponent's back
  for (let i = 0; i < STATE.portals.length; i++) {
    const portal = STATE.portals[i];
    const exit = STATE.portals[(i + 1) % STATE.portals.length];

    const distToPortal = Math.hypot(portal.x - player.x, portal.y - player.y);
    if (distToPortal > 15) continue; // Too far from portal

    // Would exit put us closer to opponent?
    const exitToOpp = Math.hypot(exit.x - opponent.x, exit.y - opponent.y);
    const currentToOpp = Math.hypot(player.x - opponent.x, player.y - opponent.y);

    // Use portal if exit is significantly closer and would put us in attack range
    if (exitToOpp < currentToOpp * 0.7 && exitToOpp < 20) {
      return { shouldFlank: true, portal: portal };
    }
  }

  return { shouldFlank: false, portal: null };
}

/**
 * Evaluate if player should use portal for escape when in danger
 * @param {Object} player - AI player
 * @param {Object} opponent - Opponent
 * @returns {{shouldEscape: boolean, portal: Object|null}} Escape recommendation
 */
function evaluatePortalEscape(player, opponent) {
  if (!STATE.portals || STATE.portals.length < 2) {
    return { shouldEscape: false, portal: null };
  }

  if (player.portalCooldown > 0) {
    return { shouldEscape: false, portal: null };
  }

  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;
  const distToEnemy = Math.hypot(opponent.x - playerCenterX, opponent.y - playerCenterY);

  // Only consider escape if enemy is close and we're low on energy
  if (distToEnemy > 12 || player.boostEnergy > 40) {
    return { shouldEscape: false, portal: null };
  }

  // Find nearest portal
  let nearestPortal = null;
  let nearestDist = Infinity;

  for (const portal of STATE.portals) {
    const dist = Math.hypot(portal.x - playerCenterX, portal.y - playerCenterY);
    if (dist < nearestDist && dist < 10) {
      nearestDist = dist;
      nearestPortal = portal;
    }
  }

  return {
    shouldEscape: nearestPortal !== null,
    portal: nearestPortal
  };
}

/**
 * Check if current strategy is still valid (target reachable, conditions met)
 * @param {Object} currentStrategy - Current strategy object
 * @param {Object} player - AI player
 * @param {Object} opponent - Opponent player
 * @returns {boolean} True if strategy is still valid
 */
function isStrategyStillValid(currentStrategy, player, opponent) {
  if (!currentStrategy || !currentStrategy.type) return false;

  switch (currentStrategy.type) {
    case 'EXECUTE':
      // Execute strategy invalid if opponent is no longer stunned/glitched
      return opponent.stunRemaining(STATE.frameCount) > 0 || opponent.glitchRemaining(STATE.frameCount) > 0;

    case 'PORTAL_ESCAPE':
      // Escape invalid if no longer in danger or no nearby portal
      const distToEnemy = Math.hypot(opponent.x - player.x, opponent.y - player.y);
      return distToEnemy < 15 && player.boostEnergy < 40;

    case 'SCAVENGE':
      // Scavenge invalid if ammo crate is gone
      return STATE.ammoCrate !== null;

    case 'BLOCK_GOAL':
    case 'GOAL':
    case 'GOAL_RUSH':
    case 'HUNT':
    case 'INTERCEPT':
    case 'PORTAL_SHORTCUT':
    case 'PORTAL_FLANK':
      // These strategies are generally always valid
      return true;

    default:
      return true;
  }
}

/**
 * Decide high-level AI strategy based on game state
 * Evaluates multiple tactical options and returns the highest priority target
 * Uses hysteresis to prevent rapid strategy switching when enabled
 * @param {Object} player - AI player object
 * @param {Object} opponent - Opponent player object
 * @param {Object} currentConfig - AI difficulty configuration
 * @param {Object} opponentPrediction - Optional opponent behavior prediction data
 * @returns {{x: number, y: number, type: string, priority: number, canCharge?: boolean}} Strategy target
 */
export function decideStrategy(player, opponent, currentConfig, opponentPrediction = null) {
  let goalX = CONFIG.MAZE_OFFSET_X + (player.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let goalY = (player.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

  // Initialize strategy tracking if needed
  if (!player.aiStrategyState) {
    player.aiStrategyState = {
      currentStrategy: null,
      framesSinceChange: 0
    };
  }

  player.aiStrategyState.framesSinceChange++;

  let oppGoalX = CONFIG.MAZE_OFFSET_X + (opponent.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let oppGoalY = (opponent.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

  let myDistToGoal = Math.hypot(goalX - player.x, goalY - player.y);
  let enemyDistToTheirGoal = Math.hypot(oppGoalX - opponent.x, oppGoalY - opponent.y);
  let distToEnemy = Math.hypot(opponent.x - player.x, opponent.y - player.y);

  let aggression = currentConfig.BASE_AGGRESSION || 0.6;
  if (currentConfig.NAME !== 'INSANE' && currentConfig.NAME !== 'BEGINNER') {
    const scoreDiff = opponent.score - player.score;
    if (scoreDiff >= 2) aggression *= (currentConfig.AGGRESSION_SCALE_UP || 1.3);
    if (scoreDiff <= -2) aggression *= (currentConfig.AGGRESSION_SCALE_DOWN || 0.8);
  } else if (currentConfig.NAME === 'BEGINNER') {
    aggression = 0.4;
  } else {
    aggression *= (currentConfig.AGGRESSION_SCALE_UP || 1.3);
  }

  // Evaluate all candidate strategies and find the best one
  let bestStrategy = { x: goalX, y: goalY, type: 'GOAL', priority: 1 };

  // Check if we have an advantage (opponent disabled or far)
  const opponentStunned = opponent.stunRemaining(STATE.frameCount) > 30;
  const opponentGlitched = opponent.glitchRemaining(STATE.frameCount) > 60;
  const opponentDisabled = opponentStunned || opponentGlitched;
  const opponentFar = distToEnemy > 35;
  const closerToGoal = myDistToGoal < enemyDistToTheirGoal;
  const muchCloserToGoal = myDistToGoal < enemyDistToTheirGoal * 0.7;

  // ADVANTAGE RUSH - Rush to goal when we have a clear advantage
  if (currentConfig.NAME !== 'BEGINNER') {
    // Rush if opponent is disabled and we're reasonably close to goal
    if (opponentDisabled && myDistToGoal < 50) {
      bestStrategy = { x: goalX, y: goalY, type: 'GOAL_RUSH', priority: 10, urgent: true, canCharge: false };
    }
    // Rush if we're much closer to our goal than opponent is to theirs
    else if (muchCloserToGoal && myDistToGoal < 40) {
      bestStrategy = { x: goalX, y: goalY, type: 'GOAL_RUSH', priority: 9, urgent: true };
    }
    // Rush if opponent is far and we're closer to goal
    else if (opponentFar && closerToGoal && myDistToGoal < 45) {
      bestStrategy = { x: goalX, y: goalY, type: 'GOAL_RUSH', priority: 8.5, urgent: true };
    }
  }

  // SUDDEN DEATH MODE - More aggressive when time is low
  const isSuddenDeath = STATE.gameTime < TIMING.SUDDEN_DEATH_TIME;
  if (isSuddenDeath && currentConfig.NAME !== 'BEGINNER') {
    // In sudden death, prioritize scoring over hunting
    if (myDistToGoal < enemyDistToTheirGoal * 1.5) {
      // We're closer to our goal - rush it!
      bestStrategy = { x: goalX, y: goalY, type: 'GOAL_RUSH', priority: 11, urgent: true };
    } else {
      // Enemy is closer - block them aggressively
      bestStrategy = { x: oppGoalX, y: oppGoalY, type: 'BLOCK_GOAL', priority: 11, urgent: true };
    }
  }

  // Only evaluate lower priority strategies if not in sudden death
  if (bestStrategy.priority < 11) {
    // PORTAL ESCAPE - When in danger and near a portal
    if (currentConfig.NAME !== 'BEGINNER' && currentConfig.PORTAL_AWARENESS_ENABLED !== false) {
      const escape = evaluatePortalEscape(player, opponent);
      if (escape.shouldEscape && escape.portal) {
        const candidate = { x: escape.portal.x, y: escape.portal.y, type: 'PORTAL_ESCAPE', priority: 10 };
        if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
      }
    }

    // PANIC DEFENSE
    if ((enemyDistToTheirGoal < 10 || (enemyDistToTheirGoal + 80 < myDistToGoal)) && currentConfig.NAME !== 'BEGINNER') {
      const candidate = { x: oppGoalX, y: oppGoalY, type: 'BLOCK_GOAL', priority: 10 };
      if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
    }

    // EXECUTE STUNNED
    if ((opponent.stunRemaining(STATE.frameCount) > 0 || opponent.glitchRemaining(STATE.frameCount) > 0) && currentConfig.NAME !== 'BEGINNER') {
      const candidate = { x: opponent.x + opponent.size / 2, y: opponent.y + opponent.size / 2, type: 'EXECUTE', priority: 9, canCharge: true };
      if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
    }

    // PORTAL SHORTCUT - Use portal to reach goal faster
    if (currentConfig.NAME !== 'BEGINNER' && currentConfig.PORTAL_AWARENESS_ENABLED !== false) {
      const portalStrategy = evaluatePortalStrategy(player, goalX, goalY, currentConfig);
      if (portalStrategy.usePortal && portalStrategy.portal) {
        const candidate = { x: portalStrategy.portal.x, y: portalStrategy.portal.y, type: 'PORTAL_SHORTCUT', priority: 8 };
        if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
      }

      // PORTAL FLANK - Use portal to get behind opponent (HARD+ only)
      if ((currentConfig.NAME === 'HARD' || currentConfig.NAME === 'INSANE') && bestStrategy.priority < 8) {
        const flankStrategy = evaluatePortalFlank(player, opponent);
        if (flankStrategy.shouldFlank && flankStrategy.portal) {
          const candidate = { x: flankStrategy.portal.x, y: flankStrategy.portal.y, type: 'PORTAL_FLANK', priority: 7.5 };
          if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
        }
      }
    }

    // RESOURCE DENIAL
    let ammo = STATE.ammoCrate;
    if (ammo && currentConfig.RESOURCE_DENIAL_ENABLED !== false) {
      let distToAmmo = Math.hypot(ammo.x - player.x, ammo.y - player.y);
      let enemyDistToAmmo = Math.hypot(ammo.x - opponent.x, ammo.y - opponent.y);
      if (distToAmmo < enemyDistToAmmo * 1.2 && distToAmmo < 40) {
        const candidate = { x: ammo.x, y: ammo.y, type: 'SCAVENGE', priority: 8 };
        if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
      }
    }

    // AGGRESSIVE INTERCEPT - Cut off player's path to their goal
    if ((currentConfig.ALWAYS_INTERCEPT || currentConfig.INTERCEPT_PRIORITY) && currentConfig.NAME !== 'BEGINNER') {
      // Calculate if opponent is heading toward their goal
      const oppGoalX = CONFIG.MAZE_OFFSET_X + (opponent.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
      const oppGoalY = (opponent.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
      const oppDistToGoal = Math.hypot(oppGoalX - opponent.x, oppGoalY - opponent.y);
      const aiDistToOppGoal = Math.hypot(oppGoalX - player.x, oppGoalY - player.y);

      // If opponent is closer to their goal than us, intercept!
      if (oppDistToGoal < aiDistToOppGoal && oppDistToGoal < 50) {
        // Calculate intercept point - between opponent and their goal
        const interceptX = (opponent.x + oppGoalX) / 2;
        const interceptY = (opponent.y + oppGoalY) / 2;
        const candidate = { x: interceptX, y: interceptY, type: 'INTERCEPT', priority: 9.5, urgent: true };
        if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
      }

      // If opponent is very close to goal, block the goal directly
      if (oppDistToGoal < 20) {
        const candidate = { x: oppGoalX, y: oppGoalY, type: 'BLOCK_GOAL', priority: 10.5, urgent: true };
        if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
      }
    }

    // PREDICTIVE INTERCEPT
    if (player.boostEnergy > 15 && currentConfig.NAME !== 'BEGINNER') {
      let predictedPos = predictPlayerMovement(opponent, currentConfig, opponentPrediction);
      let distToPredicted = Math.hypot(predictedPos.x - player.x, predictedPos.y - player.y);
      let huntThreshold = currentConfig.HUNT_THRESHOLD || 60;

      // Adjust hunt threshold based on opponent's preferred distance
      if (opponentPrediction && opponentPrediction.preferredDistance) {
        // If opponent likes to stay far, be more aggressive in hunting
        if (opponentPrediction.preferredDistance > 25) {
          huntThreshold *= 1.2;
        }
      }

      if (distToPredicted < huntThreshold && aggression > 0.5) {
        const candidate = { x: predictedPos.x, y: predictedPos.y, type: 'HUNT', priority: 7, aggressive: true };
        if (candidate.priority > bestStrategy.priority) bestStrategy = candidate;
      }
    }
  }

  // Apply hysteresis if enabled - use dynamic threshold that decreases over time
  if (currentConfig.STRATEGY_HYSTERESIS) {
    const currentStrategy = player.aiStrategyState.currentStrategy;
    const framesSince = player.aiStrategyState.framesSinceChange;

    // If we have a current strategy that's still valid
    if (currentStrategy && isStrategyStillValid(currentStrategy, player, opponent)) {
      const priorityDiff = bestStrategy.priority - currentStrategy.priority;

      // Dynamic threshold: decreases over time (max 3 at start, min 1 after ~120 frames)
      const baseThreshold = 3;
      const minThreshold = 1;
      const decayRate = 0.015; // ~120 frames to reach minimum
      const dynamicThreshold = Math.max(minThreshold, baseThreshold - framesSince * decayRate);

      // Critical strategies can override with lower threshold
      const criticalStrategies = ['EXECUTE', 'PORTAL_ESCAPE', 'GOAL_RUSH', 'BLOCK_GOAL'];
      const isCritical = criticalStrategies.includes(bestStrategy.type);
      const effectiveThreshold = isCritical ? Math.min(dynamicThreshold, 1.5) : dynamicThreshold;

      if (priorityDiff < effectiveThreshold) {
        // Keep current strategy, but update position if it's a moving target
        if (currentStrategy.type === 'HUNT' || currentStrategy.type === 'EXECUTE') {
          currentStrategy.x = opponent.x + opponent.size / 2;
          currentStrategy.y = opponent.y + opponent.size / 2;
        }
        return currentStrategy;
      }
    }
  }

  // Update strategy state
  player.aiStrategyState.currentStrategy = bestStrategy;
  player.aiStrategyState.framesSinceChange = 0;

  return bestStrategy;
}

/**
 * Predict player movement using weighted directional history
 * Uses exponential decay weighting for more accurate turning predictions
 * @param {Object} opponent - Opponent player
 * @param {Object} currentConfig - AI difficulty configuration
 * @param {Object} opponentPrediction - Optional opponent behavior prediction data
 * @returns {{x: number, y: number}} Predicted position
 */
export function predictPlayerMovement(opponent, currentConfig, opponentPrediction = null) {
  const predictionFrames = currentConfig.PREDICTION_WINDOW || 15;

  // Fallback to simple prediction if no direction history
  if (!opponent.directionHistory || opponent.directionHistory.length < 2) {
    if (!opponent.lastDir) return { x: opponent.x, y: opponent.y };
    let predictedX = opponent.x + opponent.lastDir.x * predictionFrames;
    let predictedY = opponent.y + opponent.lastDir.y * predictionFrames;
    predictedX = Math.max(0, Math.min(predictedX, CONFIG.LOGICAL_W));
    predictedY = Math.max(0, Math.min(predictedY, CONFIG.LOGICAL_H));
    return { x: predictedX, y: predictedY };
  }

  const history = opponent.directionHistory;

  // Exponential decay weighting (recent = higher weight)
  let weightedDx = 0, weightedDy = 0, totalWeight = 0;
  for (let i = 0; i < history.length; i++) {
    const weight = Math.pow(1.5, i); // More recent = higher weight
    weightedDx += (history[i].x || 0) * weight;
    weightedDy += (history[i].y || 0) * weight;
    totalWeight += weight;
  }

  const avgDx = totalWeight > 0 ? weightedDx / totalWeight : 0;
  const avgDy = totalWeight > 0 ? weightedDy / totalWeight : 0;

  // Apply turning variance reduction
  const turningFactor = analyzeDirectionChanges(opponent);
  const confidenceMultiplier = Math.max(0.3, 1 - turningFactor);

  let predictedX = opponent.x + avgDx * predictionFrames * confidenceMultiplier;
  let predictedY = opponent.y + avgDy * predictionFrames * confidenceMultiplier;

  // Use opponent profile to bias prediction toward favored direction
  if (opponentPrediction && opponentPrediction.preferredDirection) {
    const dirBias = 0.15; // 15% bias toward preferred direction
    const dirWeights = opponentPrediction.directionWeights;
    const total = dirWeights.up + dirWeights.down + dirWeights.left + dirWeights.right;
    if (total > 50) {
      // Apply slight bias based on historical direction preference
      const horizBias = (dirWeights.right - dirWeights.left) / total;
      const vertBias = (dirWeights.down - dirWeights.up) / total;
      predictedX += horizBias * predictionFrames * dirBias;
      predictedY += vertBias * predictionFrames * dirBias;
    }
  }

  // Apply corner cut detection
  if (currentConfig.CORNER_CUT_DETECTION !== false && turningFactor > 0.3) {
    let cornerPrediction = predictCornerCut(opponent, predictedX, predictedY);
    predictedX = cornerPrediction.x;
    predictedY = cornerPrediction.y;
  }

  // Clamp to bounds
  predictedX = Math.max(0, Math.min(predictedX, CONFIG.LOGICAL_W));
  predictedY = Math.max(0, Math.min(predictedY, CONFIG.LOGICAL_H));

  return { x: predictedX, y: predictedY };
}

export function analyzeDirectionChanges(opponent) {
  if (!opponent.directionHistory) {
    opponent.directionHistory = [];
  }

  if (opponent.lastDir) {
    opponent.directionHistory.push({ ...opponent.lastDir }); // Clone to avoid reference issues
    if (opponent.directionHistory.length > 5) { // Increased from 3 to 5 for better pattern detection
      opponent.directionHistory.shift();
    }
  }

  if (opponent.directionHistory.length < 2) return 0;

  let dirs = opponent.directionHistory;
  let variance = 0;

  for (let i = 1; i < dirs.length; i++) {
    let prevDir = dirs[i - 1];
    let currDir = dirs[i];
    if (!prevDir || !currDir) continue;
    let dot = (prevDir.x * currDir.x + prevDir.y * currDir.y);
    variance += (1 - dot) / 2;
  }

  return variance / (dirs.length - 1);
}

export function predictCornerCut(opponent, predictedX, predictedY) {
  // Simplified corner cut prediction without expensive pathfinding
  // Estimate midpoint between opponent and predicted position
  const midX = (opponent.x + predictedX) / 2;
  const midY = (opponent.y + predictedY) / 2;

  // Snap to cell center for more realistic path prediction
  const midC = Math.floor((midX - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
  const midR = Math.floor(midY / CONFIG.CELL_SIZE);

  // Clamp to valid cell range
  const clampedC = Math.max(0, Math.min(midC, CONFIG.COLS - 1));
  const clampedR = Math.max(0, Math.min(midR, CONFIG.ROWS - 1));

  return {
    x: CONFIG.MAZE_OFFSET_X + (clampedC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2),
    y: (clampedR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2)
  };
}

export function shouldExecuteCombo(player, opponent, currentConfig) {
  if (!currentConfig.COMBO_CHAINS_ENABLED) return null;

  const dist = Math.hypot(player.x - opponent.x, player.y - opponent.y);
  const stunTime = opponent.stunRemaining(STATE.frameCount);
  const glitchTime = opponent.glitchRemaining(STATE.frameCount);

  // STUN_EXECUTE COMBO: Multi-phase attack on stunned opponent
  // Phase 1: If far, boost close
  // Phase 2: If close enough, charge beam for maximum damage
  if (stunTime > 0) {
    // Calculate if we have time to close distance and still fire
    const closeTime = dist / (CONFIG.BASE_SPEED * 2); // frames to close at boost speed
    const chargeTime = 30; // frames needed to charge beam

    if (stunTime > closeTime + chargeTime + 10) {
      // We have time for full combo
      if (dist > 12 && player.boostEnergy > 50) {
        // Phase 1: Boost to close distance
        return {
          type: 'STUN_EXECUTE_CLOSE',
          actions: ['boost'],
          priority: 11,
          window: stunTime
        };
      } else if (dist <= 12 && player.boostEnergy > 65) {
        // Phase 2: Close enough, charge beam
        return {
          type: 'STUN_EXECUTE_FIRE',
          actions: ['charge_beam'],
          priority: 11,
          window: stunTime
        };
      }
    } else if (stunTime > chargeTime && player.boostEnergy > 65 && dist < 20) {
      // Limited time but close enough - just charge and fire
      return {
        type: 'STUN_CHARGE',
        actions: ['charge_beam'],
        priority: 10,
        window: stunTime
      };
    }
  }

  // GLITCH_HUNT COMBO: Aggressive pursuit with charged beam ready
  // Glitched opponents have inverted controls - they're unpredictable but easy targets
  if (glitchTime > 60 && player.boostEnergy > 50) {
    if (dist > 20) {
      // Far away - boost aggressively to close distance
      return {
        type: 'GLITCH_HUNT',
        actions: ['boost'],
        priority: 9
      };
    } else if (dist > 10 && dist <= 20) {
      // Medium range - close in but be ready to fire
      return {
        type: 'GLITCH_APPROACH',
        actions: ['boost'],
        priority: 9
      };
    } else if (player.boostEnergy > 65) {
      // Close range - charge and execute
      return {
        type: 'GLITCH_EXECUTE',
        actions: ['charge_beam'],
        priority: 10
      };
    }
  }

  // CHASE COMBO: Boost to close distance when far (no LoS check needed)
  if (player.boostEnergy > 40 && dist > 25) {
    return {
      type: 'BOOST_HUNT',
      actions: ['boost'],
      priority: 6
    };
  }

  // SHIELD BAIT: When low on energy but opponent is close
  if (player.boostEnergy < 30 && player.boostEnergy > 15 && dist < 10) {
    return {
      type: 'SHIELD_BAIT',
      actions: ['shield'],
      priority: 5
    };
  }

  return null;
}
