import { CONFIG, TAUNTS, TIMING, ENERGY_COSTS, ENERGY_RATES, GAME, COLLISION } from './config.js';
import { STATE, saveHighScore, recordMatchStats } from './state.js';
import { isWall, destroyWallAt, gridIndex } from './grid.js';
import { seededRandom } from './seededRandom.js';
import {
    playShieldSfx, playChargeSfx, playMineDropSfx, playShootSfx,
    playChargedShootSfx, playExplosionSfx, playDeathSfx,
    playWinSfx, playRoundOverSfx, playPowerupSfx, playBoostSfx,
    shakeCamera, spawnDeathParticles, spawnExplosionParticles,
    spawnWallHitParticle, spawnMuzzleFlashParticles,
    setDeathMessages
} from './effects.js';

//// Helper functions

function handleDetonate(p, input, now) {
    // Detonate - collect mines first to avoid race condition during explosion chain
    if (input.boom && !p.prevDetonateKey) {
        if (p.boostEnergy >= ENERGY_COSTS.DETONATION) {
            // Collect mines to detonate (avoid modifying array during iteration)
            let minesToDetonate = [];
            for (let i = STATE.mines.length - 1; i >= 0; i--) {
                if (STATE.mines[i].owner === p.id || STATE.mines[i].owner === -1) {
                    minesToDetonate.push({ x: STATE.mines[i].x, y: STATE.mines[i].y, idx: i });
                }
            }

            if (minesToDetonate.length > 0) {
                p.boostEnergy -= ENERGY_COSTS.DETONATION;
                // Remove mines first (in reverse order to preserve indices)
                minesToDetonate.sort((a, b) => b.idx - a.idx);
                for (let m of minesToDetonate) {
                    STATE.mines.splice(m.idx, 1);
                }
                // Then trigger explosions (safe - no more array modification)
                for (let m of minesToDetonate) {
                    triggerExplosion(m.x, m.y, "WAS FRAGGED");
                }
            }
        }
    }
    p.prevDetonateKey = input.boom;
}

function handleShield(p, input, now) {
    // Shield
    if (input.shield && p.boostEnergy > 0) {
        if (!p.shieldActive) {
            p.boostEnergy -= ENERGY_COSTS.SHIELD_ACTIVATION;
        }
        if (p.boostEnergy > 0 && !p.shieldActive) {
            playShieldSfx();
            p.shieldActive = true;
        }
        p.boostEnergy -= ENERGY_RATES.SHIELD_DRAIN;
        // Clamp to 0 so we don't go negative
        if (p.boostEnergy < 0) p.boostEnergy = 0;
    } else {
        p.shieldActive = false;
    }
}

function handleBeamInput(p, input, now) {// Beam
    if (input.beam) {
        if (!p.isCharging) {
            p.isCharging = true;
            p.chargeStartTime = now;
        }
        if (p.chargeIsReady(now)) {
            fireChargedBeam(p);
            p.isCharging = false;
            p.chargeStartTime = 0;
        } else if (p.isCharging && now % 6 === 0) {
            playChargeSfx();
        }
    } else {
        if (p.isCharging) {
            if (!p.chargeIsReady(now))
                fireBeam(p);
            p.isCharging = false;
        }
        // Reset
        p.isCharging = false;
        p.chargeStartTime = 0;
    }
}

function handleMovement(p, input, now) {
    // Movement
    let speed = CONFIG.BASE_SPEED;
    if (p.stunIsActive(now)) {
        speed = CONFIG.BASE_SPEED * COLLISION.STUN_SPEED_MULT;
        if (!input.boost && !p.shieldActive) p.boostEnergy = Math.min(CONFIG.MAX_ENERGY, p.boostEnergy + ENERGY_RATES.BOOST_REGEN);
    } else if (p.isCharging) {
        speed = CONFIG.BASE_SPEED * CONFIG.CHARGE_MOVEMENT_PENALTY;
        // No energy regen while charging - charging is a commitment
    } else {
        if (p.boostCooldown > 0) {
            p.boostCooldown--;
            if (!p.shieldActive)
                p.boostEnergy = Math.min(CONFIG.MAX_ENERGY, p.boostEnergy + ENERGY_RATES.BOOST_REGEN);
        } else if (input.boost && p.boostEnergy > 0) {
            p.boostEnergy -= ENERGY_RATES.BOOST_DRAIN;
            speed = CONFIG.MAX_SPEED;
            if (p.boostEnergy <= 0) p.boostEnergy = 0;

            // Play sound every 100ms (prevents stuttering)
            if (now - p.lastBoostTime > TIMING.BOOST_SOUND_THROTTLE) {
                p.lastBoostTime = now;
                playBoostSfx();
            }
        } else {
            if (p.boostEnergy <= 0) p.boostCooldown = CONFIG.BOOST_COOLDOWN_FRAMES;
            else if (!p.shieldActive) p.boostEnergy = Math.min(CONFIG.MAX_ENERGY, p.boostEnergy + ENERGY_RATES.BOOST_REGEN);
        }
    }
    p.currentSpeed = speed;

    let dx = 0,
        dy = 0;
    if (input.up) dy = -speed;
    if (input.down) dy = speed;
    if (input.left) dx = -speed;
    if (input.right) dx = speed;

    if (p.glitchIsActive(now)) {
        dx = -dx;
        dy = -dy;
    }

    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        if (Math.abs(dx) > Math.abs(dy)) p.lastDir = {
            x: dx > 0 ? 1 : -1,
            y: 0
        };
        else p.lastDir = {
            x: 0,
            y: dy > 0 ? 1 : -1
        };
    }

    let dist = Math.hypot(dx, dy);
    let steps = Math.ceil(dist / COLLISION.MOVEMENT_STEP_SIZE);
    let sx = dx / steps;
    let sy = dy / steps;

    for (let i = 0; i < steps; i++) {
        // X-AXIS MOVEMENT
        if (sx !== 0) {
            if (!checkPlayerCollision(p, sx, 0)) {
                p.x += sx;
            } else {
                if (!checkPlayerCollision(p, sx, -COLLISION.CORNER_ASSIST_OFFSET)) {
                    p.y -= COLLISION.CORNER_NUDGE_SPEED;
                } else if (!checkPlayerCollision(p, sx, COLLISION.CORNER_ASSIST_OFFSET)) {
                    p.y += COLLISION.CORNER_NUDGE_SPEED;
                }
            }
        }

        // Y-AXIS MOVEMENT
        if (sy !== 0) {
            if (!checkPlayerCollision(p, 0, sy)) {
                p.y += sy;
            } else {
                if (!checkPlayerCollision(p, -COLLISION.CORNER_ASSIST_OFFSET, sy)) {
                    p.x -= COLLISION.CORNER_NUDGE_SPEED;
                } else if (!checkPlayerCollision(p, COLLISION.CORNER_ASSIST_OFFSET, sy)) {
                    p.x += COLLISION.CORNER_NUDGE_SPEED;
                }
            }
        }
    }
}

function handleMineDrop(p, input, now) {
    // Mine Drop
    if (input.mine && p.minesLeft > 0 && now - p.lastMineTime > TIMING.MINE_COOLDOWN) {
        playMineDropSfx();
        p.lastMineTime = now;
        p.minesLeft--;
        STATE.mines.push({
            x: Math.floor(p.x),
            y: Math.floor(p.y),
            droppedAt: now,
            active: false,
            visX: Math.floor(seededRandom() * 2),
            visY: Math.floor(seededRandom() * 2),
            owner: p.id
        });
    }

}

function handleGoal(p, input, now) {
    let gx = CONFIG.MAZE_OFFSET_X + (p.goalC * CONFIG.CELL_SIZE) + 1;
    let gy = (p.goalR * CONFIG.CELL_SIZE) + 1;
    if (Math.abs(p.x - gx) < COLLISION.GOAL_DISTANCE && Math.abs(p.y - gy) < COLLISION.GOAL_DISTANCE) {
        resolveRound(p.id, 'GOAL');
    }
}

function checkPlayerCollision(p, dx, dy) {
    let nx = p.x + dx;
    let ny = p.y + dy;
    let hitbox = COLLISION.HITBOX_SIZE;
    let pad = COLLISION.COLLISION_PAD;
    return (
        isWall(nx + pad, ny + pad) ||
        isWall(nx + pad + hitbox, ny + pad) ||
        isWall(nx + pad, ny + pad + hitbox) ||
        isWall(nx + pad + hitbox, ny + pad + hitbox)
    );
}

function handleMultiDeath(indices, reason) {
    if (STATE.isGameOver || STATE.isRoundOver || STATE.deathTimer > 0) return;

    // Set global death state
    STATE.deathTimer = COLLISION.DEATH_TIMER_FRAMES;
    setDeathMessages(reason);
    playDeathSfx();

    // Check for Draw
    if (indices.length > 1) {
        STATE.isDraw = true; // Mark as draw
    } else {
        STATE.victimIdx = indices[0]; // Mark single victim
        STATE.isDraw = false;
    }

    // Apply death effects to ALL victims
    indices.forEach(idx => {
        let p = STATE.players[idx];
        p.isDead = true;
        spawnDeathParticles(p);
    });
}

function handlePlayerDeath(victimIdx, reason) {
    if (STATE.isGameOver || STATE.isRoundOver || STATE.deathTimer > 0) return;

    // 1. Mark player as dead
    STATE.players[victimIdx].isDead = true;
    STATE.victimIdx = victimIdx;
    // 2. Store the reason in the global state (add this property implicitly)
    setDeathMessages(reason || "ELIMINATED BY A SNEAKY BUG");
    // 3. Start the Death Timer
    STATE.deathTimer = COLLISION.DEATH_TIMER_FRAMES;

    // 4. Extra visual effects
    let p = STATE.players[victimIdx];
    playDeathSfx();
    spawnDeathParticles(p);
}

function applyPlayerExplosionDamage(x, y, reason) {
    // 1. Collect all victims first
    let hitIndices = [];
    if (!STATE.isRoundOver && !STATE.isGameOver) {
        STATE.players.forEach((p, idx) => {
            if (Math.abs(p.x + 1 - (x + 1)) < CONFIG.BLAST_RADIUS && Math.abs(p.y + 1 - (y + 1)) < CONFIG.BLAST_RADIUS) {
                if (!p.shieldActive && !p.isDead) {
                    hitIndices.push(idx);
                }
            }
        });
    }

    // 2. Process deaths if anyone was hit
    if (hitIndices.length > 0) {
        handleMultiDeath(hitIndices, reason);
    }
}

function handleWallDestruction(x, y) {
    let centerC = Math.floor((x - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
    let centerR = Math.floor(y / CONFIG.CELL_SIZE);
    let cellRadius = 1;

    // --- Wall Destruction Logic ---
    for (let r = centerR - cellRadius; r <= centerR + cellRadius; r++) {
        for (let c = centerC - cellRadius; c <= centerC + cellRadius; c++) {
            if (c < 0 || c >= CONFIG.COLS || r < 0 || r >= CONFIG.ROWS) continue;
            let dc = c - centerC;
            let dr = r - centerR;
            if (dc * dc + dr * dr <= 2) {
                destroyWallAt(c, r);
            }
        }
    }
}

//// Helper functions END

/**
 * Central round resolution. All round-ending paths funnel through here.
 * @param {number|null} winnerIdx - Index of the winning player (null for draw/timeout)
 * @param {string} reason - 'GOAL', 'DRAW', 'TIMEOUT', or 'COMBAT'
 */
export function resolveRound(winnerIdx, reason) {
    // Reset online transition flag for the next transition
    STATE.onlineTransitionPending = false;

    // --- DRAW ---
    if (reason === 'DRAW') {
        STATE.messages.round = "DOUBLE KO! DRAW!";
        STATE.messages.roundColor = "#ffffff";
        playRoundOverSfx();
        STATE.isRoundOver = true;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        STATE.deathTimer = 0;
        STATE.isDraw = false;
        if (GAME.isAttractMode) GAME.demoResetTimer = TIMING.DEMO_RESET_TIMER;
        return;
    }

    // --- TIMEOUT ---
    if (reason === 'TIMEOUT') {
        let p0 = STATE.players[0];
        let p1 = STATE.players[1];

        if (p0.score === p1.score) {
            // Equal scores - it's a draw
            STATE.isDraw = true;
            STATE.messages.round = "TIME OUT! DRAW!";
            STATE.messages.roundColor = "#ffff00";
            playRoundOverSfx();
            STATE.isGameOver = true;
            STATE.messages.win = "DRAW GAME!";
            STATE.messages.winColor = "#ffffff";
            // Record as draw in stats
            if (!GAME.isAttractMode) {
                recordMatchStats(-1);
            }
        } else {
            // One player has higher score - they win
            let timeoutWinner = p0.score > p1.score ? 0 : 1;
            let winner = STATE.players[timeoutWinner];
            STATE.victimIdx = timeoutWinner === 0 ? 1 : 0;
            STATE.messages.round = `TIME OUT! ${winner.name} WINS!`;
            STATE.messages.roundColor = winner.color;
            playWinSfx();
            STATE.isGameOver = true;
            STATE.messages.win = `${winner.name} WINS!`;
            STATE.messages.winColor = winner.color;
            if (winner.name !== "CPU") saveHighScore();
            if (!GAME.isAttractMode) {
                recordMatchStats(timeoutWinner);
            }
        }

        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (GAME.isAttractMode) GAME.demoResetTimer = TIMING.DEMO_RESET_TIMER;
        return;
    }

    // --- STANDARD WIN (goal or combat) ---
    let winner = STATE.players[winnerIdx];
    let victimIdx = (winnerIdx === 0) ? 1 : 0;
    STATE.victimIdx = victimIdx;
    winner.score++;

    // Set round message based on reason
    if (reason === 'GOAL') {
        STATE.messages.round = `${winner.name} SCORES!`;
        STATE.messages.roundColor = winner.color;
    } else {
        STATE.messages.round = `${STATE.players[victimIdx]?.name} '${STATE.messages.deathReason}!'`;
        STATE.messages.roundColor = STATE.players[victimIdx].color;
    }

    if (winner.score >= CONFIG.MAX_SCORE) {
        playWinSfx();
        if (winner.name !== "CPU") saveHighScore();
        // Record match statistics (skip in attract mode)
        if (!GAME.isAttractMode) {
            recordMatchStats(winnerIdx);
        }
        STATE.isGameOver = true;
        STATE.messages.win = `${winner.name} WINS!`;
        STATE.messages.taunt = TAUNTS[Math.floor(seededRandom() * TAUNTS.length)];
        STATE.messages.winColor = winner.color;
        STATE.messages.roundColor = winner.color;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
    } else {
        playRoundOverSfx();
        STATE.isRoundOver = true;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
    }

    STATE.deathTimer = 0;
    if (GAME.isAttractMode) GAME.demoResetTimer = TIMING.DEMO_RESET_TIMER;
}

export function triggerExplosion(x, y, reason = "EXPLODED") {
    playExplosionSfx();
    shakeCamera(15);
    handleWallDestruction(x, y);
    spawnExplosionParticles(x, y);
    applyPlayerExplosionDamage(x, y, reason);
}

/**
 * Fire a homing beam toward the opponent
 * @param {Object} p - Player object firing the beam
 * @returns {boolean} True if beam was fired, false otherwise
 */
export function fireBeam(p) {
    // Validate player state
    if (!p || typeof p.boostEnergy !== 'number') {
        console.warn('fireBeam: Invalid player state');
        return false;
    }
    if (p.boostEnergy < ENERGY_COSTS.BEAM) return false;
    if (p.beamIdx < p.beamPixels.length) return false;

    let opponent = STATE.players[(p.id + 1) % 2];
    if (!opponent) {
        console.warn('fireBeam: No opponent found');
        return false;
    }

    // 2. Calculate Opponent's Grid Coordinates
    // We target the center of the opponent for accuracy
    let targetC = Math.floor((opponent.x + (opponent.size / 2) - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
    let targetR = Math.floor((opponent.y + (opponent.size / 2)) / CONFIG.CELL_SIZE);

    // 3. Set Start (Self) and End (Enemy)
    let start = gridIndex(Math.floor((p.x - CONFIG.MAZE_OFFSET_X + 1) / CONFIG.CELL_SIZE), Math.floor((p.y + 1) / CONFIG.CELL_SIZE));
    let end = gridIndex(targetC, targetR);

    if (!start || !end) return false;

    // Deduct energy (may be refunded if path not found)
    p.boostEnergy -= ENERGY_COSTS.BEAM;

    // --- PATHFINDING (Existing Logic) ---
    // Reset pathfinding flags
    STATE.maze.forEach(c => {
        c.parent = null;
        c.bfsVisited = false;
    });

    let queue = [start];
    let head = 0;
    start.bfsVisited = true;
    let found = false;

    // BFS Search Loop
    while (head < queue.length) {
        let curr = queue[head++];
        if (curr === end) {
            found = true;
            break;
        }
        [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]].forEach(d => {
            let n = gridIndex(curr.c + d[0], curr.r + d[1]);
            // Standard BFS: Check walls and visited status
            if (n && !n.bfsVisited && !curr.walls[d[2]] && !n.walls[(d[2] + 2) % 4]) {
                n.bfsVisited = true;
                n.parent = curr;
                queue.push(n);
            }
        });
    }

    // If no path to enemy (e.g., they are walled off perfectly), cancel shot
    if (!found) {
        // Refund energy if shot fails
        p.boostEnergy += ENERGY_COSTS.BEAM;
        return false;
    }

    // Path found - play sound now that shot is confirmed
    playShootSfx();

    let pathCells = [];
    let temp = end;
    while (temp) {
        pathCells.push(temp);
        temp = temp.parent;
    }
    pathCells.reverse();

    p.beamPixels = [];
    for (let i = 0; i < pathCells.length - 1; i++) {
        let x1 = CONFIG.MAZE_OFFSET_X + (pathCells[i].c * CONFIG.CELL_SIZE) + 1;
        let y1 = (pathCells[i].r * CONFIG.CELL_SIZE) + 1;
        let x2 = CONFIG.MAZE_OFFSET_X + (pathCells[i + 1].c * CONFIG.CELL_SIZE) + 1;
        let y2 = (pathCells[i + 1].r * CONFIG.CELL_SIZE) + 1;

        p.beamPixels.push({
            x: x1,
            y: y1
        });
        let dx = (x2 - x1) / 3;
        let dy = (y2 - y1) / 3;
        p.beamPixels.push({
            x: x1 + dx,
            y: y1 + dy
        });
        p.beamPixels.push({
            x: x1 + dx * 2,
            y: y1 + dy * 2
        });
    }
    p.beamPixels.push({
        x: CONFIG.MAZE_OFFSET_X + (pathCells[pathCells.length - 1].c * CONFIG.CELL_SIZE) + 1,
        y: (pathCells[pathCells.length - 1].r * CONFIG.CELL_SIZE) + 1
    });
    p.beamIdx = 0;
    return true;
}

/**
 * Apply all player actions based on input
 * @param {Object} p - Player object
 * @param {Object} input - Input state object
 */
export function applyPlayerActions(p, input) {
    let now = STATE.frameCount;
    handleDetonate(p, input, now);
    handleShield(p, input, now);
    handleBeamInput(p, input, now);
    handleMovement(p, input, now);
    handleMineDrop(p, input, now);
    handleGoal(p, input, now);
}

export function updateProjectiles() {

    // Projectiles Update
    for (let i = STATE.projectiles.length - 1; i >= 0; i--) {
        let proj = STATE.projectiles[i];
        proj.x += proj.vx;
        proj.y += proj.vy;
        proj.distTraveled += CONFIG.C_BEAM_SPEED;

        if (proj.distTraveled >= CONFIG.C_BEAM_RANGE) {
            STATE.projectiles.splice(i, 1);
            continue;
        }

        let hw = (Math.abs(proj.vx) > 0) ? CONFIG.C_BEAM_LENGTH / 2 : CONFIG.C_BEAM_WIDTH / 2;
        let hh = (Math.abs(proj.vx) > 0) ? CONFIG.C_BEAM_WIDTH / 2 : CONFIG.C_BEAM_LENGTH / 2;
        let tipX = proj.x + (proj.vx * 2);
        let tipY = proj.y + (proj.vy * 2);

        if (isWall(tipX, tipY)) {
            let gc = Math.floor((tipX - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
            let gr = Math.floor(tipY / CONFIG.CELL_SIZE);
            destroyWallAt(gc, gr);
            spawnWallHitParticle(tipX, tipY, proj.vx * 0.5, proj.vy * 0.5);
        }

        for (let mIdx = STATE.mines.length - 1; mIdx >= 0; mIdx--) {
            let m = STATE.mines[mIdx];
            if (Math.abs(proj.x - m.x) < hw + 1 && Math.abs(proj.y - m.y) < hh + 1) {
                triggerExplosion(m.x, m.y, "SHOCKWAVE");
                STATE.mines.splice(mIdx, 1);
            }
        }

        let oppId = (proj.owner + 1) % 2;
        let opp = STATE.players[oppId];
        let pLeft = opp.x;
        let pRight = opp.x + opp.size;
        let pTop = opp.y;
        let pBot = opp.y + opp.size;
        let bLeft = proj.x - hw;
        let bRight = proj.x + hw;
        let bTop = proj.y - hh;
        let bBot = proj.y + hh;

        if (bLeft < pRight && bRight > pLeft && bTop < pBot && bBot > pTop) {
            if (!opp.shieldActive) {
                handlePlayerDeath(oppId, "WAS VAPORIZED");
                STATE.projectiles.splice(i, 1);
                return;
            } else {
                STATE.projectiles.splice(i, 1);
                return;
            }
        }
    }

}

/**
 * Fire a charged beam projectile toward the opponent
 * @param {Object} p - Player object firing the beam
 * @returns {boolean} True if beam was fired, false otherwise
 */
export function fireChargedBeam(p) {
    if (!p || typeof p.boostEnergy !== 'number') {
        console.warn('fireChargedBeam: Invalid player state');
        return false;
    }
    if (p.boostEnergy < ENERGY_COSTS.CHARGED_BEAM) return false;

    let opponent = STATE.players[(p.id + 1) % 2];
    if (!opponent) {
        console.warn('fireChargedBeam: No opponent found');
        return false;
    }

    // 2. Calculate Vector to Opponent (Center to Center)
    let startX = p.x;
    let startY = p.y;

    let targetX = opponent.x + (opponent.size / 2);
    let targetY = opponent.y + (opponent.size / 2);

    let dx = targetX - startX;
    let dy = targetY - startY;
    let dist = Math.hypot(dx, dy);

    // 3. Normalize & Scale by C_BEAM_SPEED
    // Prevent division by zero if players are overlapping
    if (dist < 0.1) { dx = 1; dy = 0; dist = 1; }

    let vx = (dx / dist) * CONFIG.C_BEAM_SPEED;
    let vy = (dy / dist) * CONFIG.C_BEAM_SPEED;

    // 4. Fire!
    p.boostEnergy -= ENERGY_COSTS.CHARGED_BEAM;
    playChargedShootSfx();

    STATE.projectiles.push({
        x: startX,
        y: startY,
        vx: vx,  // Now moving towards enemy
        vy: vy,
        distTraveled: 0,
        owner: p.id,
        color: p.color
    });

    // Recoil / Kickback (Optional: pushes player back slightly)
    // p.x -= vx * 2;
    // p.y -= vy * 2;

    spawnMuzzleFlashParticles(startX, startY);
    return true;
}

/**
 * Check if both player beams collide with each other (beam vs beam)
 * Must be called BEFORE individual checkBeamActions to ensure fair collision detection
 * Samples multiple points along each beam to prevent high-speed beams passing through each other
 */
export function checkBeamCollisions() {
    let p1 = STATE.players[0];
    let p2 = STATE.players[1];
    if (p1.beamPixels.length === 0 || p2.beamPixels.length === 0) return;

    // Get the range of beam positions to check (current tip and recent trail)
    let b1Start = Math.max(0, Math.floor(p1.beamIdx) - Math.ceil(CONFIG.BEAM_SPEED));
    let b1End = Math.min(p1.beamPixels.length - 1, Math.floor(p1.beamIdx));
    let b2Start = Math.max(0, Math.floor(p2.beamIdx) - Math.ceil(CONFIG.BEAM_SPEED));
    let b2End = Math.min(p2.beamPixels.length - 1, Math.floor(p2.beamIdx));

    // Check all combinations of recent beam positions
    for (let i1 = b1Start; i1 <= b1End; i1++) {
        for (let i2 = b2Start; i2 <= b2End; i2++) {
            let h1 = p1.beamPixels[i1];
            let h2 = p2.beamPixels[i2];
            if (h1 && h2 && Math.abs(h1.x - h2.x) + Math.abs(h1.y - h2.y) < COLLISION.BEAM_COLLISION_DIST) {
                triggerExplosion((h1.x + h2.x) / 2, (h1.y + h2.y) / 2, "ANNIHILATED");
                p1.beamPixels = [];
                p1.beamIdx = 9999;
                p2.beamPixels = [];
                p2.beamIdx = 9999;
                return;
            }
        }
    }
}

export function checkBeamActions(p, idx) {
    if (p.beamIdx < p.beamPixels.length + CONFIG.BEAM_LENGTH)
        p.beamIdx += CONFIG.BEAM_SPEED;
    let opponent = STATE.players[(idx + 1) % 2];
    let tipIdx = Math.floor(opponent.beamIdx);
    if (tipIdx >= 0 && tipIdx < opponent.beamPixels.length) {
        let tip = opponent.beamPixels[tipIdx];
        if (Math.abs(p.x - tip.x) < COLLISION.BEAM_HIT_RADIUS && Math.abs(p.y - tip.y) < COLLISION.BEAM_HIT_RADIUS) {
            if (!p.shieldActive) {
                p.stunStartTime = STATE.frameCount;
                p.glitchStartTime = STATE.frameCount;
                playChargeSfx();
            }
            opponent.beamPixels = [];
            opponent.beamIdx = 9999;
            opponent.boostEnergy = Math.min(CONFIG.MAX_ENERGY, opponent.boostEnergy + ENERGY_COSTS.BEAM_HIT_TRANSFER);
            p.boostEnergy = Math.max(0, p.boostEnergy - ENERGY_COSTS.BEAM_HIT_TRANSFER);
        }
    }
}

export function checkMinesActions(p) {
    for (let i = STATE.mines.length - 1; i >= 0; i--) {
        let m = STATE.mines[i];
        let bIdx = Math.floor(p.beamIdx);
        if (bIdx >= 0 && bIdx < p.beamPixels.length) {
            let bp = p.beamPixels[bIdx];
            if (bp.x >= m.x - 1 && bp.x <= m.x + 3 && bp.y >= m.y - 1 && bp.y <= m.y + 3) {
                triggerExplosion(m.x, m.y, "MINESWEEPER");
                STATE.mines.splice(i, 1);

                p.beamPixels = [];
                p.beamIdx = 9999;
                continue;
            }
        }
        // Check player stepping on mine (skip if player has portal invulnerability)
        if (m.active && p.portalInvulnFrames <= 0 &&
            p.x + p.size > m.x && p.x < m.x + 2 && p.y + p.size > m.y && p.y < m.y + 2) {
            triggerExplosion(m.x, m.y, "TRIPPED MINE");
            STATE.mines.splice(i, 1);
        }
    }
    // Decrement portal invulnerability
    if (p.portalInvulnFrames > 0) p.portalInvulnFrames--;
}

export function checkPortalActions(p) {
    if (p.portalCooldown > 0) p.portalCooldown--;
    else {
        let pc = Math.floor((p.x + p.size / 2 - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
        let pr = Math.floor((p.y + p.size / 2) / CONFIG.CELL_SIZE);
        let portal = STATE.portals.find(pt => pt.c === pc && pt.r === pr);
        if (portal) {
            let dest = STATE.portals.find(pt => pt !== portal);
            if (dest) {
                p.x = CONFIG.MAZE_OFFSET_X + dest.c * CONFIG.CELL_SIZE + 0.5;
                p.y = dest.r * CONFIG.CELL_SIZE + 0.5;
                p.portalCooldown = COLLISION.PORTAL_COOLDOWN;
                p.portalInvulnFrames = COLLISION.PORTAL_INVULN_FRAMES;
                p.speed = CONFIG.BASE_SPEED;
                if (seededRandom() < CONFIG.PORTAL_GLITCH_CHANCE) {
                    p.glitchStartTime = STATE.frameCount;
                }
            }
        }
    }
}

export function checkCrate(p) {
    if (STATE.ammoCrate && Math.abs((p.x + 1) - (STATE.ammoCrate.x + 1)) < 2 && Math.abs((p.y + 1) - (STATE.ammoCrate.y + 1)) < 2) {
        p.minesLeft = CONFIG.MAX_MINES;
        p.boostEnergy = CONFIG.MAX_ENERGY;
        playPowerupSfx();
        STATE.ammoCrate = null;
        STATE.ammoLastTakeTime = STATE.frameCount;
    }
}
