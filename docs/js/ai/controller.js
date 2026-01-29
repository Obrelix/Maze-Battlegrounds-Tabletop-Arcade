import { CONFIG } from '../config.js';
import { STATE } from '../state.js';
import { findPathToTarget, isPlayerStuck, getUnstuckDirection } from './pathfinding.js';
import { decideStrategy, shouldExecuteCombo } from './strategy.js';
import { shouldChargeBeam, shouldFireBeamBasic, shouldDetonateNearbyMines, calculateAdvancedMinePositions } from './combat.js';
import { getActiveConfig, adjustDifficultyDynamically, getEnergyStrategy } from './difficulty.js';

/**
 * Calculate movement direction toward target using pathfinding
 * Includes human error simulation for more realistic AI behavior
 * @param {Object} player - AI player object
 * @param {Object} target - Target position {x, y}
 * @param {Object} currentConfig - AI difficulty configuration
 * @returns {{dx: number, dy: number}} Movement vector
 */
function getSmartMovementDirection(player, target, currentConfig) {
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
      player.unstuckDir = getUnstuckDirection();
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
      // A. Decide High-Level Strategy
      player.aiMentalModel.strategy = decideStrategy(player, opponent, currentConfig);

      // B. Decide Energy Usage
      player.aiMentalModel.energyStrat = getEnergyStrategy(player, opponent, currentConfig);

      // B2. Check for Combo Opportunities
      player.aiMentalModel.combo = shouldExecuteCombo(player, opponent, currentConfig);

      // C. Calculate Pathfinding Vector
      player.aiMentalModel.moveDir = getSmartMovementDirection(player, player.aiMentalModel.strategy, currentConfig);

      // D. Tactical Adjustments (Mine avoidance and escape)
      let nearbyMines = [];
      let dangerLevel = 0;

      STATE.mines.forEach(mine => {
        let dist = Math.hypot(mine.x - player.x, mine.y - player.y);
        if (dist < 8) {
          nearbyMines.push({ mine, dist });
          // Closer mines are more dangerous
          dangerLevel += (8 - dist) / 8;
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
          let pushStrength = (8 - dist) / dist;
          escapeX += (pushX / pushDist) * pushStrength;
          escapeY += (pushY / pushDist) * pushStrength;
        }
      });

      // Apply escape vector with increased urgency based on danger
      if (nearbyMines.length > 0) {
        let escapeStrength = Math.min(dangerLevel * 1.5, 4);
        player.aiMentalModel.moveDir.dx += escapeX * escapeStrength;
        player.aiMentalModel.moveDir.dy += escapeY * escapeStrength;

        // If trapped by multiple mines (high danger), use defensive measures
        if (dangerLevel > 1.5) {
          player.aiMentalModel.mineTrapDanger = true;
          // Boost to escape faster if possible
          if (player.boostEnergy > 30) {
            player.aiMentalModel.energyStrat.boost = true;
          }
          // Shield if boost won't help (very close mines)
          if (dangerLevel > 2.5 && player.boostEnergy > 20) {
            player.aiMentalModel.energyStrat.shield = true;
          }
        } else {
          player.aiMentalModel.mineTrapDanger = false;
        }
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

  // Execute Combo if active (high priority)
  if (combo && combo.actions) {
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
    if (currentConfig.TACTICAL_CHARGING_ENABLED && strategy?.canCharge) {
      shouldFire = shouldChargeBeam(player, opponent, currentConfig);
    } else {
      shouldFire = shouldFireBeamBasic(player, opponent);
    }
    if (shouldFire && Math.random() < 0.95) cmd.beam = true;
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

  // Update State for next frame
  player.lastPos = { x: player.x, y: player.y };

  return cmd;
}
