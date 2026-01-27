import { CONFIG } from '../config.js';
import { STATE } from '../state.js';
import { findPathToTarget } from './pathfinding.js';

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
  } else
    aggression *= (currentConfig.AGGRESSION_SCALE_UP || 1.3)
  // PANIC DEFENSE
  if ((enemyDistToTheirGoal < 10 || (enemyDistToTheirGoal + 80 < myDistToGoal)) && currentConfig.NAME !== 'BEGINNER') {
    return { x: oppGoalX, y: oppGoalY, type: 'BLOCK_GOAL', priority: 10 };
  }

  // EXECUTE STUNNED
  if ((opponent.stunRemaining(STATE.frameCount) > 0 || opponent.glitchRemaining(STATE.frameCount) > 0) && currentConfig.NAME !== 'BEGINNER') {
    return { x: opponent.x + opponent.size / 2, y: opponent.y + opponent.size / 2, type: 'EXECUTE', priority: 9, canCharge: true };
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
    let dot = (prevDir.x * currDir.x + prevDir.y * currDir.y);
    variance += (1 - dot) / 2;
  }

  return variance / (dirs.length - 1);
}

export function predictCornerCut(opponent, predictedX, predictedY) {
  let path = findPathToTarget(opponent, predictedX, predictedY);

  if (path.length > 0) {
    let midpointCell = path[Math.floor(path.length / 2)];
    return {
      x: CONFIG.MAZE_OFFSET_X + (midpointCell.c * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2),
      y: (midpointCell.r * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2)
    };
  }

  return { x: predictedX, y: predictedY };
}

export function shouldExecuteCombo(player, opponent, currentConfig) {
  if (!currentConfig.COMBO_CHAINS_ENABLED) return null;

  if (opponent.stunRemaining(STATE.frameCount) >= 30 && player.boostEnergy > 65) {
    return {
      type: 'STUN_CHARGE',
      actions: ['charge_beam'],
      priority: 10,
      window: opponent.stunRemaining(STATE.frameCount)
    };
  }

  if (player.boostEnergy > 40 && Math.hypot(player.x - opponent.x, player.y - opponent.y) > 20) {
    return {
      type: 'BOOST_HUNT',
      actions: ['boost'],
      priority: 6
    };
  }

  return null;
}
