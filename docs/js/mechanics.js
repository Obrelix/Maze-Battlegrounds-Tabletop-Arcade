import { CONFIG, TAUNTS, TIMING, ENERGY_COSTS, ENERGY_RATES, COLLISION } from './config.js';
import { getState, updateState, saveHighScore, recordMatchStats } from './state.js';
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
        const state = getState();
        if (p.boostEnergy >= ENERGY_COSTS.DETONATION) {
            // Collect mines to detonate and filter remaining
            const minesToDetonate = [];
            const remainingMines = state.mines.filter(mine => {
                if (mine.owner === p.id || mine.owner === -1) {
                    minesToDetonate.push({ x: mine.x, y: mine.y });
                    return false; // Remove from remaining
                }
                return true; // Keep in remaining
            });

            if (minesToDetonate.length > 0) {
                p.boostEnergy -= ENERGY_COSTS.DETONATION;
                // Update state with filtered mines
                updateState({ mines: remainingMines });
                // Then trigger explosions (safe - state already updated)
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
        const newMine = {
            x: Math.floor(p.x),
            y: Math.floor(p.y),
            droppedAt: now,
            active: false,
            visX: Math.floor(seededRandom() * 2),
            visY: Math.floor(seededRandom() * 2),
            owner: p.id
        };
        updateState(prevState => ({ mines: [...prevState.mines, newMine] }));
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
    const state = getState();
    if (state.isGameOver || state.isRoundOver || state.deathTimer > 0) return;

    // Mark players as dead (immutable update)
    const newPlayers = state.players.map((p, idx) => {
        if (indices.includes(idx)) {
            const updated = Object.assign(Object.create(Object.getPrototypeOf(p)), p);
            updated.isDead = true;
            return updated;
        }
        return p;
    });

    // Update state atomically
    updateState({
        deathTimer: COLLISION.DEATH_TIMER_FRAMES,
        isDraw: indices.length > 1,
        victimIdx: indices.length > 1 ? -1 : indices[0],
        players: newPlayers
    });

    setDeathMessages(reason);
    playDeathSfx();

    // Spawn death particles for all victims
    indices.forEach(idx => {
        spawnDeathParticles(newPlayers[idx]);
    });
}

function handlePlayerDeath(victimIdx, reason) {
    const state = getState();
    if (state.isGameOver || state.isRoundOver || state.deathTimer > 0) return;

    // Mark player as dead (immutable update)
    const newPlayers = state.players.map((p, idx) => {
        if (idx === victimIdx) {
            const updated = Object.assign(Object.create(Object.getPrototypeOf(p)), p);
            updated.isDead = true;
            return updated;
        }
        return p;
    });

    // Update state atomically
    updateState({
        players: newPlayers,
        victimIdx: victimIdx,
        deathTimer: COLLISION.DEATH_TIMER_FRAMES
    });

    setDeathMessages(reason || "ELIMINATED BY A SNEAKY BUG");
    playDeathSfx();
    spawnDeathParticles(newPlayers[victimIdx]);
}

function applyPlayerExplosionDamage(x, y, reason) {
    const state = getState();
    // 1. Collect all victims first
    let hitIndices = [];
    if (!state.isRoundOver && !state.isGameOver) {
        state.players.forEach((p, idx) => {
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
    const state = getState();
    const baseUpdate = {
        onlineTransitionPending: false,
        deathTimer: 0,
        scrollX: CONFIG.LOGICAL_W + 5
    };

    // --- DRAW ---
    if (reason === 'DRAW') {
        updateState({
            ...baseUpdate,
            isRoundOver: true,
            isDraw: false,
            messages: {
                ...state.messages,
                round: "DOUBLE KO! DRAW!",
                roundColor: "#ffffff"
            }
        });
        playRoundOverSfx();
        if (getState().isAttractMode) updateState({ demoResetTimer: TIMING.DEMO_RESET_TIMER });
        return;
    }

    // --- TIMEOUT ---
    if (reason === 'TIMEOUT') {
        const p0 = state.players[0];
        const p1 = state.players[1];

        if (p0.score === p1.score) {
            // Equal scores - it's a draw
            updateState({
                ...baseUpdate,
                isDraw: true,
                isGameOver: true,
                messages: {
                    ...state.messages,
                    round: "TIME OUT! DRAW!",
                    roundColor: "#ffff00",
                    win: "DRAW GAME!",
                    winColor: "#ffffff"
                }
            });
            playRoundOverSfx();
            if (!getState().isAttractMode) {
                recordMatchStats(-1);
            }
        } else {
            // One player has higher score - they win
            const timeoutWinner = p0.score > p1.score ? 0 : 1;
            const winner = state.players[timeoutWinner];
            updateState({
                ...baseUpdate,
                victimIdx: timeoutWinner === 0 ? 1 : 0,
                isGameOver: true,
                messages: {
                    ...state.messages,
                    round: `TIME OUT! ${winner.name} WINS!`,
                    roundColor: winner.color,
                    win: `${winner.name} WINS!`,
                    winColor: winner.color
                }
            });
            playWinSfx();
            if (winner.name !== "CPU") saveHighScore();
            if (!getState().isAttractMode) {
                recordMatchStats(timeoutWinner);
            }
        }

        if (getState().isAttractMode) updateState({ demoResetTimer: TIMING.DEMO_RESET_TIMER });
        return;
    }

    // --- STANDARD WIN (goal or combat) ---
    const victimIdx = (winnerIdx === 0) ? 1 : 0;

    // Update winner's score (immutable)
    const newPlayers = state.players.map((p, idx) => {
        if (idx === winnerIdx) {
            const updated = Object.assign(Object.create(Object.getPrototypeOf(p)), p);
            updated.score = p.score + 1;
            return updated;
        }
        return p;
    });
    const winner = newPlayers[winnerIdx];

    // Determine round message based on reason
    let roundMsg, roundColor;
    if (reason === 'GOAL') {
        roundMsg = `${winner.name} SCORES!`;
        roundColor = winner.color;
    } else {
        roundMsg = `${state.players[victimIdx]?.name} '${state.messages.deathReason}!'`;
        roundColor = state.players[victimIdx].color;
    }

    if (winner.score >= CONFIG.MAX_SCORE) {
        // Game over - winner reached max score
        updateState({
            ...baseUpdate,
            players: newPlayers,
            victimIdx: victimIdx,
            isGameOver: true,
            messages: {
                ...state.messages,
                round: roundMsg,
                roundColor: roundColor,
                win: `${winner.name} WINS!`,
                taunt: TAUNTS[Math.floor(seededRandom() * TAUNTS.length)],
                winColor: winner.color
            }
        });
        playWinSfx();
        if (winner.name !== "CPU") saveHighScore();
        if (!getState().isAttractMode) {
            recordMatchStats(winnerIdx);
        }
    } else {
        // Round over, game continues
        updateState({
            ...baseUpdate,
            players: newPlayers,
            victimIdx: victimIdx,
            isRoundOver: true,
            messages: {
                ...state.messages,
                round: roundMsg,
                roundColor: roundColor
            }
        });
        playRoundOverSfx();
    }

    if (getState().isAttractMode) updateState({ demoResetTimer: TIMING.DEMO_RESET_TIMER });
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
    const state = getState();
    // Validate player state
    if (!p || typeof p.boostEnergy !== 'number') {
        console.warn('fireBeam: Invalid player state');
        return false;
    }
    if (p.boostEnergy < ENERGY_COSTS.BEAM) return false;
    if (p.beamIdx < p.beamPixels.length) return false;

    let opponent = state.players[(p.id + 1) % 2];
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
    state.maze.forEach(c => {
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
    const now = getState().frameCount;
    handleDetonate(p, input, now);
    handleShield(p, input, now);
    handleBeamInput(p, input, now);
    handleMovement(p, input, now);
    handleMineDrop(p, input, now);
    handleGoal(p, input, now);
}

export function updateProjectiles() {
    const state = getState();
    const minesToExplode = [];
    const projectilesToRemove = new Set();
    let playerHit = null;

    // Process each projectile
    const updatedProjectiles = state.projectiles.map((proj, i) => {
        // Update position
        const updated = {
            ...proj,
            x: proj.x + proj.vx,
            y: proj.y + proj.vy,
            distTraveled: proj.distTraveled + CONFIG.C_BEAM_SPEED
        };

        // Check if out of range
        if (updated.distTraveled >= CONFIG.C_BEAM_RANGE) {
            projectilesToRemove.add(i);
            return updated;
        }

        const hw = (Math.abs(updated.vx) > 0) ? CONFIG.C_BEAM_LENGTH / 2 : CONFIG.C_BEAM_WIDTH / 2;
        const hh = (Math.abs(updated.vx) > 0) ? CONFIG.C_BEAM_WIDTH / 2 : CONFIG.C_BEAM_LENGTH / 2;
        const tipX = updated.x + (updated.vx * 2);
        const tipY = updated.y + (updated.vy * 2);

        // Wall collision
        if (isWall(tipX, tipY)) {
            const gc = Math.floor((tipX - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
            const gr = Math.floor(tipY / CONFIG.CELL_SIZE);
            destroyWallAt(gc, gr);
            spawnWallHitParticle(tipX, tipY, updated.vx * 0.5, updated.vy * 0.5);
        }

        // Mine collision - collect mines to explode
        state.mines.forEach((m, mIdx) => {
            if (Math.abs(updated.x - m.x) < hw + 1 && Math.abs(updated.y - m.y) < hh + 1) {
                minesToExplode.push({ x: m.x, y: m.y, idx: mIdx });
            }
        });

        // Player collision
        if (!playerHit) {
            const oppId = (updated.owner + 1) % 2;
            const opp = state.players[oppId];
            const pLeft = opp.x;
            const pRight = opp.x + opp.size;
            const pTop = opp.y;
            const pBot = opp.y + opp.size;
            const bLeft = updated.x - hw;
            const bRight = updated.x + hw;
            const bTop = updated.y - hh;
            const bBot = updated.y + hh;

            if (bLeft < pRight && bRight > pLeft && bTop < pBot && bBot > pTop) {
                projectilesToRemove.add(i);
                if (!opp.shieldActive) {
                    playerHit = { oppId, reason: "WAS VAPORIZED" };
                }
            }
        }

        return updated;
    });

    // Filter projectiles
    const newProjectiles = updatedProjectiles.filter((_, i) => !projectilesToRemove.has(i));

    // Filter mines (remove those that were hit)
    const hitMineIndices = new Set(minesToExplode.map(m => m.idx));
    const newMines = state.mines.filter((_, i) => !hitMineIndices.has(i));

    // Update state atomically
    updateState({
        projectiles: newProjectiles,
        mines: newMines
    });

    // Trigger explosions after state update
    minesToExplode.forEach(m => {
        triggerExplosion(m.x, m.y, "SHOCKWAVE");
    });

    // Handle player death after state update
    if (playerHit) {
        handlePlayerDeath(playerHit.oppId, playerHit.reason);
    }
}

/**
 * Fire a charged beam projectile toward the opponent
 * @param {Object} p - Player object firing the beam
 * @returns {boolean} True if beam was fired, false otherwise
 */
export function fireChargedBeam(p) {
    const state = getState();
    if (!p || typeof p.boostEnergy !== 'number') {
        console.warn('fireChargedBeam: Invalid player state');
        return false;
    }
    if (p.boostEnergy < ENERGY_COSTS.CHARGED_BEAM) return false;

    let opponent = state.players[(p.id + 1) % 2];
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

    const newProjectile = {
        x: startX,
        y: startY,
        vx: vx,  // Now moving towards enemy
        vy: vy,
        distTraveled: 0,
        owner: p.id,
        color: p.color
    };
    updateState(prevState => ({ projectiles: [...prevState.projectiles, newProjectile] }));

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
    const state = getState();
    let p1 = state.players[0];
    let p2 = state.players[1];
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
    const state = getState();
    if (p.beamIdx < p.beamPixels.length + CONFIG.BEAM_LENGTH)
        p.beamIdx += CONFIG.BEAM_SPEED;
    let opponent = state.players[(idx + 1) % 2];
    let tipIdx = Math.floor(opponent.beamIdx);
    if (tipIdx >= 0 && tipIdx < opponent.beamPixels.length) {
        let tip = opponent.beamPixels[tipIdx];
        if (Math.abs(p.x - tip.x) < COLLISION.BEAM_HIT_RADIUS && Math.abs(p.y - tip.y) < COLLISION.BEAM_HIT_RADIUS) {
            if (!p.shieldActive) {
                p.stunStartTime = state.frameCount;
                p.glitchStartTime = state.frameCount;
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
    const state = getState();
    const minesToExplode = [];
    const mineIndicesToRemove = new Set();
    let beamHitMine = false;

    const bIdx = Math.floor(p.beamIdx);
    const bp = (bIdx >= 0 && bIdx < p.beamPixels.length) ? p.beamPixels[bIdx] : null;

    state.mines.forEach((m, i) => {
        // Check beam hitting mine
        if (bp && !beamHitMine) {
            if (bp.x >= m.x - 1 && bp.x <= m.x + 3 && bp.y >= m.y - 1 && bp.y <= m.y + 3) {
                minesToExplode.push({ x: m.x, y: m.y, reason: "MINESWEEPER" });
                mineIndicesToRemove.add(i);
                beamHitMine = true;
                return;
            }
        }
        // Check player stepping on mine (skip if player has portal invulnerability)
        if (m.active && p.portalInvulnFrames <= 0 &&
            p.x + p.size > m.x && p.x < m.x + 2 && p.y + p.size > m.y && p.y < m.y + 2) {
            minesToExplode.push({ x: m.x, y: m.y, reason: "TRIPPED MINE" });
            mineIndicesToRemove.add(i);
        }
    });

    // Clear beam if it hit a mine
    if (beamHitMine) {
        p.beamPixels = [];
        p.beamIdx = 9999;
    }

    // Update state if any mines were removed
    if (mineIndicesToRemove.size > 0) {
        const newMines = state.mines.filter((_, i) => !mineIndicesToRemove.has(i));
        updateState({ mines: newMines });

        // Trigger explosions after state update
        minesToExplode.forEach(m => {
            triggerExplosion(m.x, m.y, m.reason);
        });
    }

    // Decrement portal invulnerability
    if (p.portalInvulnFrames > 0) p.portalInvulnFrames--;
}

export function checkPortalActions(p) {
    const state = getState();
    if (p.portalCooldown > 0) p.portalCooldown--;
    else {
        let pc = Math.floor((p.x + p.size / 2 - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
        let pr = Math.floor((p.y + p.size / 2) / CONFIG.CELL_SIZE);
        let portal = state.portals.find(pt => pt.c === pc && pt.r === pr);
        if (portal) {
            let dest = state.portals.find(pt => pt !== portal);
            if (dest) {
                p.x = CONFIG.MAZE_OFFSET_X + dest.c * CONFIG.CELL_SIZE + 0.5;
                p.y = dest.r * CONFIG.CELL_SIZE + 0.5;
                p.portalCooldown = COLLISION.PORTAL_COOLDOWN;
                p.portalInvulnFrames = COLLISION.PORTAL_INVULN_FRAMES;
                p.speed = CONFIG.BASE_SPEED;
                if (seededRandom() < CONFIG.PORTAL_GLITCH_CHANCE) {
                    p.glitchStartTime = state.frameCount;
                }
            }
        }
    }
}

export function checkCrate(p) {
    const state = getState();
    if (state.ammoCrate && Math.abs((p.x + 1) - (state.ammoCrate.x + 1)) < 2 && Math.abs((p.y + 1) - (state.ammoCrate.y + 1)) < 2) {
        p.minesLeft = CONFIG.MAX_MINES;
        p.boostEnergy = CONFIG.MAX_ENERGY;
        playPowerupSfx();
        updateState({ ammoCrate: null, ammoLastTakeTime: state.frameCount });
    }
}
