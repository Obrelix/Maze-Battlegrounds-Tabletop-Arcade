// Online Multiplayer Module
// Handles lobby UI, network callbacks, and online game setup

import { CONFIG, GAME } from './config.js';
import { STATE } from './state.js';
import { initMaze } from './grid.js';
import {
    connectToServer, disconnect, requestRoomList, createRoom, joinRoom, leaveRoom,
    startGame as networkStartGame, getLocalPlayerIndex, getNextRoundSeed, getRestartGameSeed,
    setOnRoomListUpdate, setOnRoomJoined, setOnPlayerJoined, setOnPlayerLeft,
    setOnGameStart, setOnNextRound, setOnRestartGame, setOnPause, setOnDisconnect, setOnError
} from './network.js';

// Callbacks that will be set by main.js
let onStartGame = null;
let onUpdateHtmlUI = null;

/**
 * Initialize the online multiplayer module
 * @param {Function} startGameFn - Function to start the game
 * @param {Function} updateHtmlUIFn - Function to update HTML UI
 */
export function initOnlineMultiplayer(startGameFn, updateHtmlUIFn) {
    onStartGame = startGameFn;
    onUpdateHtmlUI = updateHtmlUIFn;

    setupNetworkCallbacks();
    setupLobbyUI();
}

/**
 * Open the lobby modal
 */
export function openLobby() {
    const lobbyModal = document.getElementById('lobby-modal');
    if (lobbyModal) {
        lobbyModal.style.display = 'flex';
    }
}

/**
 * Hide the lobby modal
 */
export function hideLobbyModal() {
    const lobbyModal = document.getElementById('lobby-modal');
    if (lobbyModal) {
        lobbyModal.style.display = 'none';
    }
}

/**
 * Close lobby and disconnect
 */
export function closeLobby() {
    hideLobbyModal();
    disconnect();
    resetLobbyUI();
}

/**
 * Reset lobby UI to initial state
 */
export function resetLobbyUI() {
    const connectSection = document.getElementById('connect-section');
    const lobbyView = document.getElementById('lobby-view');
    const roomView = document.getElementById('room-view');
    const connectBtn = document.getElementById('connect-btn');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    if (connectSection) connectSection.style.display = 'block';
    if (lobbyView) lobbyView.style.display = 'none';
    if (roomView) roomView.style.display = 'none';
    if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
        connectBtn.classList.remove('connected');
    }
    if (statusDot) {
        statusDot.classList.remove('connected');
        statusDot.classList.add('disconnected');
    }
    if (statusText) statusText.textContent = 'Not connected';
}

/**
 * Start an online game
 * @param {number} mazeSeed - Seed for maze generation
 * @param {number} playerIndex - Local player index (0 or 1)
 */
function startOnlineGame(mazeSeed, playerIndex) {
    console.log('startOnlineGame called:', { mazeSeed, playerIndex, currentScreen: GAME.screen });
    GAME.gameMode = 'ONLINE';
    hideLobbyModal();

    if (onStartGame) {
        onStartGame(mazeSeed);
    }

    console.log('After startGame, screen is:', GAME.screen);

    // Set player names after players exist
    STATE.players[playerIndex].name = 'YOU';
    STATE.players[1 - playerIndex].name = 'OPP';

    if (onUpdateHtmlUI) {
        onUpdateHtmlUI();
    }
}

/**
 * Update the player list in the room view
 * @param {Array} players - Array of player objects
 */
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

/**
 * Setup network event callbacks
 */
function setupNetworkCallbacks() {
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

    setOnNextRound(() => {
        // Remote player signaled to start next round
        console.log('Remote player started next round');
        if (GAME.gameMode === 'ONLINE' && GAME.screen === 'PLAYING') {
            // Check if we haven't already initiated the transition
            if (!STATE.onlineTransitionPending) {
                STATE.onlineTransitionPending = true;
                initMaze(getNextRoundSeed());
            }
            // If onlineTransitionPending is true, we already triggered locally, skip
        }
    });

    setOnRestartGame(() => {
        // Remote player signaled to restart the game
        console.log('Remote player restarted the game');
        if (GAME.gameMode === 'ONLINE' && GAME.screen === 'PLAYING') {
            // Check if we haven't already initiated the transition
            if (!STATE.onlineTransitionPending) {
                STATE.onlineTransitionPending = true;
                if (onStartGame) {
                    onStartGame(getRestartGameSeed());
                }
            }
            // If onlineTransitionPending is true, we already triggered locally, skip
        }
    });

    setOnPause((isPaused) => {
        // Remote player toggled pause - synchronize our pause state
        console.log('Remote player toggled pause:', isPaused);
        if (GAME.gameMode === 'ONLINE' && GAME.screen === 'PLAYING') {
            STATE.isPaused = isPaused;
        }
    });

    setOnDisconnect((reason) => {
        if (GAME.gameMode === 'ONLINE' && GAME.screen === 'PLAYING') {
            STATE.isPaused = true;
            const disconnectOverlay = document.getElementById('disconnect-overlay');
            if (disconnectOverlay) {
                disconnectOverlay.style.display = 'flex';
                const msg = disconnectOverlay.querySelector('.disconnect-message');
                if (msg) msg.textContent = 'Click anywhere to return to menu';
            }
        }
        resetLobbyUI();
    });

    setOnError((error) => {
        const errorDisplay = document.getElementById('lobby-error');
        if (errorDisplay) {
            errorDisplay.textContent = error.message;
            errorDisplay.style.display = 'block';
            setTimeout(() => errorDisplay.style.display = 'none', 3000);
        }
    });
}

/**
 * Setup lobby UI event listeners
 */
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

                // Update connection status indicator
                const statusDot = document.querySelector('.status-dot');
                const statusText = document.querySelector('.status-text');
                if (statusDot) {
                    statusDot.classList.remove('disconnected');
                    statusDot.classList.add('connected');
                }
                if (statusText) statusText.textContent = 'Connected';

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
            const lobbyView = document.getElementById('lobby-view');
            const roomView = document.getElementById('room-view');
            const startBtn = document.getElementById('start-game-btn');
            if (lobbyView) lobbyView.style.display = 'block';
            if (roomView) roomView.style.display = 'none';
            if (startBtn) startBtn.disabled = true;
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

    // Disconnect overlay - click to return to menu
    const disconnectOverlay = document.getElementById('disconnect-overlay');
    if (disconnectOverlay) {
        disconnectOverlay.addEventListener('click', () => {
            disconnectOverlay.style.display = 'none';
            STATE.isPaused = false;
            GAME.screen = 'MENU';
            GAME.menuSelection = 0;
            GAME.inputDelay = CONFIG.INPUT_DELAY;
            GAME.gameMode = 'SINGLE';
            document.getElementById('statusText').innerText = 'SELECT MODE';
        });
    }
}
