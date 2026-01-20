import { CONFIG, TAUNTS, TIMING, ENERGY_COSTS, ENERGY_RATES } from './config.js';
import { STATE } from './state.js';
import { isWall, destroyWallAt, gridIndex } from './grid.js';

//// Helper functions 

function handleDetonate(p, input, now) {
    // Detonate
    if (input.boom && !p.prevDetonateKey) {
        if (p.boostEnergy >= ENERGY_COSTS.DETONATION) {
            let minesFound = false;
            for (let i = STATE.mines.length - 1; i >= 0; i--) {
                if (STATE.mines[i].owner === p.id || STATE.mines[i].owner === -1) {
                    triggerExplosion(STATE.mines[i].x, STATE.mines[i].y, "WAS FRAGGED");
                    STATE.mines.splice(i, 1);
                    minesFound = true;
                }
            }
            if (minesFound) p.boostEnergy -= ENERGY_COSTS.DETONATION;
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
            STATE.sfx.shield();
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
        if (p.chargeIsReady()) {
            fireChargedBeam(p);
            p.isCharging = false;
            p.chargeStartTime = 0;
        } else if (p.isCharging && Math.floor(now / 100) % 5 === 0) {
            STATE.sfx.charge();
        }
    } else {
        if (p.isCharging) {
            if (!p.chargeIsReady()) 
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
    if (p.stunIsActive > 0) {
        speed = CONFIG.BASE_SPEED * 0.5;
        if (!input.boost && !p.shieldActive) p.boostEnergy = Math.min(CONFIG.MAX_ENERGY, p.boostEnergy + ENERGY_RATES.BOOST_REGEN);
    } else if (p.isCharging) {
        speed = CONFIG.BASE_SPEED * CONFIG.CHARGE_MOVEMENT_PENALTY;
        p.boostEnergy = Math.min(CONFIG.MAX_ENERGY, p.boostEnergy + ENERGY_RATES.BOOST_REGEN);
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
            if (now - p.lastBoostTime > 600) {
                p.lastBoostTime = now;
                STATE.sfx.boost();
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

    if (p.glitchIsActive()) {
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
                if (!checkPlayerCollision(p, sx, -ASSIST_OFFSET)) {
                    p.y -= NUDGE_SPEED; // Yes! Nudge them Up
                } else if (!checkPlayerCollision(p, sx, ASSIST_OFFSET)) {
                    p.y += NUDGE_SPEED; // Yes! Nudge them Down
                }
            }
        }

        // ----------------------
        // Y-AXIS MOVEMENT
        // ----------------------
        if (sy !== 0) {
            if (!checkPlayerCollision(p, 0, sy)) {
                p.y += sy;
            } else {
                if (!checkPlayerCollision(p, -ASSIST_OFFSET, sy)) {
                    p.x -= NUDGE_SPEED; // Nudge Left
                } else if (!checkPlayerCollision(p, ASSIST_OFFSET, sy)) {
                    p.x += NUDGE_SPEED; // Nudge Right
                }
            }
        }
    }
}

function handleMineDrop(p, input, now) {
    // Mine Drop
    if (input.mine && p.minesLeft > 0 && now - p.lastMineTime > TIMING.MINE_COOLDOWN) {
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

}

function handleGoal(p, input, now) {
    // Goal
    let gx = CONFIG.MAZE_OFFSET_X + (p.goalC * CONFIG.CELL_SIZE) + 1;
    let gy = (p.goalR * CONFIG.CELL_SIZE) + 1;
    if (Math.abs(p.x - gx) < 1.0 && Math.abs(p.y - gy) < 1.0) {
        p.score += 1;
        if (p.score >= CONFIG.MAX_SCORE) {
            STATE.isGameOver = true;
            STATE.messages.win = `${STATE.players[p.id]?.name} WINS!`;
            STATE.messages.taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
            STATE.messages.winColor = p.color;
        } else {
            STATE.isRoundOver = true;
            STATE.messages.round = `${STATE.players[p.id]?.name} SCORES!`;
        }
        STATE.messages.roundColor = p.color;
        STATE.victimIdx = (p.id == 1) ? 0 : 1;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (STATE.isAttractMode) STATE.demoResetTimer = TIMING.DEMO_RESET_TIMER;
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
    STATE.messages.deathReason = reason || "ELIMINATED";
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
    STATE.messages.deathReason = reason || "ELIMINATED BY A SNEAKY BUG";
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

function spawnExplosionParticles(x, y) {
    const PARTICLE_COUNT = 30;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 3.5;
        STATE.particles.push({
            x: x + 1,
            y: y + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            decay: 0.02 + Math.random() * 0.03,
            life: 1.0,
            color: '#ffffff'
        });
    }
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

export function triggerExplosion(x, y, reason = "EXPLODED") {
    STATE.sfx.explosion();
    STATE.camera.shake(15);
    handleWallDestruction(x, y);
    spawnExplosionParticles(x, y);
    applyPlayerExplosionDamage(x, y, reason);
}

export function fireBeam(p) {
    if (p.boostEnergy < ENERGY_COSTS.BEAM) return;
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
    p.boostEnergy -= ENERGY_COSTS.BEAM;
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
            STATE.particles.push({
                x: tipX,
                y: tipY,
                vx: proj.vx * 0.5,
                vy: proj.vy * 0.5,
                decay: 0.02 + Math.random() * 0.04,
                life: 0.8,
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
    if (p.boostEnergy < ENERGY_COSTS.CHARGED_BEAM) return;

    // 1. Identify Opponent
    let opponent = STATE.players[(p.id + 1) % 2];

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
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 2,
            decay: 0.02 + Math.random() * 0.03,
            color: '#fff'
        });
    }
}

export function checkBoostTrail(p) {
    if (p.boostEnergy > 0 && p.currentSpeed > CONFIG.BASE_SPEED) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > CONFIG.TRAIL_LENGTH) p.trail.shift();
    } else if (p.trail.length > 0) {
        p.trail.shift();  // Remove oldest point
    }
}

export function checkBeamCollisions() {
    let p1 = STATE.players[0];
    let p2 = STATE.players[1];
    if (p1.beamPixels.length > 0 && p2.beamPixels.length > 0) {
        let b1 = Math.floor(p1.beamIdx);
        let b2 = Math.floor(p2.beamIdx);
        if (b1 < p1.beamPixels.length && b2 < p2.beamPixels.length) {
            let h1 = p1.beamPixels[b1];
            let h2 = p2.beamPixels[b2];
            if (Math.abs(h1.x - h2.x) + Math.abs(h1.y - h2.y) < 4) {
                triggerExplosion((h1.x + h2.x) / 2, (h1.y + h2.y) / 2, "ANNIHILATED");
                p1.beamPixels = [];
                p1.beamIdx = 9999;
                p2.beamPixels = [];
                p2.beamIdx = 9999;
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
        if (Math.abs(p.x - tip.x) < 1.5 && Math.abs(p.y - tip.y) < 1.5) {
            if (!p.shieldActive) {
                p.stunStartTime = Date.now();
                p.glitchStartTime = Date.now();
                STATE.sfx.charge();
            }
            opponent.beamPixels = [];
            opponent.beamIdx = 9999;
            opponent.boostEnergy = Math.min(CONFIG.MAX_ENERGY, opponent.boostEnergy + 15); // Attacker gains
            p.boostEnergy = Math.max(0, p.boostEnergy - 15);                 // Victim loses
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
        if (m.active && p.x + p.size > m.x && p.x < m.x + 2 && p.y + p.size > m.y && p.y < m.y + 2) {
            triggerExplosion(m.x, m.y, "TRIPPED MINE");
            STATE.mines.splice(i, 1);
        }
    }
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
                p.portalCooldown = 60;
                p.speed = CONFIG.BASE_SPEED;
                if (Math.random() < CONFIG.PORTAL_GLITCH_CHANCE) {
                    p.glitchStartTime = Date.now();
                }
            }
        }
    }
}

export function checkCrate(p) {
    if (STATE.ammoCrate && Math.abs((p.x + 1) - (STATE.ammoCrate.x + 1)) < 2 && Math.abs((p.y + 1) - (STATE.ammoCrate.y + 1)) < 2) {
        p.minesLeft = CONFIG.MAX_MINES;
        p.boostEnergy = CONFIG.MAX_ENERGY;
        STATE.sfx.powerup();
        STATE.ammoCrate = null;
        STATE.ammoLastTakeTime = Date.now();
    }
}

