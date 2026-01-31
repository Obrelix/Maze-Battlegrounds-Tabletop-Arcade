// Maze Battlegrounds Signaling Server
// WebSocket server for matchmaking lobby and WebRTC signaling

import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { MessageType, ErrorCode } from './src/protocol.js';
import { createRoom, joinRoom, leaveRoom, listRooms, startGame, handleDisconnect } from './src/lobby.js';
import { handleSignal, handleFallbackRequest, relayInput, relayNextRound, relayRestartGame, relayPause } from './src/signaling.js';

import { networkInterfaces } from 'os';

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all network interfaces

const wss = new WebSocketServer({ host: HOST, port: PORT });

// Track all connected clients for broadcasting
const clients = new Set();

// Get local IP addresses for display
function getLocalIPs() {
    const nets = networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push({ name, address: net.address });
            }
        }
    }
    return ips;
}

console.log(`Maze Battlegrounds Signaling Server running on port ${PORT}`);
console.log(`Listening on ${HOST}:${PORT}`);
console.log('\nConnect from other devices using one of these addresses:');
getLocalIPs().forEach(({ name, address }) => {
    console.log(`  ws://${address}:${PORT}  (${name})`);
});

wss.on('connection', (ws) => {
    // Assign unique ID to each connection
    ws.id = uuidv4();
    clients.add(ws);

    console.log(`Client connected: ${ws.id}`);

    // Send initial room list
    listRooms(ws);

    ws.on('message', (data) => {
        let message;
        try {
            message = JSON.parse(data);
        } catch (e) {
            ws.send(JSON.stringify({
                type: MessageType.ERROR,
                code: ErrorCode.INVALID_MESSAGE,
                message: 'Invalid JSON'
            }));
            return;
        }

        switch (message.type) {
            case MessageType.LIST_ROOMS:
                listRooms(ws);
                break;

            case MessageType.CREATE_ROOM:
                createRoom(ws, message.name, clients);
                break;

            case MessageType.JOIN_ROOM:
                joinRoom(ws, message.roomId, clients);
                break;

            case MessageType.LEAVE_ROOM:
                leaveRoom(ws, clients);
                break;

            case MessageType.START_GAME:
                startGame(ws, clients);
                break;

            case MessageType.SIGNAL:
                handleSignal(ws, message);
                break;

            case MessageType.FALLBACK_REQUEST:
                handleFallbackRequest(ws);
                break;

            case MessageType.INPUT:
                relayInput(ws, message);
                break;

            case MessageType.NEXT_ROUND:
                relayNextRound(ws);
                break;

            case MessageType.RESTART_GAME:
                relayRestartGame(ws);
                break;

            case MessageType.PAUSE:
                relayPause(ws, message);
                break;

            default:
                ws.send(JSON.stringify({
                    type: MessageType.ERROR,
                    code: ErrorCode.INVALID_MESSAGE,
                    message: `Unknown message type: ${message.type}`
                }));
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${ws.id}`);
        clients.delete(ws);
        handleDisconnect(ws, clients);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${ws.id}:`, error);
        clients.delete(ws);
        handleDisconnect(ws, clients);
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    wss.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
