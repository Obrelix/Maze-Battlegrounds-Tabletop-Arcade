import { CONFIG, TIMING } from '../config.js';
import { STATE } from '../state.js';
import { hasLineOfSight } from '../grid.js';

/**
 * Check if using a portal would help reach the goal faster
 * @param {Object} player - AI player
 * @param {number} goalX - Goal X position
 * @param {number} goalY - Goal Y position
 * @returns {{usePortal: boolean, portal: Object|null, benefit: number}} Portal recommendation
 */
function evaluatePortalStrategy(player, goalX, goalY) {
  if (!STATE.portals || STATE.portals.length < 2) {
    return { usePortal: false, portal: null, benefit: 0 };
  }

  // Check portal cooldown
  if (player.portalCooldown > 0) {
    return { usePortal: false, portal: null, benefit: 0 };
  }

  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;

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
    if (benefit > 15 && distToPortal < 25) {
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
 * Decide high-level AI strategy based on game state
 * Evaluates multiple tactical options and returns the highest priority target
 * @param {Object} player - AI player object
 * @param {Object} opponent - Opponent player object
 * @param {Object} currentConfig - AI difficulty configuration
 * @returns {{x: number, y: number, type: string, priority: number, canCharge?: boolean}} Strategy target
 */
export function decideStrategy(player, opponent, currentConfig) {
  let goalX = CONFIG.MAZE_OFFSET_X + (player.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let goalY = (player.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

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

  // SUDDEN DEATH MODE - More aggressive when time is low
  const isSuddenDeath = STATE.gameTime < TIMING.SUDDEN_DEATH_TIME;
  if (isSuddenDeath && currentConfig.NAME !== 'BEGINNER') {
    // In sudden death, prioritize scoring over hunting
    if (myDistToGoal < enemyDistToTheirGoal * 1.5) {
      // We're closer to our goal - rush it!
      return { x: goalX, y: goalY, type: 'GOAL_RUSH', priority: 11, urgent: true };
    } else {
      // Enemy is closer - block them aggressively
      return { x: oppGoalX, y: oppGoalY, type: 'BLOCK_GOAL', priority: 11, urgent: true };
    }
  }

  // PORTAL ESCAPE - When in danger and near a portal
  if (currentConfig.NAME !== 'BEGINNER' && currentConfig.PORTAL_AWARENESS_ENABLED !== false) {
    const escape = evaluatePortalEscape(player, opponent);
    if (escape.shouldEscape && escape.portal) {
      return { x: escape.portal.x, y: escape.portal.y, type: 'PORTAL_ESCAPE', priority: 10 };
    }
  }

  // PANIC DEFENSE
  if ((enemyDistToTheirGoal < 10 || (enemyDistToTheirGoal + 80 < myDistToGoal)) && currentConfig.NAME !== 'BEGINNER') {
    return { x: oppGoalX, y: oppGoalY, type: 'BLOCK_GOAL', priority: 10 };
  }

  // EXECUTE STUNNED
  if ((opponent.stunRemaining(STATE.frameCount) > 0 || opponent.glitchRemaining(STATE.frameCount) > 0) && currentConfig.NAME !== 'BEGINNER') {
    return { x: opponent.x + opponent.size / 2, y: opponent.y + opponent.size / 2, type: 'EXECUTE', priority: 9, canCharge: true };
  }

  // PORTAL SHORTCUT - Use portal to reach goal faster
  if (currentConfig.NAME !== 'BEGINNER' && currentConfig.PORTAL_AWARENESS_ENABLED !== false) {
    const portalStrategy = evaluatePortalStrategy(player, goalX, goalY);
    if (portalStrategy.usePortal && portalStrategy.portal) {
      return { x: portalStrategy.portal.x, y: portalStrategy.portal.y, type: 'PORTAL_SHORTCUT', priority: 8 };
    }
  }

  // PREDICTIVE INTERCEPT
  if (player.boostEnergy > 15 && currentConfig.NAME !== 'BEGINNER') {
    let predictedPos = predictPlayerMovement(opponent, currentConfig);
    let distToPredicted = Math.hypot(predictedPos.x - player.x, predictedPos.y - player.y);
    let huntThreshold = currentConfig.HUNT_THRESHOLD || 60;

    if (distToPredicted < huntThreshold && aggression > 0.5) {
      return { x: predictedPos.x, y: predictedPos.y, type: 'HUNT', priority: 7, aggressive: true };
    }
  }

  // RESOURCE DENIAL
  let ammo = STATE.ammoCrate;
  if (ammo && currentConfig.RESOURCE_DENIAL_ENABLED !== false) {
    let distToAmmo = Math.hypot(ammo.x - player.x, ammo.y - player.y);
    let enemyDistToAmmo = Math.hypot(ammo.x - opponent.x, ammo.y - opponent.y);
    if (distToAmmo < enemyDistToAmmo * 1.2 && distToAmmo < 40) {
      return { x: ammo.x, y: ammo.y, type: 'SCAVENGE', priority: 8 };
    }
  }

  return { x: goalX, y: goalY, type: 'GOAL', priority: 1 };
}

export function predictPlayerMovement(opponent, currentConfig) {
  if (!opponent.lastDir) {
    return { x: opponent.x, y: opponent.y };
  }

  let predictionFrames = currentConfig.PREDICTION_WINDOW || 15;

  let predictedX = opponent.x + (opponent.lastDir.x * predictionFrames);
  let predictedY = opponent.y + (opponent.lastDir.y * predictionFrames);

  if (currentConfig.CORNER_CUT_DETECTION !== false) {
    let turningFactor = analyzeDirectionChanges(opponent);
    if (turningFactor > 0.3) {
      let cornerPrediction = predictCornerCut(opponent, predictedX, predictedY);
      predictedX = cornerPrediction.x;
      predictedY = cornerPrediction.y;
    }
  }

  predictedX = Math.max(0, Math.min(predictedX, CONFIG.LOGICAL_W));
  predictedY = Math.max(0, Math.min(predictedY, CONFIG.LOGICAL_H));

  return { x: predictedX, y: predictedY };
}

export function analyzeDirectionChanges(opponent) {
  if (!opponent.directionHistory) {
    opponent.directionHistory = [];
  }

  if (opponent.lastDir) {
    opponent.directionHistory.push(opponent.lastDir);
    if (opponent.directionHistory.length > 3) {
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

  // STUN COMBO: Charge beam when opponent is stunned/glitched
  if (opponent.stunRemaining(STATE.frameCount) >= 30 && player.boostEnergy > 65) {
    return {
      type: 'STUN_CHARGE',
      actions: ['charge_beam'],
      priority: 10,
      window: opponent.stunRemaining(STATE.frameCount)
    };
  }

  // GLITCH COMBO: More aggressive during opponent glitch
  if (opponent.glitchRemaining(STATE.frameCount) > 60 && player.boostEnergy > 50) {
    // Glitched opponents move erratically - get close and attack
    if (dist > 15) {
      return {
        type: 'GLITCH_HUNT',
        actions: ['boost'],
        priority: 9
      };
    } else if (player.boostEnergy > 65) {
      return {
        type: 'GLITCH_EXECUTE',
        actions: ['charge_beam'],
        priority: 9
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
