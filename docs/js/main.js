import { CONFIG, CONTROLS_P1, CONTROLS_P2, TIMING, COLORS, DIFFICULTIES, GAME, setInputDelay } from './config.js';
import { STATE, resetStateForMatch, suddenDeathIsActive, shouldSpawnAmmoCrate } from './state.js';
import { initMaze, spawnAmmoCrate, clearLoSCache } from './grid.js';
import { setupInputs, pollGamepads, checkIdle, getHumanInput } from './input.js';
import { getCpuInput } from './ai/controller.js';
import { setDifficulty, getDynamicDifficulty, setActiveConfig } from './ai/difficulty.js';
import { renderGame, renderMenu, renderPlayerSetup, renderHighScores } from './renderer.js';
import { resolveRound, applyPlayerActions, updateProjectiles, checkBeamCollisions, checkCrate, checkPortalActions, checkBeamActions, checkMinesActions } from './mechanics.js';
import { updateParticles, checkBoostTrail } from './effects.js';
import { validateState } from './debug.js';
import { seededRandom } from './seededRandom.js';
import { getLocalPlayerIndex, sendInput, getRemoteInput, cleanupInputBuffer } from './network.js';
import { initOnlineMultiplayer, openLobby } from './online.js';

function startMatchSetup() {
    resetStateForMatch();
    GAME.screen = 'PLAYER_SETUP';
    STATE.playerSetup = {
        activePlayer: 0,
        difficultyIdx: 3,
        colorIdx: 0,
        nameCharIdx: 0,
        nameChars: [65, 65, 65],
        phase: GAME.gameMode === 'MULTI' ? 'COLOR' : 'DIFFICULTY',
        isDone: false
    };
}

function startGame(mazeSeed = null) {
    if (STATE.sfx) STATE.sfx.init();
    GAME.screen = 'PLAYING';
    resetStateForMatch();
    document.getElementById('statusText').innerText = `GOAL: ${CONFIG.MAX_SCORE} POINTS`;
    const ps = STATE.playerSetup;
    const chosen = DIFFICULTIES[ps.difficultyIdx].name;
    if (chosen === "DYNAMIC") {
        setDifficulty("INTERMEDIATE");
        STATE.difficulty = "DYNAMIC";
    } else {
        STATE.difficulty = chosen;
        setDifficulty(chosen);
    }
    updateHtmlUI();
    initMaze(mazeSeed);
}

/**
 * Start the next round with dynamic difficulty adjustment
 * Called after round over to begin a new round
 */
export function startNextRound(mazeSeed = null) {
    // Apply dynamic difficulty adjustment if in DYNAMIC mode
    if (STATE.difficulty === "DYNAMIC") {
        const p0 = STATE.players[0];
        const p1 = STATE.players[1];
        const humanScore = p0.name !== "CPU" ? p0.score : p1.score;
        const cpuScore = p0.name === "CPU" ? p0.score : p1.score;
        const totalRounds = p0.score + p1.score;

        const newConfig = getDynamicDifficulty(humanScore, cpuScore, totalRounds);
        setActiveConfig(newConfig);
    }
    initMaze(mazeSeed);
}

function finalizeRound() {
    if (STATE.isDraw) {
        resolveRound(null, 'DRAW');
        return;
    }
    let winnerIdx = (STATE.victimIdx === 0) ? 1 : 0;
    resolveRound(winnerIdx, 'COMBAT');
}

function handleTimeOut() {
    if (STATE.gameTime <= 0) {
        resolveRound(null, 'TIMEOUT');
        return true;
    }
    return false;
}

function handleSuddenDeath() {
    if (suddenDeathIsActive()) {
        // Limit total mines on field to prevent screen flooding
        const MAX_SUDDEN_DEATH_MINES = 12;
        if (STATE.mines.length >= MAX_SUDDEN_DEATH_MINES) return;

        if (STATE.gameTime % 50 === 0) {
            // Keep off edges (1 cell margin)
            let rx = Math.floor(seededRandom() * (CONFIG.COLS - 2)) + 1;
            let ry = Math.floor(seededRandom() * (CONFIG.ROWS - 2)) + 1;
            let mineX = CONFIG.MAZE_OFFSET_X + rx * CONFIG.CELL_SIZE;
            let mineY = ry * CONFIG.CELL_SIZE;

            // Check if position overlaps with any player (with safe margin)
            let tooCloseToPlayer = STATE.players.some(p => {
                let dx = Math.abs(p.x - mineX);
                let dy = Math.abs(p.y - mineY);
                return dx < CONFIG.CELL_SIZE * 2 && dy < CONFIG.CELL_SIZE * 2;
            });

            // Check if too close to existing mines
            let tooCloseToMine = STATE.mines.some(m => {
                let dx = Math.abs(m.x - mineX);
                let dy = Math.abs(m.y - mineY);
                return dx < CONFIG.CELL_SIZE * 1.5 && dy < CONFIG.CELL_SIZE * 1.5;
            });

            // Only spawn if not too close to players or other mines
            if (!tooCloseToPlayer && !tooCloseToMine) {
                STATE.mines.push({
                    x: mineX,
                    y: mineY,
                    active: true,
                    droppedAt: STATE.frameCount,
                    visX: 0, visY: 0,
                    owner: -1
                });
            }
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
    if (navigator.getGamepads)
        STATE.gpData = pollGamepads(startGame, startMatchSetup, startNextRound);

    // Decrement inputDelay even while paused (for pause menu navigation)
    if (GAME.inputDelay > 0) GAME.inputDelay--;

    if (GAME.screen !== 'PLAYING' || STATE.isPaused) {
        document.getElementById('joystick-zone').style.display = "none";
        document.getElementById('cross-zone').style.display = "grid";
    }
    if (STATE.isPaused) return;
    STATE.frameCount++;
    clearLoSCache(STATE.frameCount);
    if (GAME.inputDelay > 0) return;
    switch (GAME.screen) {
        case 'HIGHSCORES': handlePlayerHSInput(); return;
        case 'PLAYER_SETUP': handlePlayerSetupInput(); return;
        case 'MENU': handlePlayerMenuInput(); return;
    }
    document.getElementById('joystick-zone').style.display = "flex";
    document.getElementById('cross-zone').style.display = "none";

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
        if (GAME.isAttractMode && GAME.demoResetTimer > 0) {
            GAME.demoResetTimer--;
            if (GAME.demoResetTimer <= 0) {
                if (STATE.isGameOver) {
                    startGame();
                } else {
                    startNextRound();
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

        let cmd = {};

        if (GAME.isAttractMode) {
            cmd = getCpuInput(p, STATE.players[(idx + 1) % 2]);
        } else if (GAME.gameMode === 'ONLINE') {
            const localIdx = getLocalPlayerIndex();
            if (idx === localIdx) {
                cmd = getHumanInput(0, CONTROLS_P1);
                sendInput(STATE.frameCount + 2, cmd);
            } else {
                cmd = getRemoteInput(STATE.frameCount);
            }
        } else {
            if (idx === 0) {
                cmd = getHumanInput(idx, CONTROLS_P1);
            } else {
                if (GAME.gameMode === 'SINGLE') cmd = getCpuInput(p, STATE.players[0]);
                else cmd = getHumanInput(idx, CONTROLS_P2);
            }
        }
        applyPlayerActions(p, cmd);
    });

    if (GAME.gameMode === 'ONLINE') {
        cleanupInputBuffer();
    }
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

    if (GAME.screen === 'MENU') renderMenu();
    else if (GAME.screen === 'PLAYER_SETUP') renderPlayerSetup();
    else if (GAME.screen === 'HIGHSCORES') renderHighScores();
    else renderGame();

    requestAnimationFrame(loop);
}

function handlePlayerHSInput() {
    // Tab switching with A/D or Left/Right
    if (STATE.keys['KeyA'] || STATE.keys['ArrowLeft']) {
        STATE.highScoreTab = 0; // Leaderboard
        setInputDelay();
        return;
    }
    if (STATE.keys['KeyD'] || STATE.keys['ArrowRight']) {
        STATE.highScoreTab = 1; // Stats
        setInputDelay();
        return;
    }

    // Exit to menu with other keys
    if (STATE.keys['Escape'] || STATE.keys['Space'] || STATE.keys['Enter'] || STATE.keys['KeyStart'] ||
        STATE.keys['KeyW'] || STATE.keys['KeyS'] || STATE.keys['ArrowUp'] || STATE.keys['ArrowDown']) {
        GAME.screen = 'MENU';
        GAME.menuSelection = 0;
        setInputDelay();
        STATE.highScoreTab = 0; // Reset tab
    }
}

function handlePlayerMenuInput() {
    const input = getHumanInput(0, CONTROLS_P1);

    if (input.up) {
        GAME.menuSelection = (GAME.menuSelection - 1 + 4) % 4;
        setInputDelay();
    }
    if (input.down) {
        GAME.menuSelection = (GAME.menuSelection + 1) % 4;
        setInputDelay();
    }

    if (input.boom || input.beam || input.start) {
        setInputDelay();
        switch (GAME.menuSelection) {
            case 0:
                GAME.gameMode = 'SINGLE';
                startMatchSetup();
                break;
            case 1:
                GAME.gameMode = 'MULTI';
                startMatchSetup();
                break;
            case 2:
                GAME.gameMode = 'ONLINE';
                openLobby();
                break;
            case 3:
                GAME.screen = 'HIGHSCORES';
                GAME.gameMode = 'HIGHSCORES';
                break;
        }
    }

    // Legacy number key support
    if (STATE.keys['Digit1']) { GAME.gameMode = 'SINGLE'; startMatchSetup(); }
    if (STATE.keys['Digit2']) { GAME.gameMode = 'MULTI'; startMatchSetup(); }
    if (STATE.keys['Digit3']) { GAME.gameMode = 'ONLINE'; openLobby(); }
    if (STATE.keys['Digit4']) { GAME.screen = 'HIGHSCORES'; GAME.gameMode = 'HIGHSCORES'; }

    if (checkIdle() && GAME.gameMode !== 'ONLINE') {
        GAME.isAttractMode = true;
        GAME.gameMode = 'MULTI';
        STATE.playerSetup.difficultyIdx = 3;
        startGame();
    }
    updateParticles();
}

// --- Player Setup Phase Handlers ---

function handleDifficultyPhase(ps, input) {
    if (input.left) {
        ps.difficultyIdx = (ps.difficultyIdx - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
        setInputDelay();
    }
    if (input.right) {
        ps.difficultyIdx = (ps.difficultyIdx + 1) % DIFFICULTIES.length;
        setInputDelay();
    }
    if (input.down || input.boom || input.beam || input.start) {
        ps.phase = 'COLOR';
        STATE.players[ps.activePlayer].color = COLORS[ps.colorIdx].hex;
        setInputDelay();
    }
}

function handleColorPhase(ps, input, isMulti) {
    if (input.left) {
        ps.colorIdx = (ps.colorIdx - 1 + COLORS.length) % COLORS.length;
        setInputDelay();
    }
    if (input.right) {
        ps.colorIdx = (ps.colorIdx + 1) % COLORS.length;
        setInputDelay();
    }
    if (input.down || input.boom || input.beam || input.start) {
        STATE.players[ps.activePlayer].color = COLORS[ps.colorIdx].hex;
        ps.phase = 'NAME';
        ps.nameCharIdx = 0;
        ps.nameChars = ps.nameChars ?? [65, 65, 65];
        setInputDelay();
    }
    if (input.up) {
        if (ps.activePlayer === 1) {
            ps.activePlayer = 0;
            ps.colorIdx = 0;
            ps.phase = 'COLOR';
            setInputDelay();
        } else if (!isMulti) {
            ps.phase = 'DIFFICULTY';
            setInputDelay();
        }
    }
}

function handleNamePhase(ps, input) {
    const NAME_INPUT_DELAY = 7;
    if (input.up) {
        ps.nameChars[ps.nameCharIdx]++;
        if (ps.nameChars[ps.nameCharIdx] > 90) ps.nameChars[ps.nameCharIdx] = 65;
        GAME.inputDelay = NAME_INPUT_DELAY;
    }
    if (input.down) {
        ps.nameChars[ps.nameCharIdx]--;
        if (ps.nameChars[ps.nameCharIdx] < 65) ps.nameChars[ps.nameCharIdx] = 90;
        GAME.inputDelay = NAME_INPUT_DELAY;
    }
    if (input.right || input.boom || input.beam || input.start) {
        if (ps.nameCharIdx < 2) {
            ps.nameCharIdx++;
            setInputDelay();
        } else {
            finishPlayerSetup(ps);
        }
    }
    if (input.left) {
        if (ps.nameCharIdx > 0) {
            ps.nameCharIdx--;
            setInputDelay();
        } else {
            ps.phase = 'COLOR';
            ps.colorIdx = ps.activePlayer === 0 ? 0 : 1;
            setInputDelay();
        }
    }
}

function finishPlayerSetup(ps) {
    let finalName = validateAndTrimName(String.fromCharCode(...ps.nameChars));
    STATE.players[ps.activePlayer].name = finalName;
    if (ps.activePlayer === 0 && GAME.gameMode === 'MULTI') {
        // Move to player 2 setup
        ps.activePlayer = 1;
        ps.colorIdx = 1;
        ps.nameCharIdx = 0;
        ps.nameChars = [65, 65, 65];
        ps.phase = 'COLOR';
        setInputDelay();
    } else {
        setInputDelay();
        startGame();
    }
}

function handlePlayerSetupInput() {
    const ps = STATE.playerSetup;
    const controls = ps.activePlayer === 0 ? CONTROLS_P1 : CONTROLS_P2;
    const input = getHumanInput(ps.activePlayer, controls);
    const isMulti = GAME.gameMode === 'MULTI';

    if (ps.phase === 'DIFFICULTY' && ps.activePlayer === 0 && !isMulti) {
        handleDifficultyPhase(ps, input);
    } else if (ps.phase === 'COLOR') {
        handleColorPhase(ps, input, isMulti);
    } else if (ps.phase === 'NAME') {
        handleNamePhase(ps, input);
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
    initOnlineMultiplayer(startGame, updateHtmlUI);
    loop();
    updateHtmlUI();
});
