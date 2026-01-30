import { CONFIG, TIMING } from '../config.js';
import { STATE } from '../state.js';
import { hasLineOfSight, isWall } from '../grid.js';
import { predictPlayerMovement } from './strategy.js';

// Re-export hasLineOfSight for backward compatibility
export { hasLineOfSight };

// Opponent prediction will be passed as parameter to avoid circular import

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
 * Wall-aware version checks both perpendicular directions and prefers wall-free path
 * @param {string} threatDirection - Direction the threat is coming from
 * @param {Object} player - Player object with x, y position (optional for wall-aware dodge)
 * @param {boolean} wallAware - Whether to check walls before choosing direction
 * @returns {{dx: number, dy: number}} Dodge movement vector
 */
export function getDodgeDirection(threatDirection, player = null, wallAware = false) {
  let option1, option2;

  // Determine perpendicular dodge directions based on threat
  switch (threatDirection) {
    case 'left':
    case 'right':
      // Threat is horizontal, dodge vertically
      option1 = { dx: 0, dy: -1 }; // up
      option2 = { dx: 0, dy: 1 };  // down
      break;
    case 'up':
    case 'down':
      // Threat is vertical, dodge horizontally
      option1 = { dx: -1, dy: 0 }; // left
      option2 = { dx: 1, dy: 0 };  // right
      break;
    default:
      return { dx: 0, dy: 0 };
  }

  // If not wall-aware or no player position, use random 50/50
  if (!wallAware || !player) {
    return Math.random() < 0.5 ? option1 : option2;
  }

  // Wall-aware dodge: check both directions for walls
  const checkDist = 4; // pixels to check ahead
  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;

  const wall1 = isWall(playerCenterX + option1.dx * checkDist, playerCenterY + option1.dy * checkDist);
  const wall2 = isWall(playerCenterX + option2.dx * checkDist, playerCenterY + option2.dy * checkDist);

  // Prefer wall-free direction
  if (wall1 && !wall2) {
    return option2;
  }
  if (!wall1 && wall2) {
    return option1;
  }

  // Both clear or both blocked - random choice
  return Math.random() < 0.5 ? option1 : option2;
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

/**
 * Check if AI should fire beam at opponent
 * @param {Object} player - AI player
 * @param {Object} opponent - Opponent player
 * @param {boolean} useDistanceCheck - Whether to apply distance-based firing probability
 * @param {Object} opponentPrediction - Optional opponent behavior prediction data
 * @param {Object} currentConfig - AI difficulty configuration (optional)
 * @returns {boolean} True if should fire
 */
export function shouldFireBeamBasic(player, opponent, useDistanceCheck = false, opponentPrediction = null, currentConfig = null) {
  // Don't waste energy firing at shielded opponents
  if (opponent.shieldActive) {
    return false;
  }

  // If opponent frequently shields, consider delaying or using charged beam
  // But INSANE AI doesn't hesitate
  const isInsane = currentConfig?.NAME === 'INSANE';
  if (!isInsane && opponentPrediction && opponentPrediction.shieldProbability > 0.3) {
    // High shield probability - 40% chance to hold fire and wait for better opportunity
    if (Math.random() < 0.4) {
      return false;
    }
  }

  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;
  const oppCenterX = opponent.x + opponent.size / 2;
  const oppCenterY = opponent.y + opponent.size / 2;

  // INSANE has wider tolerance - fires more often
  const TOLERANCE = isInsane ? 4.0 : 2.5;
  const dx = Math.abs(playerCenterX - oppCenterX);
  const dy = Math.abs(playerCenterY - oppCenterY);

  const currentlyAlignedX = dy < TOLERANCE;
  const currentlyAlignedY = dx < TOLERANCE;

  // Quick check: currently aligned?
  if (currentlyAlignedX || currentlyAlignedY) {
    if (!hasLineOfSight(playerCenterX, playerCenterY, oppCenterX, oppCenterY)) {
      return false;
    }

    // INSANE always fires when aligned - no distance check
    if (isInsane) {
      return true;
    }

    // Apply distance-based firing probability
    if (useDistanceCheck) {
      const dist = Math.hypot(dx, dy);
      let fireChance;
      if (dist < 12) {
        fireChance = 1.0;  // Close range: always fire
      } else if (dist < 24) {
        fireChance = 0.6;  // Medium range: 60% chance
      } else {
        fireChance = 0.3;  // Long range: 30% chance
      }
      return Math.random() < fireChance;
    }

    return true;
  }

  // INSANE: Also fire if NEARLY aligned (will hit if opponent moves into beam path)
  if (isInsane) {
    const nearTolerance = 6.0;
    const nearlyAlignedX = dy < nearTolerance;
    const nearlyAlignedY = dx < nearTolerance;

    if ((nearlyAlignedX || nearlyAlignedY) && hasLineOfSight(playerCenterX, playerCenterY, oppCenterX, oppCenterY)) {
      // Fire with some probability based on how close to aligned
      const alignmentQuality = nearlyAlignedX ? (nearTolerance - dy) / nearTolerance : (nearTolerance - dx) / nearTolerance;
      if (Math.random() < alignmentQuality * 0.7) {
        return true;
      }
    }
  }

  // Check future alignment (prediction)
  if (opponent.lastDir) {
    // INSANE predicts further ahead
    const predictionFrames = isInsane ? 12 : 8;
    const futureX = oppCenterX + opponent.lastDir.x * predictionFrames;
    const futureY = oppCenterY + opponent.lastDir.y * predictionFrames;
    const willBeAlignedX = Math.abs(playerCenterY - futureY) < TOLERANCE;
    const willBeAlignedY = Math.abs(playerCenterX - futureX) < TOLERANCE;

    if (willBeAlignedX || willBeAlignedY) {
      if (!hasLineOfSight(playerCenterX, playerCenterY, oppCenterX, oppCenterY)) {
        return false;
      }

      // Apply distance-based check for predicted shots too (slightly lower chances)
      // INSANE doesn't use distance check
      if (useDistanceCheck && !isInsane) {
        const dist = Math.hypot(dx, dy);
        let fireChance;
        if (dist < 12) {
          fireChance = 0.9;  // Close range: high chance
        } else if (dist < 24) {
          fireChance = 0.45; // Medium range: moderate chance
        } else {
          fireChance = 0.2;  // Long range: low chance
        }
        return Math.random() < fireChance;
      }

      return true;
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

/**
 * Record mine placement in player's history for density tracking
 * @param {Object} player - AI player
 * @param {number} x - X position of placed mine
 * @param {number} y - Y position of placed mine
 * @param {number} frameCount - Current frame count
 */
export function recordMinePlacement(player, x, y, frameCount) {
  if (!player.minePlacementHistory) {
    player.minePlacementHistory = [];
  }
  player.minePlacementHistory.push({ x, y, frame: frameCount });
  // Keep only last 10 placements
  if (player.minePlacementHistory.length > 10) {
    player.minePlacementHistory.shift();
  }
}

/**
 * Check if placing a mine at position would cause clustering
 * Enhanced version also checks against recent placement history
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} player - Player object with minePlacementHistory (optional)
 * @param {number} minDistance - Minimum distance between mines (in cells)
 * @param {number} maxNearby - Maximum mines allowed within minDistance
 * @returns {boolean} True if position is too crowded
 */
function isMineAreaCrowded(x, y, player = null, minDistance = 2, maxNearby = 1) {
  const minDistPixels = minDistance * CONFIG.CELL_SIZE;
  let nearbyCount = 0;

  // Check against existing mines
  for (const mine of STATE.mines) {
    const dist = Math.hypot(mine.x - x, mine.y - y);
    if (dist < minDistPixels) {
      nearbyCount++;
      if (nearbyCount > maxNearby) {
        return true;
      }
    }
  }

  // Check against recent placements (avoid re-mining same spots)
  if (player?.minePlacementHistory) {
    for (const placement of player.minePlacementHistory) {
      if (Math.hypot(placement.x - x, placement.y - y) < minDistPixels * 1.5) {
        nearbyCount++;
        if (nearbyCount > maxNearby) {
          return true;
        }
      }
    }
  }

  return false;
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
  const checkDensity = currentConfig.MINE_DENSITY_CHECK || false;

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
      // Filter chokepoints by mine density if enabled
      let validChokepoints = chokepoints;
      if (checkDensity) {
        validChokepoints = chokepoints.filter(cp => !isMineAreaCrowded(cp.x, cp.y, player));
      }

      if (validChokepoints.length > 0) {
        // Pick one of the top 3 valid chokepoints randomly
        const pick = validChokepoints[Math.floor(Math.random() * Math.min(3, validChokepoints.length))];
        return { x: pick.x, y: pick.y };
      }
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
