import { CONFIG, TAUNTS  } from './config.js';
import { STATE } from './state.js';
import { isWall, destroyWallAt,gridIndex  } from './grid.js';

export function triggerExplosion(x, y, reason = "EXPLODED") {
    STATE.sfx.explosion();
    STATE.camera.shake(15);
    const BLAST_RADIUS = 4.0;
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

    // --- Particle Spawning ---
    const PARTICLE_COUNT = 30;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 3.5;
        STATE.particles.push({
            x: x + 1,
            y: y + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            decay: 0.03 + Math.random() * 0.04,
            life: 1.0,
            color: '#ffffff'
        });
    }

    // --- Player Damage Logic (FIXED) ---
    // 1. Collect all victims first
    let hitIndices = [];
    if (!STATE.isRoundOver && !STATE.isGameOver) {
        STATE.players.forEach((p, idx) => {
            if (Math.abs(p.x + 1 - (x + 1)) < BLAST_RADIUS && Math.abs(p.y + 1 - (y + 1)) < BLAST_RADIUS) {
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

export function fireBeam(p) {
    if (p.boostEnergy < CONFIG.BEAM_ENERGY_COST) return;
    if (p.beamIdx < p.beamPixels.length) return;
    let opponent = STATE.players[(p.id + 1) % 2];

    // 2. Calculate Opponent's Grid Coordinates
    // We target the center of the opponent for accuracy
    let targetC = Math.floor((opponent.x + (opponent.size / 2) - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
    let targetR = Math.floor((opponent.y + (opponent.size / 2)) / CONFIG.CELL_SIZE);

    // 3. Set Start (Self) and End (Enemy)
    let start = gridIndex(Math.floor((p.x - CONFIG.MAZE_OFFSET_X + 1) / CONFIG.CELL_SIZE), Math.floor((p.y + 1) / CONFIG.CELL_SIZE));
    let end = gridIndex(targetC, targetR);

    if (!start || !end) return;

    // Apply costs now that we have a valid path target
    p.boostEnergy -= CONFIG.BEAM_ENERGY_COST;
    STATE.sfx.shoot();

    // --- PATHFINDING (Existing Logic) ---
    // Reset pathfinding flags
    STATE.maze.forEach(c => {
        c.parent = null;
        c.bfsVisited = false;
    });

    let queue = [start];
    start.bfsVisited = true;
    let found = false;

    // BFS Search Loop
    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr === end) {
            found = true;
            break;
        }
        [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]].forEach(d => {
            let n = gridIndex(curr.c + d[0], curr.r + d[1]);
            // Standard BFS: Check walls and visited status
            if (n && !n.bfsVisited && !curr.walls[d[2]]) {
                n.bfsVisited = true;
                n.parent = curr;
                queue.push(n);
            }
        });
    }

    // If no path to enemy (e.g., they are walled off perfectly), cancel shot
    if (!found) {
        // Refund energy if shot fails
        p.boostEnergy += CONFIG.BEAM_ENERGY_COST;
        return;
    }

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
}

export function applyPlayerActions(p, input) {
    let now = Date.now();

    // Detonate
    if (input.boom && !p.prevDetonateKey) {
        if (p.boostEnergy >= CONFIG.DETONATE_COST) {
            let minesFound = false;
            for (let i = STATE.mines.length - 1; i >= 0; i--) {
                if (STATE.mines[i].owner === p.id) {
                    triggerExplosion(STATE.mines[i].x, STATE.mines[i].y, "WAS FRAGGED");
                    STATE.mines.splice(i, 1);
                    minesFound = true;
                }
            }
            if (minesFound) p.boostEnergy -= CONFIG.DETONATE_COST;
        }
    }
    p.prevDetonateKey = input.boom;

    // Shield
    if (input.shield && p.boostEnergy > 0) {
        if (!p.shieldActive) {
            p.boostEnergy -= CONFIG.SHIELD_ACTIVATION_COST;
        }
        if (p.boostEnergy >= 0 && !p.shieldActive) {
            STATE.sfx.shield();
            p.shieldActive = true;
        }
        p.boostEnergy -= CONFIG.SHIELD_DRAIN;

        // Clamp to 0 so we don't go negative
        if (p.boostEnergy < 0) p.boostEnergy = 0;
    } else {
        p.shieldActive = false;
    }

    // Beam
    if (input.beam) {
        p.chargeGrace = 0;
        if (!p.isCharging) {
            p.isCharging = true;
            p.chargeStartTime = now;
        }
        if (now - p.chargeStartTime > CONFIG.CHARGE_TIME) {
            fireChargedBeam(p);
            p.isCharging = false;
            p.chargeStartTime = 0;
        } else if (p.isCharging && Math.floor(now / 100) % 5 === 0) {
            STATE.sfx.charge();
        }
    } else {
        if (p.isCharging) {
            p.chargeGrace++;
            if (now - p.chargeStartTime < CONFIG.CHARGE_TIME) fireBeam(p);
            p.isCharging = false;
        }
        // Reset
        p.isCharging = false;
        p.chargeStartTime = 0;
        p.chargeGrace = 0;
    }

    // Movement
    let speed = CONFIG.BASE_SPEED;
    if (p.stunTime > 0) {
        speed = CONFIG.BASE_SPEED * 0.8;
        if (!input.boost && !p.shieldActive) p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
    } else if (p.isCharging) {
        speed = CONFIG.BASE_SPEED * CONFIG.CHARGE_PENALTY;
        p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
    } else {
        if (p.boostCooldown > 0) {
            p.boostCooldown--;
            if (!p.shieldActive) p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
        } else if (input.boost && p.boostEnergy > 0) {
            p.boostEnergy -= CONFIG.BOOST_DRAIN;
            speed = CONFIG.MAX_SPEED;
            if (p.boostEnergy <= 0) p.boostEnergy = 0;

            // Play sound every 100ms (prevents stuttering)
            if (now - p.lastBoostTime > 600) {
                p.lastBoostTime = now;
                STATE.sfx.boost();
            }
            if (Math.random() < 0.4) { // 40% chance per frame
                STATE.particles.push({
                    x: p.x + 1, // Center of player
                    y: p.y + 1,
                    // Velocity: Shoot opposite to player movement
                    vx: -(p.lastDir.x * (Math.random() * 0.5 + 0.2)),
                    vy: -(p.lastDir.y * (Math.random() * 0.5 + 0.2)),
                    life: 0.4, // Short life
                    decay: 0.08,
                    color: '#ffffff' // White hot sparks
                });
            }
        } else {
            if (p.boostEnergy <= 0) p.boostCooldown = CONFIG.BOOST_COOLDOWN_FRAMES;
            else if (!p.shieldActive) p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
        }
    }
    p.currentSpeed = speed;

    let dx = 0,
        dy = 0;
    if (input.up) dy = -speed;
    if (input.down) dy = speed;
    if (input.left) dx = -speed;
    if (input.right) dx = speed;

    if (p.glitchTime > 0) {
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
    let steps = Math.ceil(dist / 0.5);
    let sx = dx / steps;
    let sy = dy / steps;

    // --- CORNER ASSIST CONSTANTS ---
    // How far to "look ahead" for an open space (approx 1/3 of player size)
    const ASSIST_OFFSET = 0.6;
    // How fast to push the player into alignment (smoothness)
    const NUDGE_SPEED = 0.15;

    for (let i = 0; i < steps; i++) {
        // ----------------------
        // X-AXIS MOVEMENT
        // ----------------------
        if (sx !== 0) {
            if (!checkPlayerCollision(p, sx, 0)) {
                // Path is clear, move normally
                p.x += sx;
            } else {
                // BLOCKED! Check for a corner to slide around.
                // We "look" slightly Up and Down to see if the path is clear there.

                // Check UP (Negative Y)
                // If we shifted the player UP by ASSIST_OFFSET, could they move?
                if (!checkPlayerCollision(p, sx, -ASSIST_OFFSET)) {
                    p.y -= NUDGE_SPEED; // Yes! Nudge them Up
                }
                // Check DOWN (Positive Y)
                else if (!checkPlayerCollision(p, sx, ASSIST_OFFSET)) {
                    p.y += NUDGE_SPEED; // Yes! Nudge them Down
                }
            }
        }

        // ----------------------
        // Y-AXIS MOVEMENT
        // ----------------------
        if (sy !== 0) {
            if (!checkPlayerCollision(p, 0, sy)) {
                // Path is clear, move normally
                p.y += sy;
            } else {
                // BLOCKED! Check for a corner.

                // Check LEFT (Negative X)
                if (!checkPlayerCollision(p, -ASSIST_OFFSET, sy)) {
                    p.x -= NUDGE_SPEED; // Nudge Left
                }
                // Check RIGHT (Positive X)
                else if (!checkPlayerCollision(p, ASSIST_OFFSET, sy)) {
                    p.x += NUDGE_SPEED; // Nudge Right
                }
            }
        }
    }

    // Mine Drop
    if (input.mine && p.minesLeft > 0 && now - p.lastMineTime > CONFIG.MINE_COOLDOWN) {
        STATE.sfx.mineDrop();
        p.lastMineTime = now;
        p.minesLeft--;
        STATE.mines.push({
            x: Math.floor(p.x),
            y: Math.floor(p.y),
            droppedAt: now,
            active: false,
            visX: Math.floor(Math.random() * 2),
            visY: Math.floor(Math.random() * 2),
            owner: p.id
        });
    }

    // Goal
    let gx = CONFIG.MAZE_OFFSET_X + (p.goalC * CONFIG.CELL_SIZE) + 1;
    let gy = (p.goalR * CONFIG.CELL_SIZE) + 1;
    if (Math.abs(p.x - gx) < 1.0 && Math.abs(p.y - gy) < 1.0) {
        p.score += 1;
        if (p.score >= CONFIG.MAX_SCORE) {
            STATE.isGameOver = true;
            STATE.looser = (p.id + 1 == 1) ? 2 : 1;
            STATE.messages.win = `PLAYER ${p.id + 1} WINS!`;
            STATE.messages.taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
            STATE.messages.winColor = p.color;
            STATE.scrollX = CONFIG.LOGICAL_W + 5;
        } else {
            STATE.isRoundOver = true;
            STATE.messages.round = `PLAYER ${p.id + 1} SCORES!`;
            STATE.messages.roundColor = p.color;
            STATE.scrollX = CONFIG.LOGICAL_W + 5;
        }
        if (STATE.isAttractMode) STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER;
    }
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
            STATE.particles.push({
                x: tipX,
                y: tipY,
                vx: proj.vx * 0.5,
                vy: proj.vy * 0.5,
                life: 0.5,
                color: '#555'
            });
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

export function updateParticles() {
    for (let i = STATE.particles.length - 1; i >= 0; i--) {
        let p = STATE.particles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // 1. ADD FRICTION (Air Resistance)
        // This makes particles burst fast then slow down nicely
        p.vx *= 0.85;
        p.vy *= 0.85;

        // Decay life
        p.life -= p.decay;

        // 2. DYNAMIC COLOR RAMP (Heat Cooling)
        // White -> Yellow -> Orange -> Red -> Fade
        if (p.life > 0.8) p.color = '#ffffff';       // White Hot
        else if (p.life > 0.5) p.color = '#ffff00';  // Yellow
        else if (p.life > 0.25) p.color = '#ff9900'; // Orange
        else p.color = '#660000';                    // Dark Red (Smoke)

        if (p.life <= 0) STATE.particles.splice(i, 1);
    }
}

export function fireChargedBeam(p) {
    if (p.boostEnergy < CONFIG.CHARGED_BEAM_COST) return;

    // 1. Identify Opponent
    let opponent = STATE.players[(p.id + 1) % 2];

    // 2. Calculate Vector to Opponent (Center to Center)
    let startX = p.x + (p.size / 2);
    let startY = p.y + (p.size / 2);

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
    p.boostEnergy -= CONFIG.CHARGED_BEAM_COST;
    STATE.sfx.chargedShoot();

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

    for (let i = 0; i < 10; i++) {
        STATE.particles.push({
            x: startX,
            y: startY,
            vx: (Math.random() - 0.5),
            vy: (Math.random() - 0.5),
            life: 0.8,
            color: '#fff'
        });
    }
}

function checkPlayerCollision(p, dx, dy) {
    let nx = p.x + dx;
    let ny = p.y + dy;
    let hitbox = 0.8;
    let pad = 0.6;
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
    STATE.deathTimer = 50;
    STATE.deathReason = reason || "ELIMINATED";
    STATE.sfx.death();

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

        // Visual effects for each player
        for (let i = 0; i < 30; i++) {
            STATE.particles.push({
                x: p.x + 1,
                y: p.y + 1,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1.5,
                color: p.color
            });
        }
    });
}

function handlePlayerDeath(victimIdx, reason) {
    if (STATE.isGameOver || STATE.isRoundOver || STATE.deathTimer > 0) return;

    // 1. Mark player as dead
    STATE.players[victimIdx].isDead = true;
    STATE.victimIdx = victimIdx;
    // 2. Store the reason in the global state (add this property implicitly)
    STATE.deathReason = reason || "ELIMINATED BY A SNEAKY BUG";
    // 3. Start the Death Timer 
    STATE.deathTimer = 50;

    // 4. Extra visual effects
    let p = STATE.players[victimIdx];
    STATE.sfx.death();

    for (let i = 0; i < 30; i++) {
        STATE.particles.push({
            x: p.x + 1,
            y: p.y + 1,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.5,
            color: p.color
        });
    }
}

