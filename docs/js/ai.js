// ============================================================
// ADVANCED AI: ENHANCED GOD TIER (UNFAIR & RUTHLESS v2.0)
// ============================================================
// New features added:
// 1. Advanced mine placement strategy
// 2. Tactical charging system
// 3. Adaptive difficulty scaling
// 4. Extended predictive movement
// 5. Combo chain detection
// 6. Energy management mastery
// ============================================================

import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { isWall, gridIndex } from './grid.js';
import { DIFFICULTY_PRESETS, TACTICAL_STYLES } from './ai_config_presets.js';

let LOCAL_AI_CONFIG = { ...DIFFICULTY_PRESETS.INTERMEDIATE };

// ============================================================
// 1. ADVANCED PATHFINDING (CORNER CUTTING)
// ============================================================

function findPathToTarget(fromPlayer, targetX, targetY) {
  if (!STATE.maze || STATE.maze.length === 0) return [];

  let startC = Math.floor((fromPlayer.x - CONFIG.MAZE_OFFSET_X + (fromPlayer.size / 2)) / CONFIG.CELL_SIZE);
  let startR = Math.floor((fromPlayer.y + (fromPlayer.size / 2)) / CONFIG.CELL_SIZE);
  let endC = Math.floor((targetX - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
  let endR = Math.floor(targetY / CONFIG.CELL_SIZE);

  startC = Math.max(0, Math.min(startC, CONFIG.COLS - 1));
  startR = Math.max(0, Math.min(startR, CONFIG.ROWS - 1));
  endC = Math.max(0, Math.min(endC, CONFIG.COLS - 1));
  endR = Math.max(0, Math.min(endR, CONFIG.ROWS - 1));

  let start = gridIndex(startC, startR);
  let end = gridIndex(endC, endR);

  if (!start || !end) return [];

  STATE.maze.forEach(c => {
    c.bfsVisited = false;
    c.parent = null;
  });

  let queue = [start];
  start.bfsVisited = true;
  let found = false;

  while (queue.length > 0) {
    let curr = queue.shift();
    if (curr === end) {
      found = true;
      break;
    }

    let dirs = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
    dirs.sort((a, b) => {
      let distA = Math.abs((curr.c + a[0]) - endC) + Math.abs((curr.r + a[1]) - endR);
      let distB = Math.abs((curr.c + b[0]) - endC) + Math.abs((curr.r + b[1]) - endR);
      return distA - distB;
    });

    dirs.forEach(d => {
      let n = gridIndex(curr.c + d[0], curr.r + d[1]);
      if (n && !n.bfsVisited && !curr.walls[d[2]] && !n.walls[(d[2] + 2) % 4]) {
        n.bfsVisited = true;
        n.parent = curr;
        queue.push(n);
      }
    });
  }

  if (!found) return [];

  let path = [];
  let temp = end;
  while (temp) {
    path.push(temp);
    temp = temp.parent;
  }
  path.reverse();
  return path;
}

// ============================================================
// 2. ENHANCED STRATEGY ENGINE
// ============================================================

function decideStrategy(player, opponent, currentConfig) {
  let goalX = CONFIG.MAZE_OFFSET_X + (player.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let goalY = (player.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

  let oppGoalX = CONFIG.MAZE_OFFSET_X + (opponent.goalC * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);
  let oppGoalY = (opponent.goalR * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2);

  let myDistToGoal = Math.hypot(goalX - player.x, goalY - player.y);
  let enemyDistToTheirGoal = Math.hypot(oppGoalX - opponent.x, oppGoalY - opponent.y);
  let distToEnemy = Math.hypot(opponent.x - player.x, opponent.y - player.y);

  let aggression = currentConfig.BASE_AGGRESSION || 0.6;
  const scoreDiff = opponent.score - player.score;
  if (scoreDiff >= 2) aggression *= (currentConfig.AGGRESSION_SCALE_UP || 1.3);
  if (scoreDiff <= -2) aggression *= (currentConfig.AGGRESSION_SCALE_DOWN || 0.8);

  // PANIC DEFENSE
  if (enemyDistToTheirGoal < 20 || (enemyDistToTheirGoal < myDistToGoal && player.score <= opponent.score)) {
    return { x: oppGoalX, y: oppGoalY, type: 'BLOCK_GOAL', priority: 10 };
  }

  // EXECUTE STUNNED
  if (opponent.stunTime > 0 || opponent.glitchTime > 0) {
    return { x: opponent.x + opponent.size / 2, y: opponent.y + opponent.size / 2, type: 'EXECUTE', priority: 9, canCharge: true };
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

  // PREDICTIVE INTERCEPT
  if (player.boostEnergy > 15) {
    let predictedPos = predictPlayerMovement(opponent, currentConfig);
    let distToPredicted = Math.hypot(predictedPos.x - player.x, predictedPos.y - player.y);
    let huntThreshold = currentConfig.HUNT_THRESHOLD || 60;
    if (scoreDiff > 0) huntThreshold *= 1.2;

    if (distToPredicted < huntThreshold && aggression > 0.5) {
      return { x: predictedPos.x, y: predictedPos.y, type: 'HUNT', priority: 7, aggressive: true };
    }
  }

  return { x: goalX, y: goalY, type: 'GOAL', priority: 1 };
}

// ============================================================
// 2.5 ADVANCED MINE PLACEMENT
// ============================================================

function calculateAdvancedMinePositions(player, opponent, currentConfig) {
  if (!currentConfig.ADVANCED_MINING_ENABLED) {
    let randomCell = STATE.maze[Math.floor(Math.random() * STATE.maze.length)];
    return {
      x: CONFIG.MAZE_OFFSET_X + (randomCell.c * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2),
      y: (randomCell.r * CONFIG.CELL_SIZE) + (CONFIG.CELL_SIZE / 2)
    };
  }

  const scoreDiff = opponent.score - player.score;
  const mineStrategy = currentConfig.MINE_STRATEGY || 'BALANCED';

  // DEFENSIVE: Protect own goal when losing
  if (mineStrategy === 'DEFENSIVE' || scoreDiff > 0) {
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
  if (mineStrategy === 'AGGRESSIVE' || scoreDiff < 0) {
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

  // BALANCED: 60% aggressive, 40% defensive
  if (Math.random() < 0.6) {
    return calculateAdvancedMinePositions(player, opponent, { ...currentConfig, MINE_STRATEGY: 'AGGRESSIVE' });
  } else {
    return calculateAdvancedMinePositions(player, opponent, { ...currentConfig, MINE_STRATEGY: 'DEFENSIVE' });
  }
}



// ============================================================
// 3. TACTICAL CHARGING
// ============================================================

function shouldChargeBeam(player, opponent, currentConfig) {
  if (!currentConfig.TACTICAL_CHARGING_ENABLED) {
    return shouldFireBeamBasic(player, opponent);
  }

  if (player.boostEnergy < (currentConfig.MIN_CHARGE_ENERGY || 65)) {
    return false;
  }

  if (opponent.stunTime > 200) {
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

function shouldFireBeamBasic(player, opponent) {
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

// ============================================================
// 4. EXTENDED PREDICTIVE MOVEMENT
// ============================================================

function predictPlayerMovement(opponent, currentConfig) {
  if (!opponent.lastDir) {
    return { x: opponent.x, y: opponent.y };
  }

  let predictionFrames = currentConfig.PREDICTION_WINDOW || 15;

  if (currentConfig.TACTICAL_PROBABILITY > 0.7) {
    predictionFrames = 20;
  }
  if (currentConfig.TACTICAL_PROBABILITY > 0.9) {
    predictionFrames = 25;
  }

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

function analyzeDirectionChanges(opponent) {
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

function predictCornerCut(opponent, predictedX, predictedY) {
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

// ============================================================
// 5. COMBO CHAIN DETECTION
// ============================================================

function shouldExecuteCombo(player, opponent, currentConfig) {
  if (!currentConfig.COMBO_CHAINS_ENABLED) return null;

  if (opponent.stunTime > 300 && player.boostEnergy > 65) {
    return {
      type: 'STUN_CHARGE',
      actions: ['charge_beam'],
      priority: 10,
      window: opponent.stunTime
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

// ============================================================
// 6. MOVEMENT DIRECTION
// ============================================================

function getSmartMovementDirection(player, target, currentConfig) {
  let path = findPathToTarget(player, target.x, target.y);

  let dxRaw = target.x - player.x;
  let dyRaw = target.y - player.y;

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

// ============================================================
// 7. ADAPTIVE DIFFICULTY
// ============================================================

function adjustDifficultyDynamically(playerScore, cpuScore, currentConfig) {
  if (!currentConfig.ADAPTIVE_DIFFICULTY_ENABLED) return currentConfig;

  const scoreDiff = cpuScore - playerScore;

  if (scoreDiff <= -3) {
    console.log("🔥 Player crushing CPU - ramping up difficulty!");
    return {
      ...currentConfig,
      MIN_BEAM_ENERGY: Math.max(15, currentConfig.MIN_BEAM_ENERGY * 0.6),
      MIN_CHARGE_ENERGY: Math.max(50, currentConfig.MIN_CHARGE_ENERGY * 0.7),
      HUNT_THRESHOLD: 85,
      TACTICAL_PROBABILITY: Math.min(0.95, currentConfig.TACTICAL_PROBABILITY + 0.15),
    };
  }

  if (scoreDiff >= 3) {
    console.log("😎 CPU crushing player - easing off slightly");
    return {
      ...currentConfig,
      MIN_BEAM_ENERGY: Math.min(50, currentConfig.MIN_BEAM_ENERGY * 1.3),
      MIN_CHARGE_ENERGY: Math.min(85, currentConfig.MIN_CHARGE_ENERGY * 1.2),
      HUNT_THRESHOLD: 40,
      TACTICAL_PROBABILITY: Math.max(0.5, currentConfig.TACTICAL_PROBABILITY - 0.1),
    };
  }

  return currentConfig;
}

function getEnergyStrategy(player, opponent) {
  let dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);
  let scoreDiff = opponent.score - player.score;

  if (dist < 10 && player.boostEnergy > 25) return { shield: true, boost: false };
  if (scoreDiff >= 3 && player.boostEnergy > 65) return { shield: false, boost: false };
  if (scoreDiff <= -2 && player.boostEnergy > 50) return { shield: false, boost: true };

  return { shield: false, boost: Math.random() < 0.4 };
}

function shouldDetonateNearbyMines(player, opponent) {
  if (STATE.mines.length === 0) return false;
  let closeMines = STATE.mines.filter(mine => {
    let distPlayer = Math.hypot(mine.x - player.x, mine.y - player.y);
    let distOpp = Math.hypot(mine.x - opponent.x, mine.y - opponent.y);
    return (mine.owner === player.id || mine.owner === -1) &&
      distOpp < 6 && distPlayer > 5;
  });
  return closeMines.length > 0 && player.boostEnergy > 20;
}
function isPlayerStuck(player) {
  if (!player.lastPos) return false;
  let dx = Math.abs(player.x - player.lastPos.x);
  let dy = Math.abs(player.y - player.lastPos.y);
  return (dx < 0.3 && dy < 0.3);
}

function getUnstuckDirection() {
  let directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
  ];
  for (let i = directions.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }
  return directions[0];
}
// ============================================================
// MAIN CPU INPUT (ENHANCED)
// ============================================================

export function getCpuInput(player, opponent) {
  let cmd = {
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
    beam: false,
    shield: false,
    mine: false,
    boom: false,
    start: false
  };
  // STUCK DETECTION
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

  // FORCE UNSTUCK
  if (player.forceUnstuckTimer > 0) {
    player.forceUnstuckTimer--;
    let dir = player.unstuckDir || { x: 0, y: 0 };
    if (dir.x < 0) cmd.left = true;
    if (dir.x > 0) cmd.right = true;
    if (dir.y < 0) cmd.up = true;
    if (dir.y > 0) cmd.down = true;
    return cmd;
  }

  if (!player || !opponent) return cmd;
  let energyStrat = getEnergyStrategy(player, opponent);
  let currentConfig = (typeof window !== 'undefined' && window.AI_CONFIG)
    ? window.AI_CONFIG
    : LOCAL_AI_CONFIG;

  if (currentConfig.ADAPTIVE_DIFFICULTY_ENABLED) {
    currentConfig = adjustDifficultyDynamically(player.score, opponent.score, currentConfig);
  }

  const IS_INSANE = (currentConfig.TACTICAL_PROBABILITY > 0.9);

  let strategy = decideStrategy(player, opponent, currentConfig);
  let moveDir = getSmartMovementDirection(player, strategy, currentConfig);

  STATE.mines.forEach(mine => {
    let dist = Math.hypot(mine.x - player.x, mine.y - player.y);
    if (dist < 4.5) {
      let pushX = player.x - mine.x;
      let pushY = player.y - mine.y;
      moveDir.dx += pushX * 2.0;
      moveDir.dy += pushY * 2.0;
    }
  });

  const DEADZONE = 0.05;
  if (Math.abs(moveDir.dx) > DEADZONE) {
    cmd.left = moveDir.dx < 0;
    cmd.right = moveDir.dx > 0;
  }
  if (Math.abs(moveDir.dy) > DEADZONE) {
    cmd.up = moveDir.dy < 0;
    cmd.down = moveDir.dy > 0;
  }

  if (energyStrat.shield) cmd.shield = true;
  if (player.boostEnergy > 20 && energyStrat.boost) cmd.boost = true;

  // if (player.boostEnergy > 15) {
  //   let isMoving = Math.abs(moveDir.dx) > 0.1 || Math.abs(moveDir.dy) > 0.1;
  //   if (isMoving) {
  //     if (strategy.type === 'BLOCK_GOAL' || strategy.type === 'EXECUTE' || strategy.type === 'SCAVENGE') {
  //       cmd.boost = true;
  //     }
  //     if (strategy.type === 'HUNT' && Math.hypot(player.x - opponent.x, player.y - opponent.y) > 10) {
  //       cmd.boost = true;
  //     }
  //   }
  // }

  // if (player.boostEnergy > 5) {
  //   let imminentDanger = false;
  //   STATE.projectiles.forEach(p => {
  //     if (p.owner !== player.id) {
  //       let dist = Math.hypot(p.x - player.x, p.y - player.y);
  //       if (dist < 4.0) imminentDanger = true;
  //     }
  //   });
  //   if (imminentDanger) cmd.shield = true;
  // }
  if (shouldDetonateNearbyMines(player, opponent)) cmd.boom = true;
  let combo = shouldExecuteCombo(player, opponent, currentConfig);
  if (combo) {
    combo.actions.forEach(action => {
      if (action === 'charge_beam') cmd.beam = true;
      if (action === 'boost') cmd.boost = true;
    });
  }

  if (player.boostEnergy > currentConfig.MIN_BEAM_ENERGY) {
    let shouldFire = false;

    if (currentConfig.TACTICAL_CHARGING_ENABLED && strategy.canCharge) {
      shouldFire = shouldChargeBeam(player, opponent, currentConfig);
    } else {
      shouldFire = shouldFireBeamBasic(player, opponent);
    }

    if (shouldFire && Math.random() < 0.95) cmd.beam = true;
  }

  let distToEnemy = Math.hypot(player.x - opponent.x, player.y - opponent.y);
  if (player.minesLeft > 0 && distToEnemy < 8.0 && Math.random() < 0.25) {
    cmd.mine = true;
  }

  if (cmd.mine && currentConfig.ADVANCED_MINING_ENABLED) {
    let strategicPos = calculateAdvancedMinePositions(player, opponent, currentConfig);
    player._suggestedMinePos = strategicPos;
  }

  STATE.mines.forEach(mine => {
    if ((mine.owner === player.id || mine.owner === -1) && !mine.active) return;
    let d = Math.hypot(mine.x - opponent.x, mine.y - opponent.y);
    if (d < 3.5) cmd.boom = true;
  });
  player.lastPos = { x: player.x, y: player.y };
  return cmd;
}

export function getDifficultyPreset(difficulty = 'INTERMEDIATE') {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.INTERMEDIATE;
}

export function setDifficulty(difficulty = 'INTERMEDIATE', tacticalStyle = null) {
  const baseConfig = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.INTERMEDIATE;
  let styleConfig = {};

  if (tacticalStyle && TACTICAL_STYLES[tacticalStyle]) {
    styleConfig = TACTICAL_STYLES[tacticalStyle];
  }

  let enhancedConfig = {
    ...baseConfig,
    ...styleConfig,
    ADVANCED_MINING_ENABLED: true,
    TACTICAL_CHARGING_ENABLED: true,
    ADAPTIVE_DIFFICULTY_ENABLED: difficulty !== 'BEGINNER',
    PREDICTIVE_MOVEMENT_ENABLED: true,
    COMBO_CHAINS_ENABLED: difficulty !== 'BEGINNER',
    CORNER_CUT_DETECTION: difficulty !== 'BEGINNER',
    RESOURCE_DENIAL_ENABLED: difficulty !== 'BEGINNER',
    PREDICTION_WINDOW: difficulty === 'INSANE' ? 25 : difficulty === 'HARD' ? 20 : 15,
    BASE_AGGRESSION: difficulty === 'INSANE' ? 0.95 : difficulty === 'HARD' ? 0.75 : 0.5,
    AGGRESSION_SCALE_UP: 1.4,
    AGGRESSION_SCALE_DOWN: 0.8,
    MINE_STRATEGY: difficulty === 'INSANE' ? 'AGGRESSIVE' : difficulty === 'HARD' ? 'BALANCED' : 'DEFENSIVE',
  };

  if (typeof window !== 'undefined') {
    window.AI_CONFIG = enhancedConfig;
  } else {
    LOCAL_AI_CONFIG = enhancedConfig;
  }

  console.log(`✨ AI Enhanced - Difficulty set to ${difficulty}`);
}

setDifficulty('INTERMEDIATE');

export { DIFFICULTY_PRESETS, TACTICAL_STYLES };
