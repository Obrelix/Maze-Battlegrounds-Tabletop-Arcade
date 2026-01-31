// WebRTC signaling relay for P2P connection establishment

import { MessageType } from './protocol.js';
import { getOpponent, getRoom } from './lobby.js';

export function handleSignal(ws, data) {
    const opponent = getOpponent(ws);
    if (!opponent || opponent.readyState !== 1) {
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
        if (player.readyState === 1) {
            player.send(JSON.stringify({
                type: MessageType.FALLBACK_CONFIRMED,
                useFallback: true
            }));
        }
    });
}

export function relayInput(ws, data) {
    const room = getRoom(ws);
    if (!room || !room.useFallback) return;

    const opponent = getOpponent(ws);
    if (!opponent || opponent.readyState !== 1) return;

    // Relay input through server (fallback mode)
    opponent.send(JSON.stringify({
        type: MessageType.INPUT,
        frame: data.frame,
        input: data.input,
        from: ws.id
    }));
}

export function relayNextRound(ws) {
    const opponent = getOpponent(ws);
    if (!opponent || opponent.readyState !== 1) return;

    // Relay next round signal to opponent
    opponent.send(JSON.stringify({
        type: MessageType.NEXT_ROUND,
        from: ws.id
    }));
}

export function relayRestartGame(ws) {
    const opponent = getOpponent(ws);
    if (!opponent || opponent.readyState !== 1) return;

    // Relay restart game signal to opponent
    opponent.send(JSON.stringify({
        type: MessageType.RESTART_GAME,
        from: ws.id
    }));
}

export function relayPause(ws, data) {
    const opponent = getOpponent(ws);
    if (!opponent || opponent.readyState !== 1) return;

    // Relay pause signal to opponent
    opponent.send(JSON.stringify({
        type: MessageType.PAUSE,
        isPaused: data.isPaused,
        from: ws.id
    }));
}
