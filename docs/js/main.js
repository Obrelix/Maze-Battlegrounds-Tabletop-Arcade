import { CONFIG, CONTROLS_P1, CONTROLS_P2, TAUNTS } from './config.js';
import { STATE, resetStateForMatch, saveHighScore } from './state.js';
import { initMaze, spawnAmmoCrate } from './grid.js';
import { setupInputs, pollGamepads, checkIdle, getHumanInput } from './input.js'; 1
import { getCpuInput } from './ai.js';
import { renderGame, renderMenu, renderPlayerSetup, renderHighScores } from './renderer.js';
import {
    applyPlayerActions, updateProjectiles, updateParticles, checkBoostTrail,
    checkBeamCollisions, checkArmorCrate, checkPortalActions, checkBeamActions, checkMinesActions
} from './mechanics.js';

function startMatchSetup() {
    resetStateForMatch();
    STATE.screen = 'PLAYER_SETUP';
    STATE.playerSetup = {
        activePlayer: 0,
        colorIdx: 0,
        nameCharIdx: 0,
        nameChars: [65, 65, 65],
        phase: 'COLOR',
        isDone: false
    };
}

function startGame() {
    if (STATE.sfx) STATE.sfx.init();
    STATE.screen = 'PLAYING';
    resetStateForMatch();
    updateHtmlUI();
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
    // CHECK FOR MATCH WIN
    if (STATE.players[winnerIdx].score >= CONFIG.MAX_SCORE) {
        // ... (Existing Win Sound/Message) ...

        // SAVE HIGH SCORE
        let winnerName = STATE.players[winnerIdx].name;
        if (winnerName !== "CPU") {
            saveHighScore(winnerName);
        }
    }
    STATE.messages.round = `${STATE.players[victimIdx]?.name} '${STATE.deathReason}!'`;
    STATE.messages.roundColor = STATE.players[victimIdx].color;

    if (STATE.players[winnerIdx].score >= CONFIG.MAX_SCORE) {
        STATE.sfx.win();
        STATE.isGameOver = true;
        STATE.messages.win = `${STATE.players[winnerIdx]?.name} WINS!`;
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

function handleTimeOut() {
    if (STATE.gameTime <= 0) {
        STATE.isRoundOver = true;
        STATE.messages.round = "TIME OUT!";
        STATE.messages.roundColor = "#ffff00";
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (STATE.isAttractMode) STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER;
        return true;
    }
    return false;
}

function handleSuddenDeath() {
    // Sudden Death - Every second after time runs low (e.g. < 30 seconds left)
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
}

function updateMinesAndCrates() {
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
}

function update() {
    if (navigator.getGamepads)//  Get Gamepad State (This now handles System Logic too!)
        STATE.gpData = pollGamepads(startGame);
    if (STATE.screen === 'HIGHSCORES') {
        // Allow exiting high scores
        if (STATE.keys['Digit1'] || STATE.keys['Space'] || STATE.keys['Enter'] || STATE.keys['KeyStart']) {
            STATE.screen = 'MENU';
        }
        return;
    }
    if (STATE.screen === 'PLAYER_SETUP') {
        handlePlayerSetupInput();
        return;
    }
    if (STATE.screen === 'MENU') {
        if (STATE.keys['Digit1']) { STATE.gameMode = 'SINGLE'; startMatchSetup(); }
        if (STATE.keys['Digit2']) { STATE.gameMode = 'MULTI'; startMatchSetup(); }
        if (STATE.keys['Digit3']) {
            STATE.screen = 'HIGHSCORES';
            STATE.gameMode = 'HIGHSCORES';
        }
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
    if(handleTimeOut()) return;
    STATE.gameTime -= 1;
    handleSuddenDeath();
    updateMinesAndCrates();
    checkBeamCollisions();

    STATE.players.forEach((p, idx) => {
        checkArmorCrate(p);
        if (p.stunTime > 0) p.stunTime--;
        if (p.glitchTime > 0) p.glitchTime--;
        checkPortalActions(p);
        checkBoostTrail(p);
        checkBeamActions(p, idx);
        checkMinesActions(p);
        
        let cmd = {};// --- INPUT LOGIC  ---
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
    else if (STATE.screen === 'PLAYER_SETUP') renderPlayerSetup();
    else if (STATE.screen === 'HIGHSCORES') renderHighScores(); // New
    else renderGame();
    requestAnimationFrame(loop);
}
let setupInputDelay = 0;

function handlePlayerSetupInput() {
    if (setupInputDelay > 0) {
        setupInputDelay--;
        return;
    }

    const ps = STATE.playerSetup;
    const controls = ps.activePlayer === 0 ? CONTROLS_P1 : CONTROLS_P2;
    const input = getHumanInput(ps.activePlayer, controls);

    // ===== COLOR PHASE =====
    if (ps.phase === 'COLOR') {
        // UP: Previous color
        if (input.up) {
            ps.colorIdx = (ps.colorIdx - 1 + CONFIG.PLAYER_COLORS.length) % CONFIG.PLAYER_COLORS.length;
            setupInputDelay = 8;
        }

        // DOWN: Next color
        if (input.down) {
            ps.colorIdx = (ps.colorIdx + 1) % CONFIG.PLAYER_COLORS.length;
            setupInputDelay = 8;
        }

        // RIGHT or ACTION: Confirm color, move to name entry
        if (input.right || input.boom || input.beam || input.start) {
            // Store color for this player
            STATE.players[ps.activePlayer].color = CONFIG.PLAYER_COLORS[ps.colorIdx].hex;

            // Move to NAME phase
            ps.phase = 'NAME';
            ps.nameCharIdx = 0;
            ps.nameChars = [65, 65, 65];
            setupInputDelay = 15;
        }

        // LEFT: Go back to previous player (if not first player)
        if (input.left) {
            if (ps.activePlayer === 1) {
                ps.activePlayer = 0;
                ps.colorIdx = 0;  // Reset to default
                ps.phase = 'COLOR';
                setupInputDelay = 15;
            }
        }
    }

    // ===== NAME PHASE =====
    else if (ps.phase === 'NAME') {
        // UP: Change character forward
        if (input.up) {
            ps.nameChars[ps.nameCharIdx]++;
            if (ps.nameChars[ps.nameCharIdx] > 90) ps.nameChars[ps.nameCharIdx] = 65;
            setupInputDelay = 10;
        }

        // DOWN: Change character backward
        if (input.down) {
            ps.nameChars[ps.nameCharIdx]--;
            if (ps.nameChars[ps.nameCharIdx] < 65) ps.nameChars[ps.nameCharIdx] = 90;
            setupInputDelay = 10;
        }

        // RIGHT: Next character position or submit
        if (input.right || input.boom || input.beam || input.start) {
            if (ps.nameCharIdx < 2) {
                // Move to next character
                ps.nameCharIdx++;
                setupInputDelay = 15;
            } else {
                // Finished with name, check if more players
                let finalName = validateAndTrimName(String.fromCharCode(...ps.nameChars))
                STATE.players[ps.activePlayer].name = finalName;

                // Check if we need to set up next player
                if (ps.activePlayer === 0 && STATE.gameMode === 'MULTI') {
                    // Move to Player 2
                    ps.activePlayer = 1;
                    ps.colorIdx = 1;  // Default to different color
                    ps.nameCharIdx = 0;
                    ps.nameChars = [65, 65, 65];
                    ps.phase = 'COLOR';  // Start with color selection for P2
                    setupInputDelay = 20;
                } else {
                    // All players done, start game
                    startGame();
                }
            }
        }

        // LEFT: Previous character or go back to color selection
        if (input.left) {
            if (ps.nameCharIdx > 0) {
                ps.nameCharIdx--;
                setupInputDelay = 15;
            } else {
                // Go back to color selection
                ps.phase = 'COLOR';
                ps.colorIdx = ps.activePlayer === 0 ? 0 : 1;
                setupInputDelay = 15;
            }
        }
    }
}

function validateAndTrimName(name) {
    name = name.trim();
    if (!name || name.length === 0) {
        return "AAA";
    }
    if (name.length > 3) {
        name = name.substring(0, 3);
    }
    return name;
}

function updateHtmlUI() {

    let p1Name = STATE.players[0]?.name || "CPU";
    let p1Color = STATE.players[0]?.color ?? CONFIG.PLAYER_COLORS[5]?.hex;
    let p2Name = STATE.players[1]?.name || "CPU";
    let p2Color = STATE.players[1]?.color ?? CONFIG.PLAYER_COLORS[1]?.hex;
    document.getElementById('p1-header').style.color = p1Color;
    document.getElementById('p1-header').innerHTML = p1Name;
    document.getElementById('p2-header').style.color = p2Color;
    document.getElementById('p2-header').innerHTML = p2Name;
    document.getElementById('p1-panel').style.border = `1px solid ${p1Color.slice(0, 7)}63`;
    document.getElementById('p1-panel').style.boxShadow = `inset 0 0 15px ${p1Color.slice(0, 7)}23`;
    document.getElementById('p2-panel').style.border = `1px solid ${p2Color.slice(0, 7)}63`;
    document.getElementById('p2-panel').style.boxShadow = `inset 0 0 15px ${p2Color.slice(0, 7)}23`;
}


window.addEventListener('load', () => {
    setupInputs(startGame, startMatchSetup);
    loop();
    updateHtmlUI();
});