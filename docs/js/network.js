// Network module for WebRTC P2P multiplayer with WebSocket fallback

import { STATE } from './state.js';

// Message types (must match server protocol)
const MessageType = {
    LIST_ROOMS: 'LIST_ROOMS',
    ROOMS_LIST: 'ROOMS_LIST',
    CREATE_ROOM: 'CREATE_ROOM',
    ROOM_CREATED: 'ROOM_CREATED',
    JOIN_ROOM: 'JOIN_ROOM',
    ROOM_JOINED: 'ROOM_JOINED',
    LEAVE_ROOM: 'LEAVE_ROOM',
    ROOM_LEFT: 'ROOM_LEFT',
    PLAYER_JOINED: 'PLAYER_JOINED',
    PLAYER_LEFT: 'PLAYER_LEFT',
    SIGNAL: 'SIGNAL',
    START_GAME: 'START_GAME',
    GAME_START: 'GAME_START',
    INPUT: 'INPUT',
    NEXT_ROUND: 'NEXT_ROUND', // Signal to start next round
    RESTART_GAME: 'RESTART_GAME', // Signal to restart after game over
    FALLBACK_REQUEST: 'FALLBACK_REQUEST',
    FALLBACK_CONFIRMED: 'FALLBACK_CONFIRMED',
    ERROR: 'ERROR'
};

// Connection state
let ws = null;
let peerConnection = null;
let dataChannel = null;
let localPlayerIndex = 0;
let isHost = false;
let mazeSeed = null;
let originalMazeSeed = null; // Store the original seed for deterministic round seeds
let roundNumber = 0;
let opponentId = null;
let useFallback = false;
let fallbackRequested = false;
let connectionTimeout = null;

// Input buffer for lockstep synchronization
const INPUT_DELAY = 2; // 2-frame input delay for synchronization
const inputBuffer = new Map(); // Map<frame, {local: cmd, remote: cmd}>
const pendingInputs = new Map(); // Inputs waiting to be sent

// Callbacks for lobby UI updates
let onRoomListUpdate = null;
let onRoomJoined = null;
let onPlayerJoined = null;
let onPlayerLeft = null;
let onGameStart = null;
let onNextRound = null;
let onRestartGame = null;
let onDisconnect = null;
let onError = null;

// ICE servers for WebRTC
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];

// Connection timeout (10 seconds for P2P)
const P2P_TIMEOUT = 10000;

/**
 * Connect to the signaling server
 * @param {string} url - WebSocket server URL
 * @returns {Promise<boolean>} - True if connected successfully
 */
export async function connectToServer(url) {
    return new Promise((resolve, reject) => {
        try {
            ws = new WebSocket(url);

            ws.onopen = () => {
                console.log('Connected to signaling server');
                resolve(true);
            };

            ws.onclose = () => {
                console.log('Disconnected from signaling server');
                cleanup();
                if (onDisconnect) onDisconnect('server');
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                console.log('WebSocket message received:', msg.type);
                handleServerMessage(msg);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Disconnect from server
 */
export function disconnect() {
    if (ws) {
        ws.close();
    }
    cleanup();
}

/**
 * Request room list from server
 */
export function requestRoomList() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: MessageType.LIST_ROOMS }));
    }
}

/**
 * Create a new room
 * @param {string} name - Room name
 */
export function createRoom(name) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: MessageType.CREATE_ROOM, name }));
    }
}

/**
 * Join an existing room
 * @param {string} roomId - Room ID to join
 */
export function joinRoom(roomId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: MessageType.JOIN_ROOM, roomId }));
    }
}

/**
 * Leave current room
 */
export function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: MessageType.LEAVE_ROOM }));
    }
    cleanup();
}

/**
 * Start the game (host only)
 */
export function startGame() {
    if (ws && ws.readyState === WebSocket.OPEN && isHost) {
        ws.send(JSON.stringify({ type: MessageType.START_GAME }));
    }
}

/**
 * Get the maze seed for deterministic generation
 * @returns {number|null} - Maze seed or null if not in game
 */
export function getMazeSeed() {
    return mazeSeed;
}

/**
 * Get a deterministic seed for the next round
 * Both clients will compute the same seed based on original seed + round number
 * @returns {number} - Next round seed
 */
export function getNextRoundSeed() {
    roundNumber++;
    // Use a simple hash combining original seed and round number
    // This ensures both clients get the same seed
    const nextSeed = ((originalMazeSeed || 0) * 31 + roundNumber * 7919) >>> 0;
    mazeSeed = nextSeed;
    console.log(`Next round seed: ${nextSeed} (round ${roundNumber})`);
    return nextSeed;
}

/**
 * Send signal to start next round
 * This notifies the other player to proceed to the next round
 */
export function sendNextRound() {
    const message = { type: 'NEXT_ROUND' };

    if (useFallback) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: MessageType.NEXT_ROUND }));
        }
    } else if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(message));
    }
}

/**
 * Set callback for next round signal from remote player
 * @param {function} callback
 */
export function setOnNextRound(callback) {
    onNextRound = callback;
}

/**
 * Send signal to restart game after game over
 * This notifies the other player to restart the match
 */
export function sendRestartGame() {
    const message = { type: 'RESTART_GAME' };

    if (useFallback) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: MessageType.RESTART_GAME }));
        }
    } else if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(message));
    }
}

/**
 * Get a deterministic seed for restarting the game
 * Both clients will compute the same seed based on the original seed
 * @returns {number} - Restart game seed
 */
export function getRestartGameSeed() {
    // Generate new base seed deterministically from original seed
    // Using a large prime multiplier ensures different seeds each restart
    roundNumber = 0;
    const restartSeed = ((originalMazeSeed || 0) * 48271 + 12345) >>> 0;
    originalMazeSeed = restartSeed;
    mazeSeed = restartSeed;
    console.log(`Restart game seed: ${restartSeed}`);
    return restartSeed;
}

/**
 * Set callback for restart game signal from remote player
 * @param {function} callback
 */
export function setOnRestartGame(callback) {
    onRestartGame = callback;
}

/**
 * Get local player index (0 for host, 1 for guest)
 * @returns {number} - Player index
 */
export function getLocalPlayerIndex() {
    return localPlayerIndex;
}

/**
 * Check if connected and ready to play
 * @returns {boolean}
 */
export function isConnected() {
    if (useFallback) {
        return ws && ws.readyState === WebSocket.OPEN;
    }
    return dataChannel && dataChannel.readyState === 'open';
}

/**
 * Check if using WebSocket fallback
 * @returns {boolean}
 */
export function isUsingFallback() {
    return useFallback;
}

/**
 * Send local input for a frame
 * @param {number} frame - Frame number
 * @param {object} cmd - Input command object
 */
export function sendInput(frame, cmd) {
    const serialized = serializeInput(cmd);

    if (useFallback) {
        // Send via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: MessageType.INPUT,
                frame,
                input: serialized
            }));
        }
    } else if (dataChannel && dataChannel.readyState === 'open') {
        // Send via P2P data channel
        dataChannel.send(JSON.stringify({
            type: 'INPUT',
            frame,
            input: serialized
        }));
    } else {
        // Neither P2P nor fallback is ready - request fallback immediately
        if (ws && ws.readyState === WebSocket.OPEN && !fallbackRequested) {
            console.log('No data channel available, requesting WebSocket fallback');
            requestFallback();
        }
    }

    // Store local input
    if (!inputBuffer.has(frame)) {
        inputBuffer.set(frame, { local: null, remote: null });
    }
    inputBuffer.get(frame).local = cmd;
}

/**
 * Get remote player's input for a frame
 * @param {number} frame - Frame number
 * @returns {object|null} - Input command or null if not received yet
 */
export function getRemoteInput(frame) {
    const entry = inputBuffer.get(frame);
    if (entry && entry.remote) {
        return entry.remote;
    }
    // Return last known input as prediction
    return getLastKnownRemoteInput();
}

/**
 * Check if both inputs are ready for a frame
 * @param {number} frame - Frame number
 * @returns {boolean}
 */
export function hasInputsForFrame(frame) {
    const entry = inputBuffer.get(frame);
    return entry && entry.local !== null && entry.remote !== null;
}

/**
 * Set callback for room list updates
 * @param {function} callback
 */
export function setOnRoomListUpdate(callback) {
    onRoomListUpdate = callback;
}

/**
 * Set callback for joining a room
 * @param {function} callback
 */
export function setOnRoomJoined(callback) {
    onRoomJoined = callback;
}

/**
 * Set callback for player joining room
 * @param {function} callback
 */
export function setOnPlayerJoined(callback) {
    onPlayerJoined = callback;
}

/**
 * Set callback for player leaving room
 * @param {function} callback
 */
export function setOnPlayerLeft(callback) {
    onPlayerLeft = callback;
}

/**
 * Set callback for game start
 * @param {function} callback
 */
export function setOnGameStart(callback) {
    onGameStart = callback;
}

/**
 * Set callback for disconnection
 * @param {function} callback
 */
export function setOnDisconnect(callback) {
    onDisconnect = callback;
}

/**
 * Set callback for errors
 * @param {function} callback
 */
export function setOnError(callback) {
    onError = callback;
}

// ============ Internal Functions ============

function handleServerMessage(message) {
    switch (message.type) {
        case MessageType.ROOMS_LIST:
            if (onRoomListUpdate) onRoomListUpdate(message.rooms);
            break;

        case MessageType.ROOM_CREATED:
        case MessageType.ROOM_JOINED:
            isHost = message.isHost;
            localPlayerIndex = message.playerIndex;
            if (onRoomJoined) onRoomJoined(message);
            break;

        case MessageType.PLAYER_JOINED:
            if (onPlayerJoined) onPlayerJoined(message);
            // Host initiates P2P connection when guest joins
            if (isHost) {
                initiateP2PConnection();
            }
            break;

        case MessageType.PLAYER_LEFT:
            if (onPlayerLeft) onPlayerLeft(message);
            break;

        case MessageType.ROOM_LEFT:
            cleanup();
            break;

        case MessageType.GAME_START:
            mazeSeed = message.mazeSeed;
            originalMazeSeed = message.mazeSeed; // Store for deterministic round seeds
            roundNumber = 0;
            localPlayerIndex = message.playerIndex;
            opponentId = message.opponentId;
            console.log(`Game starting: playerIndex=${localPlayerIndex}, mazeSeed=${mazeSeed}`);
            if (onGameStart) onGameStart(message);
            break;

        case MessageType.SIGNAL:
            handleSignalingMessage(message);
            break;

        case MessageType.FALLBACK_CONFIRMED:
            useFallback = true;
            console.log('Using WebSocket fallback for game data');
            break;

        case MessageType.INPUT:
            // Fallback mode: receive input from server
            handleRemoteInput(message.frame, message.input);
            break;

        case MessageType.NEXT_ROUND:
            // Remote player wants to proceed to next round
            console.log('Received NEXT_ROUND signal from remote player');
            if (onNextRound) onNextRound();
            break;

        case MessageType.RESTART_GAME:
            // Remote player wants to restart the game
            console.log('Received RESTART_GAME signal from remote player');
            if (onRestartGame) onRestartGame();
            break;

        case MessageType.ERROR:
            console.error('Server error:', message.message);
            if (onError) onError(message);
            break;
    }
}

async function initiateP2PConnection() {
    console.log('Initiating P2P connection...');

    // Set timeout for P2P connection
    connectionTimeout = setTimeout(() => {
        console.log('P2P connection timeout, requesting fallback');
        requestFallback();
    }, P2P_TIMEOUT);

    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Create data channel (host creates, guest receives)
    dataChannel = peerConnection.createDataChannel('game', {
        ordered: true,
        maxRetransmits: 3
    });
    setupDataChannel(dataChannel);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: MessageType.SIGNAL,
                signal: { ice: event.candidate }
            }));
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('P2P connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
            requestFallback();
        }
    };

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({
        type: MessageType.SIGNAL,
        signal: { sdp: offer }
    }));
}

async function handleSignalingMessage(message) {
    const signal = message.signal;

    if (!peerConnection && signal.sdp) {
        // Guest receives offer, create peer connection
        peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: MessageType.SIGNAL,
                    signal: { ice: event.candidate }
                }));
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('P2P connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                requestFallback();
            }
        };
    }

    if (signal.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        if (signal.sdp.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            ws.send(JSON.stringify({
                type: MessageType.SIGNAL,
                signal: { sdp: answer }
            }));
        }
    }

    if (signal.ice) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice));
    }
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('P2P data channel open');
        clearTimeout(connectionTimeout);
        useFallback = false;
    };

    channel.onclose = () => {
        console.log('P2P data channel closed');
        if (!useFallback) {
            requestFallback();
        }
    };

    channel.onerror = (error) => {
        console.error('Data channel error:', error);
        if (!useFallback) {
            requestFallback();
        }
    };

    channel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'INPUT') {
            handleRemoteInput(data.frame, data.input);
        } else if (data.type === 'NEXT_ROUND') {
            console.log('Received NEXT_ROUND signal via P2P');
            if (onNextRound) onNextRound();
        } else if (data.type === 'RESTART_GAME') {
            console.log('Received RESTART_GAME signal via P2P');
            if (onRestartGame) onRestartGame();
        }
    };
}

function requestFallback() {
    clearTimeout(connectionTimeout);
    fallbackRequested = true;

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    dataChannel = null;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: MessageType.FALLBACK_REQUEST }));
    }
}

function handleRemoteInput(frame, serialized) {
    const cmd = deserializeInput(serialized);

    if (!inputBuffer.has(frame)) {
        inputBuffer.set(frame, { local: null, remote: null });
    }
    inputBuffer.get(frame).remote = cmd;

    // Store for prediction
    lastRemoteInput = cmd;
}

let lastRemoteInput = {
    up: false, down: false, left: false, right: false,
    beam: false, boost: false, shield: false, mine: false,
    boom: false, start: false
};

function getLastKnownRemoteInput() {
    return { ...lastRemoteInput };
}

/**
 * Serialize input command to compact format (2 bytes)
 */
function serializeInput(cmd) {
    let bits = 0;
    if (cmd.up) bits |= 1;
    if (cmd.down) bits |= 2;
    if (cmd.left) bits |= 4;
    if (cmd.right) bits |= 8;
    if (cmd.beam) bits |= 16;
    if (cmd.boost) bits |= 32;
    if (cmd.shield) bits |= 64;
    if (cmd.mine) bits |= 128;
    if (cmd.boom) bits |= 256;
    if (cmd.start) bits |= 512;
    return bits;
}

/**
 * Deserialize input from compact format
 */
function deserializeInput(bits) {
    return {
        up: !!(bits & 1),
        down: !!(bits & 2),
        left: !!(bits & 4),
        right: !!(bits & 8),
        beam: !!(bits & 16),
        boost: !!(bits & 32),
        shield: !!(bits & 64),
        mine: !!(bits & 128),
        boom: !!(bits & 256),
        start: !!(bits & 512)
    };
}

function cleanup() {
    clearTimeout(connectionTimeout);

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    dataChannel = null;
    isHost = false;
    localPlayerIndex = 0;
    mazeSeed = null;
    originalMazeSeed = null;
    roundNumber = 0;
    opponentId = null;
    useFallback = false;
    fallbackRequested = false;
    inputBuffer.clear();
    pendingInputs.clear();
}

// Clean up old input buffer entries (keep last 120 frames = 2 seconds)
export function cleanupInputBuffer() {
    const currentFrame = STATE.frameCount;
    const keepFrom = currentFrame - 120;

    for (const frame of inputBuffer.keys()) {
        if (frame < keepFrom) {
            inputBuffer.delete(frame);
        }
    }
}
