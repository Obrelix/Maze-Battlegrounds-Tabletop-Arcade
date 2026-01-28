// Message type constants for client-server communication

export const MessageType = {
    // Lobby messages
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

    // Signaling messages (WebRTC)
    SIGNAL: 'SIGNAL',

    // Game messages
    START_GAME: 'START_GAME',
    GAME_START: 'GAME_START',
    INPUT: 'INPUT',

    // Fallback messages
    FALLBACK_REQUEST: 'FALLBACK_REQUEST',
    FALLBACK_CONFIRMED: 'FALLBACK_CONFIRMED',

    // Error messages
    ERROR: 'ERROR'
};

export const ErrorCode = {
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    ROOM_FULL: 'ROOM_FULL',
    NOT_IN_ROOM: 'NOT_IN_ROOM',
    NOT_HOST: 'NOT_HOST',
    NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
    INVALID_MESSAGE: 'INVALID_MESSAGE'
};
