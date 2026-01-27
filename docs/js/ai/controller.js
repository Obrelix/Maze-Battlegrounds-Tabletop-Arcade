import { CONFIG } from '../config.js';
import { STATE } from '../state.js';
import { findPathToTarget, isPlayerStuck, getUnstuckDirection } from './pathfinding.js';
import { decideStrategy } from './strategy.js';
import { shouldChargeBeam, shouldFireBeamBasic, shouldDetonateNearbyMines, calculateAdvancedMinePositions } from './combat.js';
import { getActiveConfig, adjustDifficultyDynamically, getEnergyStrategy } from './difficulty.js';

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

      // C. Calculate Pathfinding Vector
      player.aiMentalModel.moveDir = getSmartMovementDirection(player, player.aiMentalModel.strategy, currentConfig);

      // D. Tactical Adjustments (Mine avoidance)
      STATE.mines.forEach(mine => {
        let dist = Math.hypot(mine.x - player.x, mine.y - player.y);
        if (dist < 4.5) {
          let pushX = player.x - mine.x;
          let pushY = player.y - mine.y;
          player.aiMentalModel.moveDir.dx += pushX * 2.0;
          player.aiMentalModel.moveDir.dy += pushY * 2.0;
        }
      });
  }

  // --- 3. EXECUTION PHASE ---
  let moveDir = player.aiMentalModel.moveDir;
  let energyStrat = player.aiMentalModel.energyStrat;
  let strategy = player.aiMentalModel.strategy;

  const DEADZONE = 0.05;
  if (Math.abs(moveDir.dx) > DEADZONE) {
    cmd.left = moveDir.dx < 0;
    cmd.right = moveDir.dx > 0;
  }
  if (Math.abs(moveDir.dy) > DEADZONE) {
    cmd.up = moveDir.dy < 0;
    cmd.down = moveDir.dy > 0;
  }

  // Actions (Shield/Boost)
  if (energyStrat.shield && Math.random() <= currentConfig.SHIELD_CHANCE) cmd.shield = true;
  if (player.boostEnergy > 20 && energyStrat.boost) cmd.boost = true;

  if (shouldDetonateNearbyMines(player, opponent)) cmd.boom = true;

  // Beam Logic
  if (player.boostEnergy > currentConfig.MIN_BEAM_ENERGY) {
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
