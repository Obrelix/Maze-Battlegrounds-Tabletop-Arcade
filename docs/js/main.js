import { CONFIG, CONTROLS_P1, CONTROLS_P2, TAUNTS  } from './config.js';
import { STATE, resetStateForMatch } from './state.js';
import { initMaze, spawnAmmoCrate} from './grid.js';
import { setupInputs, pollGamepads, checkIdle, getHumanInput } from './input.js';1
import { getCpuInput } from './ai.js';
import { renderGame, renderMenu } from './renderer.js';
import { applyPlayerActions, updateProjectiles, updateParticles, checkBoostTrail, 
    checkBeamCollisions, checkArmorCrate, checkPortalActions, chekcBeamActions, checkMinesActions } from './mechanics.js';

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
        STATE.gpData = pollGamepads(startGame);
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

    checkBeamCollisions();

    STATE.players.forEach((p, idx) => {
        checkArmorCrate(p);

        if (p.stunTime > 0) p.stunTime--;
        if (p.glitchTime > 0) p.glitchTime--;
        
        checkPortalActions(p);
        checkBoostTrail(p);
        chekcBeamActions(p, idx);
        checkMinesActions(p);

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
    setupInputs(startGame);
    loop();
});