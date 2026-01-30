import { CONFIG, TIMING } from '../config.js';
import { STATE } from '../state.js';
import { hasLineOfSight } from '../grid.js';
import { predictPlayerMovement } from './strategy.js';

// Re-export hasLineOfSight for backward compatibility
export { hasLineOfSight };

/**
 * Check if opponent is aiming at player (aligned and has energy to fire)
 * Used for dodge logic and predictive shielding
 * @param {Object} player - AI player to check danger for
 * @param {Object} opponent - Opponent who might be firing
 * @returns {{danger: boolean, direction: string|null, urgency: number}} Danger assessment
 */
export function isOpponentAimingAtMe(player, opponent) {
  // Early exit if opponent can't fire
  if (opponent.boostEnergy < 30) {
    return { danger: false, direction: null, urgency: 0 };
  }

  const TOLERANCE = 3.0;
  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;
  const oppCenterX = opponent.x + opponent.size / 2;
  const oppCenterY = opponent.y + opponent.size / 2;

  const dx = Math.abs(playerCenterX - oppCenterX);
  const dy = Math.abs(playerCenterY - oppCenterY);

  const alignedHorizontally = dy < TOLERANCE;
  const alignedVertically = dx < TOLERANCE;

  // Early exit if not aligned
  if (!alignedHorizontally && !alignedVertically) {
    return { danger: false, direction: null, urgency: 0 };
  }

  // Only check line of sight if aligned (expensive operation)
  const hasLoS = hasLineOfSight(oppCenterX, oppCenterY, playerCenterX, playerCenterY);

  if (!hasLoS) {
    return { danger: false, direction: null, urgency: 0 };
  }

  // Calculate direction and urgency
  let direction = null;
  if (alignedHorizontally) {
    direction = playerCenterX > oppCenterX ? 'right' : 'left';
  } else {
    direction = playerCenterY > oppCenterY ? 'down' : 'up';
  }

  const dist = Math.hypot(dx, dy);
  const urgency = Math.max(0, 1 - (dist / 40));

  return { danger: true, direction, urgency };
}

/**
 * Get dodge direction to evade incoming fire
 * @param {string} threatDirection - Direction the threat is coming from
 * @returns {{dx: number, dy: number}} Dodge movement vector
 */
export function getDodgeDirection(threatDirection) {
  // Dodge perpendicular to threat direction
  switch (threatDirection) {
    case 'left':
    case 'right':
      // Threat is horizontal, dodge vertically
      return Math.random() < 0.5 ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 };
    case 'up':
    case 'down':
      // Threat is vertical, dodge horizontally
      return Math.random() < 0.5 ? { dx: -1, dy: 0 } : { dx: 1, dy: 0 };
    default:
      return { dx: 0, dy: 0 };
  }
}

export function shouldChargeBeam(player, opponent, currentConfig) {
  if (!currentConfig.TACTICAL_CHARGING_ENABLED) {
    return shouldFireBeamBasic(player, opponent);
  }

  // Don't waste energy firing at shielded opponents
  if (opponent.shieldActive) {
    return false;
  }

  if (player.boostEnergy < (currentConfig.MIN_CHARGE_ENERGY || 65)) {
    return false;
  }

  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;
  const oppCenterX = opponent.x + opponent.size / 2;
  const oppCenterY = opponent.y + opponent.size / 2;

  // Check line of sight before considering firing
  if (!hasLineOfSight(playerCenterX, playerCenterY, oppCenterX, oppCenterY)) {
    return false;
  }

  if (opponent.glitchRemaining(STATE.frameCount) > 60) {
    return true;
  }

  // Check predicted alignment (skip extra LoS check - use cached result)
  const predictedPos = predictPlayerMovement(opponent, currentConfig);
  const TOLERANCE = 5;
  const predictedAlignedX = Math.abs(player.y - predictedPos.y) < TOLERANCE;
  const predictedAlignedY = Math.abs(player.x - predictedPos.x) < TOLERANCE;

  return (predictedAlignedX || predictedAlignedY);
}

export function shouldFireBeamBasic(player, opponent) {
  // Don't waste energy firing at shielded opponents
  if (opponent.shieldActive) {
    return false;
  }

  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;
  const oppCenterX = opponent.x + opponent.size / 2;
  const oppCenterY = opponent.y + opponent.size / 2;

  const TOLERANCE = 2.5;
  const dx = Math.abs(playerCenterX - oppCenterX);
  const dy = Math.abs(playerCenterY - oppCenterY);

  const currentlyAlignedX = dy < TOLERANCE;
  const currentlyAlignedY = dx < TOLERANCE;

  // Quick check: currently aligned?
  if (currentlyAlignedX || currentlyAlignedY) {
    return hasLineOfSight(playerCenterX, playerCenterY, oppCenterX, oppCenterY);
  }

  // Check future alignment (prediction)
  if (opponent.lastDir) {
    const futureX = oppCenterX + opponent.lastDir.x * 8;
    const futureY = oppCenterY + opponent.lastDir.y * 8;
    const willBeAlignedX = Math.abs(playerCenterY - futureY) < TOLERANCE;
    const willBeAlignedY = Math.abs(playerCenterX - futureX) < TOLERANCE;

    if (willBeAlignedX || willBeAlignedY) {
      return hasLineOfSight(playerCenterX, playerCenterY, oppCenterX, oppCenterY);
    }
  }

  return false;
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

/**
 * Find chokepoints in the maze (cells with limited exits)
 * Chokepoints make excellent mine placement locations
 * @param {Object} nearPlayer - Center position to search around
 * @param {number} radius - Search radius in cells (capped at 5 for performance)
 * @returns {Array} Array of chokepoint cells sorted by tactical value
 */
function findChokepoints(nearPlayer, radius) {
  // Cap radius to prevent expensive searches
  radius = Math.min(radius, 5);

  const chokepoints = [];
  const centerC = Math.floor((nearPlayer.x - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
  const centerR = Math.floor(nearPlayer.y / CONFIG.CELL_SIZE);

  for (let dc = -radius; dc <= radius; dc++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const c = centerC + dc;
      const r = centerR + dr;

      if (c < 0 || c >= CONFIG.COLS || r < 0 || r >= CONFIG.ROWS) continue;

      const cell = STATE.maze[c + r * CONFIG.COLS];
      if (!cell) continue;

      // Count open passages (walls that are false) - unrolled for performance
      let openPassages = 0;
      if (!cell.walls[0]) openPassages++;
      if (!cell.walls[1]) openPassages++;
      if (!cell.walls[2]) openPassages++;
      if (!cell.walls[3]) openPassages++;

      // Chokepoint = cell with only 1-2 open passages (corridor or dead end)
      if (openPassages <= 2 && openPassages >= 1) {
        const distFromCenter = Math.hypot(dc, dr);
        chokepoints.push({
          cell,
          x: CONFIG.MAZE_OFFSET_X + c * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
          y: r * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
          passages: openPassages,
          distance: distFromCenter,
          // Tactical value: closer corridors are better
          value: (radius - distFromCenter) * (3 - openPassages)
        });

        // Early exit: we only need a few good chokepoints
        if (chokepoints.length >= 5) {
          return chokepoints.sort((a, b) => b.value - a.value);
        }
      }
    }
  }

  return chokepoints.sort((a, b) => b.value - a.value);
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

  // CHOKEPOINT: Place mines in narrow corridors along opponent's path
  if (mineStrategy === 'AGGRESSIVE' || mineStrategy === 'BALANCED') {
    // Find chokepoints near opponent's predicted path
    const oppGoalX = CONFIG.MAZE_OFFSET_X + (opponent.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    const oppGoalY = (opponent.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

    // Midpoint between opponent and their goal
    const midpoint = {
      x: (opponent.x + oppGoalX) / 2,
      y: (opponent.y + oppGoalY) / 2
    };

    const chokepoints = findChokepoints(midpoint, 5);

    if (chokepoints.length > 0 && Math.random() < 0.6) {
      // Pick one of the top 3 chokepoints randomly
      const pick = chokepoints[Math.floor(Math.random() * Math.min(3, chokepoints.length))];
      return { x: pick.x, y: pick.y };
    }
  }

  // DEFENSIVE: Protect own goal when losing
  if (mineStrategy === 'DEFENSIVE') {
    let ourGoalX = CONFIG.MAZE_OFFSET_X + (player.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let ourGoalY = (player.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

    // Find chokepoints near our goal
    const goalChokepoints = findChokepoints({ x: ourGoalX, y: ourGoalY }, 5);

    if (goalChokepoints.length > 0 && Math.random() < 0.7) {
      const pick = goalChokepoints[Math.floor(Math.random() * Math.min(3, goalChokepoints.length))];
      return { x: pick.x, y: pick.y };
    }

    // Fallback: ring around goal
    let angle = Math.random() * Math.PI * 2;
    let distFromGoal = CONFIG.CELL_SIZE * 2.5 + Math.random() * CONFIG.CELL_SIZE * 0.5;
    return {
      x: ourGoalX + Math.cos(angle) * distFromGoal,
      y: ourGoalY + Math.sin(angle) * distFromGoal
    };
  }

  // AGGRESSIVE: Intercept opponent's path with prediction
  if (mineStrategy === 'AGGRESSIVE') {
    let oppGoalX = CONFIG.MAZE_OFFSET_X + (opponent.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let oppGoalY = (opponent.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let dirToGoal = { x: oppGoalX - opponent.x, y: oppGoalY - opponent.y };
    let dist = Math.hypot(dirToGoal.x, dirToGoal.y);
    if (dist > 0.1) {
      // Place further ahead to catch them
      let interceptDistance = CONFIG.CELL_SIZE * (3 + Math.random() * 3);
      return {
        x: opponent.x + (dirToGoal.x / dist) * interceptDistance,
        y: opponent.y + (dirToGoal.y / dist) * interceptDistance
      };
    }
  }

  // BALANCED: Mix of strategies (non-recursive)
  const roll = Math.random();
  if (roll < 0.5) {
    // AGGRESSIVE inline: Intercept opponent's path
    let oppGoalX = CONFIG.MAZE_OFFSET_X + (opponent.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let oppGoalY = (opponent.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
    let dirToGoal = { x: oppGoalX - opponent.x, y: oppGoalY - opponent.y };
    let dist = Math.hypot(dirToGoal.x, dirToGoal.y);
    if (dist > 0.1) {
      let interceptDistance = CONFIG.CELL_SIZE * (3 + Math.random() * 3);
      return {
        x: opponent.x + (dirToGoal.x / dist) * interceptDistance,
        y: opponent.y + (dirToGoal.y / dist) * interceptDistance
      };
    }
  } else if (roll < 0.8) {
    // Find a chokepoint at midpoint
    const midX = (player.x + opponent.x) / 2;
    const midY = (player.y + opponent.y) / 2;
    const chokepoints = findChokepoints({ x: midX, y: midY }, 5);
    if (chokepoints.length > 0) {
      const pick = chokepoints[Math.floor(Math.random() * Math.min(3, chokepoints.length))];
      return { x: pick.x, y: pick.y };
    }
  }

  // DEFENSIVE fallback: ring around our goal
  let ourGoalX = CONFIG.MAZE_OFFSET_X + (player.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let ourGoalY = (player.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let angle = Math.random() * Math.PI * 2;
  let distFromGoal = CONFIG.CELL_SIZE * 2.5 + Math.random() * CONFIG.CELL_SIZE * 0.5;
  return {
    x: ourGoalX + Math.cos(angle) * distFromGoal,
    y: ourGoalY + Math.sin(angle) * distFromGoal
  };
}
