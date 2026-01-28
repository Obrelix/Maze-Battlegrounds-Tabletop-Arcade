// WebRTC signaling relay for P2P connection establishment

import { MessageType } from './protocol.js';
import { getOpponent, getRoom } from './lobby.js';

export function handleSignal(ws, data) {
    const opponent = getOpponent(ws);
    if (!opponent) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            message: 'No opponent to signal'
        }));
        return;
    }

    // Relay the signal to the opponent
    opponent.send(JSON.stringify({
        type: MessageType.SIGNAL,
        from: ws.id,
        signal: data.signal
    }));
}

export function handleFallbackRequest(ws) {
    const room = getRoom(ws);
    if (!room) return;

    // Mark room as using fallback mode
    room.useFallback = true;

    // Notify both players
    room.players.forEach(player => {
        player.send(JSON.stringify({
            type: MessageType.FALLBACK_CONFIRMED,
            useFallback: true
        }));
    });
}

export function relayInput(ws, data) {
    const room = getRoom(ws);
    if (!room || !room.useFallback) return;

    const opponent = getOpponent(ws);
    if (!opponent) return;

    // Relay input through server (fallback mode)
    opponent.send(JSON.stringify({
        type: MessageType.INPUT,
        frame: data.frame,
        input: data.input,
        from: ws.id
    }));
}
