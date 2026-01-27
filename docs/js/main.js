import { CONFIG, CONTROLS_P1, CONTROLS_P2, TAUNTS, TIMING, COLORS, DIFFICULTIES, GAME } from './config.js';
import { STATE, resetStateForMatch, saveHighScore, suddenDeathIsActive, shouldSpawnAmmoCrate } from './state.js';
import { initMaze, spawnAmmoCrate } from './grid.js';
import { setupInputs, pollGamepads, checkIdle, getHumanInput } from './input.js';
import { getCpuInput } from './ai/controller.js';
import { setDifficulty } from './ai/difficulty.js';
import { renderGame, renderMenu, renderPlayerSetup, renderHighScores } from './renderer.js';
import { applyPlayerActions, updateProjectiles, checkBeamCollisions, checkCrate, checkPortalActions, checkBeamActions, checkMinesActions } from './mechanics.js';
import { updateParticles, checkBoostTrail } from './effects.js';
import { validateState } from './debug.js';

function startMatchSetup() {
    resetStateForMatch();
    STATE.screen = 'PLAYER_SETUP';
    STATE.playerSetup = {
        activePlayer: 0,
        difficultyIdx: 3,
        colorIdx: 0,
        nameCharIdx: 0,
        nameChars: [65, 65, 65],
        phase: STATE.gameMode === 'MULTI' ? 'COLOR' : 'DIFFICULTY',
        isDone: false
    };
}

function startGame() {
    if (STATE.sfx) STATE.sfx.init();
    STATE.screen = 'PLAYING';
    resetStateForMatch();
    document.getElementById('statusText').innerText = `GOAL: ${CONFIG.MAX_SCORE} POINTS`;
    // setDifficulty('INSANE');
    const ps = STATE.playerSetup;
    const chosen = DIFFICULTIES[ps.difficultyIdx].name;
    if (chosen === "DYNAMIC") {
        // start at INTERMEDIATE for dynamic mode
        setDifficulty("INTERMEDIATE");
        STATE.difficulty = "DYNAMIC";
    } else {
        STATE.difficulty = chosen;
        setDifficulty(chosen);
    }
    updateHtmlUI();
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
        if (STATE.isAttractMode)
            STATE.demoResetTimer = TIMING.DEMO_RESET_TIMER;
        // Reset Logic
        STATE.deathTimer = 0;
        STATE.isDraw = false;
        return;
    }

    // --- STANDARD WINNER LOGIC ---
    let victimIdx = STATE.victimIdx;
    let winnerIdx = (victimIdx === 0) ? 1 : 0;
    STATE.players[winnerIdx].score++;
    if (STATE.players[winnerIdx].score >= CONFIG.MAX_SCORE) {
    }
    STATE.messages.round = `${STATE.players[victimIdx]?.name} '${STATE.messages.deathReason}!'`;
    STATE.messages.roundColor = STATE.players[victimIdx].color;

    if (STATE.players[winnerIdx].score >= CONFIG.MAX_SCORE) {// CHECK FOR MATCH WIN
        STATE.sfx.win();
        let winnerName = STATE.players[winnerIdx].name;
        if (winnerName !== "CPU") {
            saveHighScore(); // SAVE HIGH SCORE
        }
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
        STATE.demoResetTimer = TIMING.DEMO_RESET_TIMER; // Wait ~3 seconds (60 frames/sec * 3)
    }
}

function handleTimeOut() {
    if (STATE.gameTime <= 0) {
        STATE.sfx.roundOver();
        STATE.isRoundOver = true;
        STATE.messages.round = "TIME OUT!";
        STATE.messages.roundColor = "#ffff00";
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (STATE.isAttractMode) STATE.demoResetTimer = TIMING.DEMO_RESET_TIMER;
        return true;
    }
    return false;
}

function handleSuddenDeath() {
    // Sudden Death - Every second after time runs low (e.g. < 30 seconds left)
    if (suddenDeathIsActive()) {
        if (STATE.gameTime % 50 === 0) {
            // Spawn a neutral mine in a random spot to increase panic
            let rx = Math.floor(Math.random() * CONFIG.COLS);
            let ry = Math.floor(Math.random() * CONFIG.ROWS);
            STATE.mines.push({
                x: CONFIG.MAZE_OFFSET_X + rx * CONFIG.CELL_SIZE,
                y: ry * CONFIG.CELL_SIZE,
                active: true, // Instantly active
                droppedAt: STATE.frameCount,
                visX: 0, visY: 0,
                owner: -1 // Neutral owner (hurts everyone)
            });
        }
    }
}

function updateMinesAndCrates() {
    STATE.mines.forEach(m => {
        if (!m.active && STATE.frameCount - m.droppedAt > TIMING.MINE_ARM_TIME) m.active = true;
    });
    if (shouldSpawnAmmoCrate()) {
        spawnAmmoCrate();
    }
}

function update() {
    if (navigator.getGamepads)//  Get Gamepad State (This now handles System Logic too!)
        STATE.gpData = pollGamepads(startGame, startMatchSetup);
    if (STATE.isPaused) return;
    STATE.frameCount++;
    if (STATE.screen === 'HIGHSCORES') {
        // Allow exiting high scores
        if (STATE.keys['Digit1'] || STATE.keys['Digit2'] || STATE.keys['Space'] || STATE.keys['Enter'] || STATE.keys['KeyStart']) {
            STATE.screen = 'MENU';
        }
        return;
    }
    if (STATE.screen === 'PLAYER_SETUP') {
        document.getElementById('joystick-zone').style.display = "none";
        document.getElementById('cross-zone').style.display = "grid";
        handlePlayerSetupInput();
        return;
    }
    document.getElementById('joystick-zone').style.display = "flex";
    document.getElementById('cross-zone').style.display = "none";
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
            STATE.playerSetup.difficultyIdx = 3; // Default to INSANE for demo
            startGame();
        }
        updateParticles();
        return;
    }
    if (suddenDeathIsActive() && !(STATE.isGameOver || STATE.isRoundOver)) {
        STATE.scrollX += STATE.scrollXVal;
        if (STATE.scrollX < 5) {
            STATE.scrollY += STATE.scrollYVal;
            STATE.scrollXVal *= -1;
        }
        if (STATE.scrollX > 75) {
            STATE.scrollY += STATE.scrollYVal;
            STATE.scrollXVal *= -1;
        }
        if (STATE.scrollY >= 60 || STATE.scrollY < 0) {
            STATE.scrollYVal *= -1;
            STATE.scrollY += STATE.scrollYVal;
        }
        // STATE.scrollY = 0;
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
    if (handleTimeOut()) return;
    STATE.gameTime -= 1;
    handleSuddenDeath();
    updateMinesAndCrates();
    checkBeamCollisions();

    STATE.players.forEach((p, idx) => {
        checkCrate(p);
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
    validateState();
}

GAME.lastUpdateTime = performance.now();
function loop(now) {
    if (now === undefined) now = performance.now();
    GAME.accumulator += now - GAME.lastUpdateTime;

    GAME.lastUpdateTime = now;
    while (GAME.accumulator >= CONFIG.FIXED_STEP_MS) {
        update();
        GAME.accumulator -= CONFIG.FIXED_STEP_MS;
    }
    if (STATE.screen === 'MENU') renderMenu();
    else if (STATE.screen === 'PLAYER_SETUP') renderPlayerSetup();
    else if (STATE.screen === 'HIGHSCORES') renderHighScores(); // New
    else renderGame();
    requestAnimationFrame(loop);
}

function handlePlayerSetupInput() {
    if (GAME.setupInputDelay > 0) {
        GAME.setupInputDelay--;
        return;
    }
    const ps = STATE.playerSetup;
    const controls = ps.activePlayer === 0 ? CONTROLS_P1 : CONTROLS_P2;
    const input = getHumanInput(ps.activePlayer, controls);
    const isMulty = STATE.gameMode === 'MULTI';
    if (ps.phase === 'DIFFICULTY' && ps.activePlayer === 0 && !isMulty) {
        if (input.left) { // UP: Previous diff
            ps.difficultyIdx = (ps.difficultyIdx - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
            GAME.setupInputDelay = 8;
        }
        if (input.right) { // DOWN: Next diff
            ps.difficultyIdx = (ps.difficultyIdx + 1) % DIFFICULTIES.length;
            GAME.setupInputDelay = 8;
        }
        if (input.down || input.boom || input.beam || input.start) {
            ps.phase = 'COLOR';
            STATE.players[ps.activePlayer].color = COLORS[ps.colorIdx].hex;
            GAME.setupInputDelay = 15;
        }
    } else if (ps.phase === 'COLOR') { // ===== COLOR PHASE =====
        if (input.left) {// UP: Previous color
            ps.colorIdx = (ps.colorIdx - 1 + COLORS.length) % COLORS.length;
            GAME.setupInputDelay = 8;
        }
        if (input.right) { // DOWN: Next color
            ps.colorIdx = (ps.colorIdx + 1) % COLORS.length;
            GAME.setupInputDelay = 8;
        }
        if (input.down || input.boom || input.beam || input.start) { // RIGHT or ACTION: Confirm color, move to name entry
            STATE.players[ps.activePlayer].color = COLORS[ps.colorIdx].hex;// Store color for this player
            ps.phase = 'NAME'; // Move to NAME phase
            ps.nameCharIdx = 0;
            ps.nameChars = ps.nameChars ?? [65, 65, 65];
            GAME.setupInputDelay = 15;
        }
        if (input.up) {
            if (ps.activePlayer === 1) {
                ps.activePlayer = 0;
                ps.colorIdx = 0;  // Reset to default
                ps.phase = 'COLOR';
                GAME.setupInputDelay = 15;
            } else if (!isMulty) {
                ps.phase = 'DIFFICULTY';
                GAME.setupInputDelay = 15;
            }
        }
    } else if (ps.phase === 'NAME') {// ===== NAME PHASE =====
        if (input.up) { // UP: Change character forward
            ps.nameChars[ps.nameCharIdx]++;
            if (ps.nameChars[ps.nameCharIdx] > 90) ps.nameChars[ps.nameCharIdx] = 65;
            GAME.setupInputDelay = 10;
        }
        if (input.down) { // DOWN: Change character backward
            ps.nameChars[ps.nameCharIdx]--;
            if (ps.nameChars[ps.nameCharIdx] < 65) ps.nameChars[ps.nameCharIdx] = 90;
            GAME.setupInputDelay = 10;
        }
        if (input.right || input.boom || input.beam || input.start) { // RIGHT: Next character position or submit
            if (ps.nameCharIdx < 2) {
                ps.nameCharIdx++; // Move to next character
                GAME.setupInputDelay = 15;
            } else {
                let finalName = validateAndTrimName(String.fromCharCode(...ps.nameChars)) // Finished with name, check if more players
                STATE.players[ps.activePlayer].name = finalName;
                if (ps.activePlayer === 0 && STATE.gameMode === 'MULTI') { // Check if we need to set up next player
                    // Move to Player 2
                    ps.activePlayer = 1;
                    ps.colorIdx = 1;  // Default to different color
                    ps.nameCharIdx = 0;
                    ps.nameChars = [65, 65, 65];
                    ps.phase = 'COLOR';  // Start with color selection for P2
                    GAME.setupInputDelay = 20;
                } else {
                    // All players done, start game
                    startGame();
                }
            }
        }
        if (input.left) { // LEFT: Previous character or go back to color selection
            if (ps.nameCharIdx > 0) {
                ps.nameCharIdx--;
                GAME.setupInputDelay = 15;
            } else {
                // Go back to color selection
                ps.phase = 'COLOR';
                ps.colorIdx = ps.activePlayer === 0 ? 0 : 1;
                GAME.setupInputDelay = 15;
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
    let p1Color = STATE.players[0]?.color ?? COLORS[5]?.hex;
    let p2Name = STATE.players[1]?.name || "CPU";
    let p2Color = STATE.players[1]?.color ?? COLORS[1]?.hex;
    document.getElementById('p1-header').style.color = p1Color;
    document.getElementById('p1-header').innerHTML = p1Name === "CPU" ? `${p1Name} - ${STATE.difficulty}` : p1Name;
    document.getElementById('p2-header').style.color = p2Color;
    document.getElementById('p2-header').innerHTML = p2Name === "CPU" ? `${p2Name} - ${STATE.difficulty}` : p2Name;
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