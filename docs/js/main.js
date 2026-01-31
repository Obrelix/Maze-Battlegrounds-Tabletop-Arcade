let lastUpdateTime = performance.now();
let accumulator = 0;

import { CONFIG, CONTROLS_P1, CONTROLS_P2, TIMING, COLORS, DIFFICULTIES } from './config.js';
import { getState, updateState, resetStateForMatch, suddenDeathIsActive, shouldSpawnAmmoCrate } from './state.js';
import { initMaze, createAmmoCrate, clearLoSCache } from './grid.js';
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
    updateState(prevState => ({
        screen: 'PLAYER_SETUP',
        playerSetup: {
            activePlayer: 0,
            difficultyIdx: 3,
            colorIdx: 0,
            nameCharIdx: 0,
            nameChars: [65, 65, 65],
            phase: prevState.gameMode === 'MULTI' ? 'COLOR' : 'DIFFICULTY',
            isDone: false
        }
    }));
}

function startGame(mazeSeed = null) {
    const state = getState();
    if (state.sfx) state.sfx.init();
    resetStateForMatch();
    updateState({ screen: 'PLAYING' });
    document.getElementById('statusText').innerText = `GOAL: ${CONFIG.MAX_SCORE} POINTS`;
    const ps = getState().playerSetup;
    const chosen = DIFFICULTIES[ps.difficultyIdx].name;
    if (chosen === "DYNAMIC") {
        setDifficulty("INTERMEDIATE");
        updateState({ difficulty: "DYNAMIC" });
    } else {
        updateState({ difficulty: chosen });
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
    const state = getState();
    // Apply dynamic difficulty adjustment if in DYNAMIC mode
    if (state.difficulty === "DYNAMIC") {
        const p0 = state.players[0];
        const p1 = state.players[1];
        const humanScore = p0.name !== "CPU" ? p0.score : p1.score;
        const cpuScore = p0.name === "CPU" ? p0.score : p1.score;
        const totalRounds = p0.score + p1.score;

        const newConfig = getDynamicDifficulty(humanScore, cpuScore, totalRounds);
        setActiveConfig(newConfig);
    }
    initMaze(mazeSeed);
}

function finalizeRound() {
    const state = getState();
    if (state.isDraw) {
        resolveRound(null, 'DRAW');
        return;
    }
    let winnerIdx = (state.victimIdx === 0) ? 1 : 0;
    resolveRound(winnerIdx, 'COMBAT');
}

function handleTimeOut() {
    if (getState().gameTime <= 0) {
        resolveRound(null, 'TIMEOUT');
        return true;
    }
    return false;
}

function handleSuddenDeath() {
    if (suddenDeathIsActive()) {
        const state = getState();
        // Limit total mines on field to prevent screen flooding
        const MAX_SUDDEN_DEATH_MINES = 12;
        if (state.mines.length >= MAX_SUDDEN_DEATH_MINES) return;

        if (state.gameTime % 50 === 0) {
            // Keep off edges (1 cell margin)
            let rx = Math.floor(seededRandom() * (CONFIG.COLS - 2)) + 1;
            let ry = Math.floor(seededRandom() * (CONFIG.ROWS - 2)) + 1;
            let mineX = CONFIG.MAZE_OFFSET_X + rx * CONFIG.CELL_SIZE;
            let mineY = ry * CONFIG.CELL_SIZE;

            // Check if position overlaps with any player (with safe margin)
            let tooCloseToPlayer = state.players.some(p => {
                let dx = Math.abs(p.x - mineX);
                let dy = Math.abs(p.y - mineY);
                return dx < CONFIG.CELL_SIZE * 2 && dy < CONFIG.CELL_SIZE * 2;
            });

            // Check if too close to existing mines
            let tooCloseToMine = state.mines.some(m => {
                let dx = Math.abs(m.x - mineX);
                let dy = Math.abs(m.y - mineY);
                return dx < CONFIG.CELL_SIZE * 1.5 && dy < CONFIG.CELL_SIZE * 1.5;
            });

            // Only spawn if not too close to players or other mines
            if (!tooCloseToPlayer && !tooCloseToMine) {
                const newMine = {
                    x: mineX,
                    y: mineY,
                    active: true,
                    droppedAt: state.frameCount,
                    visX: 0, visY: 0,
                    owner: -1
                };
                updateState(prevState => ({ mines: [...prevState.mines, newMine] }));
            }
        }
    }
}

function updateMinesAndCrates() {
    const state = getState();
    const newMines = state.mines.map(m => {
        if (!m.active && state.frameCount - m.droppedAt > TIMING.MINE_ARM_TIME) {
            return { ...m, active: true };
        }
        return m;
    });
    
    let changes = { mines: newMines };

    if (shouldSpawnAmmoCrate()) {
        changes.ammoCrate = createAmmoCrate();
    }
    
    updateState(changes);
}

function update() {

    // Decrement inputDelay even while paused (for pause menu navigation)
    if (getState().inputDelay > 0) updateState(p => ({ inputDelay: p.inputDelay - 1 }));

    if (navigator.getGamepads) {
        const gpData = pollGamepads(startGame, startMatchSetup, startNextRound);
        updateState({ gpData });
    }
    
    const state = getState();

    if (getState().screen !== 'PLAYING' || state.isPaused) {
        document.getElementById('joystick-zone').style.display = "none";
        document.getElementById('cross-zone').style.display = "grid";
    }
    if (state.isPaused) return;

    updateState(prevState => ({ frameCount: prevState.frameCount + 1 }));
    clearLoSCache(getState().frameCount);
    if (getState().inputDelay > 0) return;
    switch (getState().screen) {
        case 'HIGHSCORES': handlePlayerHSInput(); return;
        case 'PLAYER_SETUP': handlePlayerSetupInput(); return;
        case 'MENU': handlePlayerMenuInput(); return;
    }
    document.getElementById('joystick-zone').style.display = "flex";
    document.getElementById('cross-zone').style.display = "none";

    const freshState = getState();
    if (suddenDeathIsActive() && !(freshState.isGameOver || freshState.isRoundOver)) {
        updateState(prevState => {
            const newScrollX = prevState.scrollX + prevState.scrollXVal;
            let newScrollY = prevState.scrollY;
            let newScrollXVal = prevState.scrollXVal;
            let newScrollYVal = prevState.scrollYVal;

            if (newScrollX < 5 || newScrollX > 75) {
                newScrollY += newScrollYVal;
                newScrollXVal *= -1;
            }
            if (newScrollY >= 60 || newScrollY < 0) {
                newScrollYVal *= -1;
                newScrollY += newScrollYVal;
            }
            return {
                scrollX: newScrollX,
                scrollY: newScrollY,
                scrollXVal: newScrollXVal,
                scrollYVal: newScrollYVal
            };
        });
    }

    if (freshState.deathTimer > 0) {
        updateState(prevState => ({ deathTimer: prevState.deathTimer - 1 }));
        updateProjectiles();
        updateParticles();
        if (getState().deathTimer <= 0) {
            finalizeRound();
        }
        return;
    }

    if (freshState.isGameOver || freshState.isRoundOver) {
        updateParticles();
        updateState(prevState => {
            let newScrollX = prevState.scrollX - 0.5;
            const msgLen = (prevState.isGameOver ? prevState.messages.taunt.length : prevState.messages.round.length);
            if (newScrollX < -(msgLen * 4.5)) newScrollX = CONFIG.LOGICAL_W;
            return { scrollX: newScrollX };
        });

        if (getState().isAttractMode && getState().demoResetTimer > 0) {
            updateState(prevState => ({ demoResetTimer: prevState.demoResetTimer - 1 }));
            if (getState().demoResetTimer <= 0) {
                if (freshState.isGameOver) {
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
    updateState(prevState => ({ gameTime: prevState.gameTime - 1 }));
    handleSuddenDeath();
    updateMinesAndCrates();
    checkBeamCollisions();

    const players = getState().players;
    players.forEach((p, idx) => {
        checkCrate(p);
        checkPortalActions(p);
        checkBoostTrail(p);
        checkBeamActions(p, idx);
        checkMinesActions(p);

        let cmd = {};
        const latestState = getState();
        if (getState().isAttractMode) {
            cmd = getCpuInput(p, latestState.players[(idx + 1) % 2]);
        } else if (getState().gameMode === 'ONLINE') {
            const localIdx = getLocalPlayerIndex();
            if (idx === localIdx) {
                cmd = getHumanInput(0, CONTROLS_P1);
                sendInput(latestState.frameCount + 2, cmd);
            } else {
                cmd = getRemoteInput(latestState.frameCount);
            }
        } else {
            if (idx === 0) {
                cmd = getHumanInput(idx, CONTROLS_P1);
            } else {
                if (getState().gameMode === 'SINGLE') cmd = getCpuInput(p, latestState.players[0]);
                else cmd = getHumanInput(idx, CONTROLS_P2);
            }
        }
        applyPlayerActions(p, cmd);
    });

    if (getState().gameMode === 'ONLINE') {
        cleanupInputBuffer();
    }
    updateParticles();
    validateState();
}

lastUpdateTime = performance.now();

function loop(now) {
    if (now === undefined) now = performance.now();
    accumulator += now - lastUpdateTime;

    lastUpdateTime = now;
    while (accumulator >= CONFIG.FIXED_STEP_MS) {
        update();
        accumulator -= CONFIG.FIXED_STEP_MS;
    }

    if (getState().screen === 'MENU') renderMenu();
    else if (getState().screen === 'PLAYER_SETUP') renderPlayerSetup();
    else if (getState().screen === 'HIGHSCORES') renderHighScores();
    else renderGame();

    requestAnimationFrame(loop);
}

function handlePlayerHSInput() {
    const state = getState();
    // Tab switching with A/D or Left/Right
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) {
        updateState({ highScoreTab: 0 }); // Leaderboard
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
        return;
    }
    if (state.keys['KeyD'] || state.keys['ArrowRight']) {
        updateState({ highScoreTab: 1 }); // Stats
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
        return;
    }

    // Exit to menu with other keys
    if (state.keys['Escape'] || state.keys['Space'] || state.keys['Enter'] || state.keys['KeyStart'] ||
        state.keys['KeyW'] || state.keys['KeyS'] || state.keys['ArrowUp'] || state.keys['ArrowDown']) {
        updateState({ screen: 'MENU' });
        updateState({ menuSelection: 0 });
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
        updateState({ highScoreTab: 0 }); // Reset tab
    }
}

function handlePlayerMenuInput() {
    const input = getHumanInput(0, CONTROLS_P1);

    if (input.up) {
        updateState(p => ({ menuSelection: (p.menuSelection - 1 + 4) % 4 }));
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }
    if (input.down) {
        updateState(p => ({ menuSelection: (p.menuSelection + 1) % 4 }));
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }

    if (input.boom || input.beam || input.start) {
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
        switch (getState().menuSelection) {
            case 0:
                updateState({ gameMode: 'SINGLE' });
                startMatchSetup();
                break;
            case 1:
updateState({ gameMode: 'MULTI' });
                startMatchSetup();
                break;
            case 2:
updateState({ gameMode: 'ONLINE' });
                openLobby();
                break;
            case 3:
                updateState({ screen: 'HIGHSCORES' });
updateState({ gameMode: 'HIGHSCORES' });
                break;
        }
    }

    // Legacy number key support
    const state = getState();
        if (state.keys['Digit1']) { updateState({ gameMode: 'SINGLE' }); startMatchSetup(); }
    if (state.keys['Digit2']) { updateState({ gameMode: 'MULTI' }); startMatchSetup(); }
    if (state.keys['Digit3']) { updateState({ gameMode: 'ONLINE' }); openLobby(); }
    if (state.keys['Digit4']) { updateState({ screen: 'HIGHSCORES', gameMode: 'HIGHSCORES' }); }

    if (checkIdle() && getState().gameMode !== 'ONLINE') {
        updateState({ isAttractMode: true, gameMode: 'MULTI' });
        updateState(prevState => ({ playerSetup: { ...prevState.playerSetup, difficultyIdx: 3 } }));
        startGame();
    }
    updateParticles();
}

// --- Player Setup Phase Handlers ---

function handleDifficultyPhase(ps, input) {
    if (input.left) {
        ps.difficultyIdx = (ps.difficultyIdx - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }
    if (input.right) {
        ps.difficultyIdx = (ps.difficultyIdx + 1) % DIFFICULTIES.length;
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }
    if (input.down || input.boom || input.beam || input.start) {
        ps.phase = 'COLOR';
        updateState(prevState => {
            const newPlayers = [...prevState.players];
            newPlayers[ps.activePlayer].color = COLORS[ps.colorIdx].hex;
            return { players: newPlayers };
        });
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }
}

function handleColorPhase(ps, input, isMulti) {
    if (input.left) {
        ps.colorIdx = (ps.colorIdx - 1 + COLORS.length) % COLORS.length;
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }
    if (input.right) {
        ps.colorIdx = (ps.colorIdx + 1) % COLORS.length;
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }
    if (input.down || input.boom || input.beam || input.start) {
        updateState(prevState => {
            const newPlayers = [...prevState.players];
            newPlayers[ps.activePlayer].color = COLORS[ps.colorIdx].hex;
            return { players: newPlayers };
        });
        ps.phase = 'NAME';
        ps.nameCharIdx = 0;
        ps.nameChars = ps.nameChars ?? [65, 65, 65];
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    }
    if (input.up) {
        if (ps.activePlayer === 1) {
            ps.activePlayer = 0;
            ps.colorIdx = 0;
            ps.phase = 'COLOR';
            updateState({ inputDelay: CONFIG.INPUT_DELAY });
        } else if (!isMulti) {
            ps.phase = 'DIFFICULTY';
            updateState({ inputDelay: CONFIG.INPUT_DELAY });
        }
    }
}

function handleNamePhase(ps, input) {
    const NAME_INPUT_DELAY = 7;
    if (input.up) {
        ps.nameChars[ps.nameCharIdx]++;
        if (ps.nameChars[ps.nameCharIdx] > 90) ps.nameChars[ps.nameCharIdx] = 65;
        updateState({ inputDelay: NAME_INPUT_DELAY });
    }
    if (input.down) {
        ps.nameChars[ps.nameCharIdx]--;
        if (ps.nameChars[ps.nameCharIdx] < 65) ps.nameChars[ps.nameCharIdx] = 90;
        updateState({ inputDelay: NAME_INPUT_DELAY });
    }
    if (input.right || input.boom || input.beam || input.start) {
        if (ps.nameCharIdx < 2) {
            ps.nameCharIdx++;
            updateState({ inputDelay: CONFIG.INPUT_DELAY });
        } else {
            finishPlayerSetup(ps);
        }
    }
    if (input.left) {
        if (ps.nameCharIdx > 0) {
            ps.nameCharIdx--;
            updateState({ inputDelay: CONFIG.INPUT_DELAY });
        } else {
            ps.phase = 'COLOR';
            ps.colorIdx = ps.activePlayer === 0 ? 0 : 1;
            updateState({ inputDelay: CONFIG.INPUT_DELAY });
        }
    }
}

function finishPlayerSetup(ps) {
    let finalName = validateAndTrimName(String.fromCharCode(...ps.nameChars));
    updateState(prevState => {
        const newPlayers = [...prevState.players];
        newPlayers[ps.activePlayer].name = finalName;
        return { players: newPlayers };
    });
    if (ps.activePlayer === 0 && getState().gameMode === 'MULTI') {
        // Move to player 2 setup
        ps.activePlayer = 1;
        ps.colorIdx = 1;
        ps.nameCharIdx = 0;
        ps.nameChars = [65, 65, 65];
        ps.phase = 'COLOR';
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
    } else {
        updateState({ inputDelay: CONFIG.INPUT_DELAY });
        startGame();
    }
}

function handlePlayerSetupInput() {
    const ps = getState().playerSetup;
    const controls = ps.activePlayer === 0 ? CONTROLS_P1 : CONTROLS_P2;
    const input = getHumanInput(ps.activePlayer, controls);
    const isMulti = getState().gameMode === 'MULTI';

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
    const state = getState();
    let p1Name = state.players[0]?.name || "CPU";
    let p1Color = state.players[0]?.color ?? COLORS[5]?.hex;
    let p2Name = state.players[1]?.name || "CPU";
    let p2Color = state.players[1]?.color ?? COLORS[1]?.hex;
    document.getElementById('p1-header').style.color = p1Color;
    document.getElementById('p1-header').innerHTML = p1Name === "CPU" ? `${p1Name} - ${state.difficulty}` : p1Name;
    document.getElementById('p2-header').style.color = p2Color;
    document.getElementById('p2-header').innerHTML = p2Name === "CPU" ? `${p2Name} - ${state.difficulty}` : p2Name;
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

