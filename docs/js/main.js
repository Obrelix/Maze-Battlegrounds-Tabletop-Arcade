import { CONFIG, CONTROLS_P1, CONTROLS_P2, TIMING, COLORS, DIFFICULTIES, GAME } from './config.js';
import { STATE, resetStateForMatch, suddenDeathIsActive, shouldSpawnAmmoCrate } from './state.js';
import { initMaze, spawnAmmoCrate } from './grid.js';
import { setupInputs, pollGamepads, checkIdle, getHumanInput } from './input.js';
import { getCpuInput } from './ai/controller.js';
import { setDifficulty } from './ai/difficulty.js';
import { renderGame, renderMenu, renderPlayerSetup, renderHighScores } from './renderer.js';
import { resolveRound, applyPlayerActions, updateProjectiles, checkBeamCollisions, checkCrate, checkPortalActions, checkBeamActions, checkMinesActions } from './mechanics.js';
import { updateParticles, checkBoostTrail } from './effects.js';
import { validateState } from './debug.js';
import { seededRandom } from './seededRandom.js';
import {
    connectToServer, disconnect, requestRoomList, createRoom, joinRoom, leaveRoom,
    startGame as networkStartGame, getMazeSeed, getLocalPlayerIndex, isConnected,
    sendInput, getRemoteInput, cleanupInputBuffer,
    setOnRoomListUpdate, setOnRoomJoined, setOnPlayerJoined, setOnPlayerLeft,
    setOnGameStart, setOnDisconnect, setOnError
} from './network.js';

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
    initMaze(mazeSeed);
}

// Online multiplayer functions
function openLobby() {
    const lobbyModal = document.getElementById('lobby-modal');
    if (lobbyModal) {
        lobbyModal.style.display = 'flex';
    }
}

function hideLobbyModal() {
    const lobbyModal = document.getElementById('lobby-modal');
    if (lobbyModal) {
        lobbyModal.style.display = 'none';
    }
}

function closeLobby() {
    hideLobbyModal();
    disconnect();
}

function startOnlineGame(mazeSeed, playerIndex) {
    console.log('startOnlineGame called:', { mazeSeed, playerIndex, currentScreen: GAME.screen });
    GAME.gameMode = 'ONLINE';
    hideLobbyModal();  // Just hide modal, keep connection open
    startGame(mazeSeed);  // This creates the players
    console.log('After startGame, screen is:', GAME.screen);
    // Now set names after players exist
    STATE.players[playerIndex].name = 'YOU';
    STATE.players[1 - playerIndex].name = 'OPP';
    updateHtmlUI();
    initMaze(mazeSeed);
}

// Setup network callbacks
setOnRoomListUpdate((rooms) => {
    const roomList = document.getElementById('room-list');
    if (!roomList) return;

    roomList.innerHTML = '';
    if (rooms.length === 0) {
        roomList.innerHTML = '<div class="room-item empty">No rooms available</div>';
        return;
    }

    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.innerHTML = `
            <span class="room-name">${room.name}</span>
            <span class="room-players">${room.playerCount}/${room.maxPlayers}</span>
            <button class="join-btn" data-room-id="${room.id}">JOIN</button>
        `;
        item.querySelector('.join-btn').addEventListener('click', () => {
            joinRoom(room.id);
        });
        roomList.appendChild(item);
    });
});

setOnRoomJoined((data) => {
    const lobbyView = document.getElementById('lobby-view');
    const roomView = document.getElementById('room-view');
    const startBtn = document.getElementById('start-game-btn');
    const roomNameDisplay = document.getElementById('room-name-display');

    if (lobbyView) lobbyView.style.display = 'none';
    if (roomView) roomView.style.display = 'block';
    if (roomNameDisplay) roomNameDisplay.textContent = data.roomName;
    if (startBtn) startBtn.style.display = data.isHost ? 'block' : 'none';

    updatePlayerList(data.players || [{ index: data.playerIndex }]);
});

setOnPlayerJoined((data) => {
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) startBtn.disabled = false;
    updatePlayerList([{ index: 0 }, { index: 1 }]);
});

setOnPlayerLeft((data) => {
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) startBtn.disabled = true;
    updatePlayerList([{ index: getLocalPlayerIndex() }]);
});

setOnGameStart((data) => {
    console.log('onGameStart callback fired:', data);
    try {
        startOnlineGame(data.mazeSeed, data.playerIndex);
    } catch (e) {
        console.error('Error in startOnlineGame:', e);
    }
});

setOnDisconnect((reason) => {
    if (GAME.gameMode === 'ONLINE' && GAME.screen === 'PLAYING') {
        STATE.isPaused = true;
        // Show reconnection UI
        const disconnectOverlay = document.getElementById('disconnect-overlay');
        if (disconnectOverlay) disconnectOverlay.style.display = 'flex';
    }
});

setOnError((error) => {
    const errorDisplay = document.getElementById('lobby-error');
    if (errorDisplay) {
        errorDisplay.textContent = error.message;
        errorDisplay.style.display = 'block';
        setTimeout(() => errorDisplay.style.display = 'none', 3000);
    }
});

function updatePlayerList(players) {
    const playerList = document.getElementById('player-list');
    if (!playerList) return;

    playerList.innerHTML = '';
    const localIdx = getLocalPlayerIndex();

    for (let i = 0; i < 2; i++) {
        const div = document.createElement('div');
        div.className = 'player-slot';
        const hasPlayer = players.some(p => p.index === i);

        if (hasPlayer) {
            div.innerHTML = `<span class="player-icon">&#9679;</span> Player ${i + 1}${i === localIdx ? ' (You)' : ''}`;
            div.classList.add('filled');
        } else {
            div.innerHTML = `<span class="player-icon empty">&#9675;</span> Waiting...`;
        }
        playerList.appendChild(div);
    }
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
    // Sudden Death - Every second after time runs low (e.g. < 30 seconds left)
    if (suddenDeathIsActive()) {
        if (STATE.gameTime % 50 === 0) {
            // Spawn a neutral mine in a random spot to increase panic
            let rx = Math.floor(seededRandom() * CONFIG.COLS);
            let ry = Math.floor(seededRandom() * CONFIG.ROWS);
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
    if (GAME.screen === 'HIGHSCORES') {
        // Allow exiting high scores
        if (STATE.keys['Digit1'] || STATE.keys['Digit2'] || STATE.keys['Space'] || STATE.keys['Enter'] || STATE.keys['KeyStart']) {
            GAME.screen = 'MENU';
            GAME.menuSelection = 0;
            GAME.menuInputDelay = CONFIG.MENU_INPUT_DELAY;
        }
        return;
    }
    if (GAME.screen === 'PLAYER_SETUP') {
        document.getElementById('joystick-zone').style.display = "none";
        document.getElementById('cross-zone').style.display = "grid";
        handlePlayerSetupInput();
        return;
    }
    document.getElementById('joystick-zone').style.display = "flex";
    document.getElementById('cross-zone').style.display = "none";
    if (GAME.screen === 'MENU') {
        handlePlayerMenuInput();
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
        if (GAME.isAttractMode && GAME.demoResetTimer > 0) {
            GAME.demoResetTimer--;
            if (GAME.demoResetTimer <= 0) {
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
        if (GAME.isAttractMode) { // Player 1 targets Player 2, Player 2 targets Player 1
            cmd = getCpuInput(p, STATE.players[(idx + 1) % 2]);
        } else if (GAME.gameMode === 'ONLINE') {
            // Online multiplayer: send local input, receive remote input
            const localIdx = getLocalPlayerIndex();
            if (idx === localIdx) {
                // This is the local player
                const controls = localIdx === 0 ? CONTROLS_P1 : CONTROLS_P2;
                cmd = getHumanInput(idx, controls);
                // Send input with 2-frame delay for synchronization
                sendInput(STATE.frameCount + 2, cmd);
            } else {
                // This is the remote player
                cmd = getRemoteInput(STATE.frameCount);
            }
        } else {// Normal Gameplay
            if (idx === 0) {
                cmd = getHumanInput(idx, CONTROLS_P1);
            } else {
                if (GAME.gameMode === 'SINGLE') cmd = getCpuInput(p, STATE.players[0]);
                else cmd = getHumanInput(idx, CONTROLS_P2);
            }
        }
        applyPlayerActions(p, cmd);
    });

    // Cleanup old input buffer entries in online mode
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
    else if (GAME.screen === 'HIGHSCORES') renderHighScores(); // New
    else renderGame();
    requestAnimationFrame(loop);
}

function handlePlayerMenuInput() {
    // Handle menu navigation with input delay
    if (GAME.menuInputDelay > 0) {
        GAME.menuInputDelay--;
        return;
    }
    const input = getHumanInput(0, CONTROLS_P1);
    // Navigate up
    if (input.up) {
        GAME.menuSelection = (GAME.menuSelection - 1 + 4) % 4;
        GAME.menuInputDelay = CONFIG.MENU_INPUT_DELAY;
    }
    // Navigate down
    if (input.down) {
        GAME.menuSelection = (GAME.menuSelection + 1) % 4;
        GAME.menuInputDelay = CONFIG.MENU_INPUT_DELAY;
    }
    // Select with boom (detonate) button
    if (input.boom || input.beam || input.start) {
        GAME.menuInputDelay = CONFIG.MENU_INPUT_DELAY;
        switch (GAME.menuSelection) {
            case 0: // SINGLE PLAYER
                GAME.gameMode = 'SINGLE';
                startMatchSetup();
                break;
            case 1: // LOCAL MULTI
                GAME.gameMode = 'MULTI';
                startMatchSetup();
                break;
            case 2: // ONLINE MULTI
                GAME.gameMode = 'ONLINE';
                openLobby();
                break;
            case 3: // HIGH SCORES
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

    if (checkIdle()) {
        GAME.isAttractMode = true;
        GAME.gameMode = 'MULTI';
        STATE.playerSetup.difficultyIdx = 3; // Default to INSANE for demo
        startGame();
    }
    updateParticles();

}

function handlePlayerSetupInput() {
    if (GAME.menuInputDelay > 0) {
        GAME.menuInputDelay--;
        return;
    }
    if (GAME.setupInputDelay > 0) {
        GAME.setupInputDelay--;
        return;
    }
    const ps = STATE.playerSetup;
    const controls = ps.activePlayer === 0 ? CONTROLS_P1 : CONTROLS_P2;
    const input = getHumanInput(ps.activePlayer, controls);
    const isMulty = GAME.gameMode === 'MULTI';
    if (ps.phase === 'DIFFICULTY' && ps.activePlayer === 0 && !isMulty) {
        if (input.left) { // UP: Previous diff
            ps.difficultyIdx = (ps.difficultyIdx - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
            GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
        }
        if (input.right) { // DOWN: Next diff
            ps.difficultyIdx = (ps.difficultyIdx + 1) % DIFFICULTIES.length;
            GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
        }
        if (input.down || input.boom || input.beam || input.start) {
            ps.phase = 'COLOR';
            STATE.players[ps.activePlayer].color = COLORS[ps.colorIdx].hex;
            GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
        }
    } else if (ps.phase === 'COLOR') { // ===== COLOR PHASE =====
        if (input.left) {// UP: Previous color
            ps.colorIdx = (ps.colorIdx - 1 + COLORS.length) % COLORS.length;
            GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
        }
        if (input.right) { // DOWN: Next color
            ps.colorIdx = (ps.colorIdx + 1) % COLORS.length;
            GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
        }
        if (input.down || input.boom || input.beam || input.start) { // RIGHT or ACTION: Confirm color, move to name entry
            STATE.players[ps.activePlayer].color = COLORS[ps.colorIdx].hex;// Store color for this player
            ps.phase = 'NAME'; // Move to NAME phase
            ps.nameCharIdx = 0;
            ps.nameChars = ps.nameChars ?? [65, 65, 65];
            GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
        }
        if (input.up) {
            if (ps.activePlayer === 1) {
                ps.activePlayer = 0;
                ps.colorIdx = 0;  // Reset to default
                ps.phase = 'COLOR';
                GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
            } else if (!isMulty) {
                ps.phase = 'DIFFICULTY';
                GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
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
                GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
            } else {
                let finalName = validateAndTrimName(String.fromCharCode(...ps.nameChars)) // Finished with name, check if more players
                STATE.players[ps.activePlayer].name = finalName;
                if (ps.activePlayer === 0 && GAME.gameMode === 'MULTI') { // Check if we need to set up next player
                    // Move to Player 2
                    ps.activePlayer = 1;
                    ps.colorIdx = 1;  // Default to different color
                    ps.nameCharIdx = 0;
                    ps.nameChars = [65, 65, 65];
                    ps.phase = 'COLOR';  // Start with color selection for P2
                    GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
                } else {
                    // All players done, start game
                    startGame();
                }
            }
        }
        if (input.left) { // LEFT: Previous character or go back to color selection
            if (ps.nameCharIdx > 0) {
                ps.nameCharIdx--;
                GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
            } else {
                // Go back to color selection
                ps.phase = 'COLOR';
                ps.colorIdx = ps.activePlayer === 0 ? 0 : 1;
                GAME.setupInputDelay = CONFIG.SETUP_INPUT_DELAY;
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
    setupLobbyUI();
});

function setupLobbyUI() {
    // Connect button
    const connectBtn = document.getElementById('connect-btn');
    const serverUrlInput = document.getElementById('server-url');

    if (connectBtn && serverUrlInput) {
        connectBtn.addEventListener('click', async () => {
            const url = serverUrlInput.value.trim();
            if (!url) return;

            connectBtn.disabled = true;
            connectBtn.textContent = 'Connecting...';

            try {
                await connectToServer(url);
                connectBtn.textContent = 'Connected';
                connectBtn.classList.add('connected');
                requestRoomList();

                // Show lobby view
                const connectSection = document.getElementById('connect-section');
                const lobbyView = document.getElementById('lobby-view');
                if (connectSection) connectSection.style.display = 'none';
                if (lobbyView) lobbyView.style.display = 'block';
            } catch (error) {
                connectBtn.disabled = false;
                connectBtn.textContent = 'Connect';
                const errorDisplay = document.getElementById('lobby-error');
                if (errorDisplay) {
                    errorDisplay.textContent = 'Failed to connect to server';
                    errorDisplay.style.display = 'block';
                }
            }
        });
    }

    // Create room button
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomNameInput = document.getElementById('room-name-input');

    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            const name = roomNameInput ? roomNameInput.value.trim() : '';
            createRoom(name || `Room ${Date.now() % 10000}`);
        });
    }

    // Leave room button
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            leaveRoom();
            // Show lobby view
            const lobbyView = document.getElementById('lobby-view');
            const roomView = document.getElementById('room-view');
            if (lobbyView) lobbyView.style.display = 'block';
            if (roomView) roomView.style.display = 'none';
            requestRoomList();
        });
    }

    // Start game button (host only)
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            networkStartGame();
        });
    }

    // Close lobby button
    const closeLobbyBtn = document.getElementById('close-lobby-btn');
    if (closeLobbyBtn) {
        closeLobbyBtn.addEventListener('click', () => {
            closeLobby();
        });
    }

    // Refresh rooms button
    const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
    if (refreshRoomsBtn) {
        refreshRoomsBtn.addEventListener('click', () => {
            requestRoomList();
        });
    }
}