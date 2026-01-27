import { CONFIG } from '../config.js';
import { STATE } from '../state.js';
import { predictPlayerMovement } from './strategy.js';

export function shouldChargeBeam(player, opponent, currentConfig) {
  if (!currentConfig.TACTICAL_CHARGING_ENABLED) {
    return shouldFireBeamBasic(player, opponent);
  }

  if (player.boostEnergy < (currentConfig.MIN_CHARGE_ENERGY || 65)) {
    return false;
  }

  if (opponent.glitchRemaining(STATE.frameCount) > 60) {
    return true;
  }

  let predictedPos = predictPlayerMovement(opponent, currentConfig);
  const TOLERANCE = 5;
  let predictedAlignedX = Math.abs(player.y - predictedPos.y) < TOLERANCE;
  let predictedAlignedY = Math.abs(player.x - predictedPos.x) < TOLERANCE;

  const IS_INSANE = (currentConfig.TACTICAL_PROBABILITY > 0.9);
  if (IS_INSANE && (predictedAlignedX || predictedAlignedY)) {
    return true;
  }

  return (predictedAlignedX || predictedAlignedY);
}

export function shouldFireBeamBasic(player, opponent) {
  const TOLERANCE = 2.5;
  let dx = Math.abs(player.x - opponent.x);
  let dy = Math.abs(player.y - opponent.y);

  let futureX = opponent.x + (opponent.lastDir ? opponent.lastDir.x * 8 : 0);
  let futureY = opponent.y + (opponent.lastDir ? opponent.lastDir.y * 8 : 0);

  let willBeAlignedX = Math.abs(player.y - futureY) < TOLERANCE;
  let willBeAlignedY = Math.abs(player.x - futureX) < TOLERANCE;
  let currentlyAlignedX = dy < TOLERANCE;
  let currentlyAlignedY = dx < TOLERANCE;

  return (currentlyAlignedX || currentlyAlignedY || willBeAlignedX || willBeAlignedY);
}

export function shouldDetonateNearbyMines(player, opponent) {
  if (STATE.mines.length === 0) return false;
  let closeMines = STATE.mines.filter(mine => {
    let distPlayer = Math.hypot(mine.x - player.x, mine.y - player.y);
    let distOpp = Math.hypot(mine.x - opponent.x, mine.y - opponent.y);
    return (mine.owner === player.id || mine.owner === -1) &&
      distOpp < 6 && distPlayer > 5;
  });
  return closeMines.length > 0 && player.boostEnergy > 20;
}

export function calculateAdvancedMinePositions(player, opponent, currentConfig) {
  if (!currentConfig.ADVANCED_MINING_ENABLED) {
    let randomCell = STATE.maze[Math.floor(Math.random() * STATE.maze.length)];
    return {
      x: CONFIG.MAZE_OFFSET_X + (randomCell.c * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2),
      y: (randomCell.r * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2)
    };
  }

  const mineStrategy = currentConfig.MINE_STRATEGY || 'BALANCED';

  // DEFENSIVE: Protect own goal when losing
  if (mineStrategy === 'DEFENSIVE') {
    let ourGoalX = CONFIG.MAZE_OFFSET_X + (player.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let ourGoalY = (player.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let angle = Math.random() * Math.PI * 2;
    let distFromGoal = CONFIG.CELL_SIZE * 2.5 + Math.random() * CONFIG.CELL_SIZE * 0.5;
    return {
      x: ourGoalX + Math.cos(angle) * distFromGoal,
      y: ourGoalY + Math.sin(angle) * distFromGoal
    };
  }

  // AGGRESSIVE: Intercept opponent's path
  if (mineStrategy === 'AGGRESSIVE') {
    let oppGoalX = CONFIG.MAZE_OFFSET_X + (opponent.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let oppGoalY = (opponent.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let dirToGoal = { x: oppGoalX - opponent.x, y: oppGoalY - opponent.y };
    let dist = Math.hypot(dirToGoal.x, dirToGoal.y);
    if (dist > 0.1) {
      let interceptDistance = CONFIG.CELL_SIZE * (2 + Math.random() * 2);
      return {
        x: opponent.x + (dirToGoal.x / dist) * interceptDistance,
        y: opponent.y + (dirToGoal.y / dist) * interceptDistance
      };
    }
  }

  // BALANCED: 70% aggressive, 30% defensive
  if (Math.random() < 0.7) {
    return calculateAdvancedMinePositions(player, opponent, { ...currentConfig, MINE_STRATEGY: 'AGGRESSIVE' });
  } else {
    return calculateAdvancedMinePositions(player, opponent, { ...currentConfig, MINE_STRATEGY: 'DEFENSIVE' });
  }
}
