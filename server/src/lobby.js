// Room management for matchmaking lobby

import { v4 as uuidv4 } from 'uuid';
import { MessageType, ErrorCode } from './protocol.js';

const rooms = new Map();
const playerRooms = new Map(); // Map player ID to room ID

export function createRoom(ws, name) {
    const roomId = uuidv4().slice(0, 8);
    const room = {
        id: roomId,
        name: name || `Room ${roomId}`,
        hostId: ws.id,
        players: [ws],
        inGame: false,
        mazeSeed: null
    };

    rooms.set(roomId, room);
    playerRooms.set(ws.id, roomId);

    ws.send(JSON.stringify({
        type: MessageType.ROOM_CREATED,
        roomId: roomId,
        roomName: room.name,
        isHost: true,
        playerIndex: 0
    }));

    broadcastRoomList();
    return room;
}

export function joinRoom(ws, roomId) {
    const room = rooms.get(roomId);

    if (!room) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            code: ErrorCode.ROOM_NOT_FOUND,
            message: 'Room not found'
        }));
        return null;
    }

    if (room.players.length >= 2) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            code: ErrorCode.ROOM_FULL,
            message: 'Room is full'
        }));
        return null;
    }

    if (room.inGame) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            code: ErrorCode.ROOM_FULL,
            message: 'Game already in progress'
        }));
        return null;
    }

    room.players.push(ws);
    playerRooms.set(ws.id, roomId);

    // Notify the joining player
    ws.send(JSON.stringify({
        type: MessageType.ROOM_JOINED,
        roomId: roomId,
        roomName: room.name,
        isHost: false,
        playerIndex: 1,
        players: room.players.map((p, i) => ({ id: p.id, index: i }))
    }));

    // Notify the host that someone joined
    const host = room.players[0];
    host.send(JSON.stringify({
        type: MessageType.PLAYER_JOINED,
        playerId: ws.id,
        playerIndex: 1,
        playerCount: room.players.length
    }));

    broadcastRoomList();
    return room;
}

export function leaveRoom(ws) {
    const roomId = playerRooms.get(ws.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) {
        playerRooms.delete(ws.id);
        return;
    }

    const playerIndex = room.players.findIndex(p => p.id === ws.id);
    if (playerIndex === -1) {
        playerRooms.delete(ws.id);
        return;
    }

    room.players.splice(playerIndex, 1);
    playerRooms.delete(ws.id);

    ws.send(JSON.stringify({
        type: MessageType.ROOM_LEFT,
        roomId: roomId
    }));

    if (room.players.length === 0) {
        // Delete empty room
        rooms.delete(roomId);
    } else {
        // Notify remaining player
        room.players.forEach(p => {
            p.send(JSON.stringify({
                type: MessageType.PLAYER_LEFT,
                playerId: ws.id,
                playerCount: room.players.length
            }));
        });

        // If host left, transfer host to remaining player
        if (playerIndex === 0 && room.players.length > 0) {
            room.hostId = room.players[0].id;
            room.players[0].send(JSON.stringify({
                type: MessageType.ROOM_JOINED,
                roomId: roomId,
                roomName: room.name,
                isHost: true,
                playerIndex: 0,
                players: room.players.map((p, i) => ({ id: p.id, index: i }))
            }));
        }
    }

    broadcastRoomList();
}

export function listRooms(ws) {
    const roomList = Array.from(rooms.values())
        .filter(r => !r.inGame && r.players.length < 2)
        .map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            maxPlayers: 2
        }));

    ws.send(JSON.stringify({
        type: MessageType.ROOMS_LIST,
        rooms: roomList
    }));
}

export function startGame(ws) {
    const roomId = playerRooms.get(ws.id);
    if (!roomId) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            code: ErrorCode.NOT_IN_ROOM,
            message: 'Not in a room'
        }));
        return;
    }

    const room = rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== ws.id) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            code: ErrorCode.NOT_HOST,
            message: 'Only host can start game'
        }));
        return;
    }

    if (room.players.length < 2) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            code: ErrorCode.NOT_ENOUGH_PLAYERS,
            message: 'Need 2 players to start'
        }));
        return;
    }

    // Generate maze seed
    room.mazeSeed = Math.floor(Math.random() * 0xFFFFFFFF);
    room.inGame = true;

    // Notify all players
    console.log(`Sending GAME_START to ${room.players.length} players, mazeSeed=${room.mazeSeed}`);
    room.players.forEach((player, index) => {
        console.log(`  Sending to player ${index} (${player.id})`);
        player.send(JSON.stringify({
            type: MessageType.GAME_START,
            mazeSeed: room.mazeSeed,
            playerIndex: index,
            opponentId: room.players[(index + 1) % 2].id
        }));
    });

    broadcastRoomList();
}

export function getRoom(ws) {
    const roomId = playerRooms.get(ws.id);
    return roomId ? rooms.get(roomId) : null;
}

export function getOpponent(ws) {
    const room = getRoom(ws);
    if (!room) return null;
    return room.players.find(p => p.id !== ws.id);
}

function broadcastRoomList() {
    // Get all connected clients and send room list
    const roomList = Array.from(rooms.values())
        .filter(r => !r.inGame && r.players.length < 2)
        .map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            maxPlayers: 2
        }));

    const message = JSON.stringify({
        type: MessageType.ROOMS_LIST,
        rooms: roomList
    });

    // Broadcast to all players not currently in a room
    for (const [playerId, roomId] of playerRooms) {
        // Only broadcast to players in lobby (not in game)
        const room = rooms.get(roomId);
        if (!room || !room.inGame) {
            // This will be handled by the server maintaining client list
        }
    }
}

export function handleDisconnect(ws) {
    leaveRoom(ws);
}
