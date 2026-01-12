import { CONFIG, CONTROLS_P1, CONTROLS_P2, TAUNTS  } from './config.js';
import { STATE, resetStateForMatch } from './state.js';
import { initMaze, spawnAmmoCrate} from './grid.js';
import { setupInputs, pollGamepads, checkIdle, getHumanInput } from './input.js';
import { getCpuInput } from './ai.js';
import { renderGame, renderMenu } from './renderer.js';
import { applyPlayerActions, updateProjectiles, updateParticles, triggerExplosion } from './mechanics.js';

export function startGame() {
    if (STATE.sfx) STATE.sfx.init();
    STATE.screen = 'PLAYING';
    resetStateForMatch();
    document.getElementById('statusText').innerText = "GOAL: 5 POINTS";
    initMaze();
}

function finalizeRound() {
    // --- HANDLE DRAW ---
    if (STATE.isDraw) {
        STATE.messages.round = "DOUBLE KO! DRAW!";
        STATE.messages.roundColor = "#ffffff";
        STATE.sfx.roundOver(); // Play generic sound
        STATE.isRoundOver = true;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (STATE.isAttractMode) STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER;
        // Reset Logic
        STATE.deathTimer = 0;
        STATE.isDraw = false;
        return;
    }

    // --- STANDARD WINNER LOGIC ---
    let victimIdx = STATE.victimIdx;
    let winnerIdx = (victimIdx === 0) ? 1 : 0;

    STATE.players[winnerIdx].score++;
    STATE.messages.round = `P${victimIdx + 1} ${STATE.deathReason}!`;
    STATE.messages.roundColor = "#ff0000";

    if (STATE.players[winnerIdx].score >= CONFIG.MAX_SCORE) {
        STATE.sfx.win();
        STATE.isGameOver = true;
        STATE.looser = (winnerIdx + 1 == 1) ? 2 : 1;
        STATE.messages.win = `PLAYER ${winnerIdx + 1} WINS!`;
        STATE.messages.taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
        STATE.messages.winColor = STATE.players[winnerIdx].color;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
    } else {
        STATE.sfx.roundOver();
        STATE.isRoundOver = true;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
    }

    STATE.deathTimer = 0;
    if (STATE.isAttractMode) {
        STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER; // Wait ~3 seconds (60 frames/sec * 3)
    }
}

function update() {
    if (navigator.getGamepads)//  Get Gamepad State (This now handles System Logic too!)
        STATE.gpData = pollGamepads();
    if (STATE.screen === 'MENU') {
        if (STATE.keys['Digit1']) { STATE.gameMode = 'SINGLE'; startGame(); }
        if (STATE.keys['Digit2']) { STATE.gameMode = 'MULTI'; startGame(); }
        if (checkIdle()) {
            STATE.isAttractMode = true;
            STATE.gameMode = 'MULTI';
            startGame();
        }
        updateParticles();
        return;
    }

    if (STATE.deathTimer > 0) {
        STATE.deathTimer--;

        updateProjectiles();
        updateParticles();

        if (STATE.deathTimer <= 0) {
            finalizeRound();
        }
        return;
    }

    if (STATE.isGameOver || STATE.isRoundOver) {
        updateParticles();
        STATE.scrollX -= 0.5;
        let msgLen = (STATE.isGameOver ? STATE.messages.taunt.length : STATE.messages.round.length);
        if (STATE.scrollX < -(msgLen * 4.5)) STATE.scrollX = CONFIG.LOGICAL_W;
        if (STATE.isAttractMode && STATE.demoResetTimer > 0) {
            STATE.demoResetTimer--;
            if (STATE.demoResetTimer <= 0) {
                // Determine action: Restart Game (if Game Over) or Next Round (if Round Over)
                if (STATE.isGameOver) {
                    startGame();
                } else {
                    initMaze();
                }
            }
        }
        return;
    }
    updateProjectiles();
    if (STATE.gameTime <= 0) {
        STATE.isRoundOver = true;
        STATE.messages.round = "TIME OUT!";
        STATE.messages.roundColor = "#ffff00";
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (STATE.isAttractMode) STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER;
        return;
    }
    STATE.gameTime -= 1;
    // NEW: Sudden Death - Every second after time runs low (e.g. < 30 seconds left)
    if (STATE.gameTime < 1800 && STATE.gameTime % 50 === 0) {
        STATE.messages.round = "SUDDEN DEATH!";
        STATE.scrollX = CONFIG.LOGICAL_W; // Flash warning

        // Spawn a neutral mine in a random spot to increase panic
        let rx = Math.floor(Math.random() * CONFIG.COLS);
        let ry = Math.floor(Math.random() * CONFIG.ROWS);
        STATE.mines.push({
            x: CONFIG.MAZE_OFFSET_X + rx * CONFIG.CELL_SIZE,
            y: ry * CONFIG.CELL_SIZE,
            active: true, // Instantly active
            droppedAt: Date.now(),
            visX: 0, visY: 0,
            owner: -1 // Neutral owner (hurts everyone)
        });
    }
    let now = Date.now();
    STATE.mines.forEach(m => {
        if (!m.active && now - m.droppedAt > CONFIG.MINE_ARM_TIME) m.active = true;
    });
    if (!STATE.ammoCrate) {
        STATE.ammoRespawnTimer++;
        if (STATE.ammoRespawnTimer > CONFIG.AMMO_RESPAWN_DELAY) {
            spawnAmmoCrate();
            STATE.ammoRespawnTimer = 0;
        }
    }

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

    STATE.players.forEach((p, idx) => {
        if (STATE.ammoCrate && Math.abs((p.x + 1) - (STATE.ammoCrate.x + 1)) < 2 && Math.abs((p.y + 1) - (STATE.ammoCrate.y + 1)) < 2) {
            p.minesLeft = CONFIG.MAX_MINES;
            STATE.sfx.powerup();
            STATE.ammoCrate = null;
            STATE.ammoRespawnTimer = 0;
        }

        if (p.stunTime > 0) p.stunTime--;
        if (p.glitchTime > 0) p.glitchTime--;
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
                    if (Math.random() < CONFIG.GLITCH_CHANCE) {
                        p.glitchStartTime = Date.now();
                        p.glitchTime = CONFIG.GLITCH_DURATION;
                    }
                }
            }
        }
        p.trail.push({
            x: p.x,
            y: p.y
        });
        if (p.trail.length > CONFIG.TRAIL_LENGTH) p.trail.shift();

        if (p.beamIdx < p.beamPixels.length + CONFIG.BEAM_LENGTH) p.beamIdx += 0.8;
        let opponent = STATE.players[(idx + 1) % 2];
        let tipIdx = Math.floor(opponent.beamIdx);
        if (tipIdx >= 0 && tipIdx < opponent.beamPixels.length) {
            let tip = opponent.beamPixels[tipIdx];
            if (Math.abs(p.x - tip.x) < 1.5 && Math.abs(p.y - tip.y) < 1.5) {
                if (!p.shieldActive) {
                    p.stunTime = CONFIG.STUN_DURATION;
                    p.glitchStartTime = Date.now();
                    p.glitchTime = CONFIG.STUN_DURATION;
                    STATE.sfx.charge();
                }
                opponent.beamPixels = [];
                opponent.beamIdx = 9999;
                opponent.boostEnergy = Math.min(100, opponent.boostEnergy + 15); // Attacker gains
                p.boostEnergy = Math.max(0, p.boostEnergy - 15);                 // Victim loses
            }
        }

        for (let i = STATE.mines.length - 1; i >= 0; i--) {
            let m = STATE.mines[i];
            let bIdx = Math.floor(p.beamIdx);
            if (bIdx >= 0 && bIdx < p.beamPixels.length) {
                let bp = p.beamPixels[bIdx];
                if (bp.x >= m.x - 1 && bp.x <= m.x + 3 && bp.y >= m.y - 1 && bp.y <= m.y + 3) {
                    // Change: Don't trigger full explosion, just "defuse" or small pop
                    triggerExplosion(m.x, m.y, "MINESWEEPER");
                    STATE.mines.splice(i, 1);

                    // Stop the beam so you can't snipe through mines
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

        // --- INPUT LOGIC  ---
        let cmd = {};

        // If in Attract Mode, BOTH players use AI
        if (STATE.isAttractMode) { // Player 1 targets Player 2, Player 2 targets Player 1
            cmd = getCpuInput(p, STATE.players[(idx + 1) % 2]);
        } else {// Normal Gameplay
            if (idx === 0) {
                cmd = getHumanInput(idx, CONTROLS_P1);
            } else {
                if (STATE.gameMode === 'SINGLE') cmd = getCpuInput(p, STATE.players[0]);
                else cmd = getHumanInput(idx, CONTROLS_P2);
            }
        }
        applyPlayerActions(p, cmd);
    });
    updateParticles();
}

function loop() {
    update();
    if (STATE.screen === 'MENU') renderMenu();
    else renderGame();
    requestAnimationFrame(loop);
}

window.addEventListener('load', () => {
    setupInputs();
    loop();
});