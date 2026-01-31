const FIXED_STEP_MS = 1000 / 60; //1000/ 32,// ~31.25 ms
export const CONFIG = {
    BLAST_RADIUS: 4.0,
    FIXED_STEP_MS: FIXED_STEP_MS,
    GAME_TIME: Math.round(2000000 / FIXED_STEP_MS),
    MAZE_OFFSET_X: 8,
    LOGICAL_W: 128,
    LOGICAL_H: 64,
    PITCH: 10,
    LED_RADIUS: 3.5,
    CELL_SIZE: 3,
    ROWS: 21,
    COLS: 37,
    MAX_ENERGY: 150,
    MAX_SCORE: 5,
    MAX_MINES: 4,
    BASE_SPEED: 0.6,
    MAX_SPEED: 1.4,
    BEAM_SPEED: 1.8,
    C_BEAM_SPEED: 1.2,
    CHARGE_MOVEMENT_PENALTY: 0.6,
    PORTAL_GLITCH_CHANCE: 0.3,
    BEAM_LENGTH: 8,
    TRAIL_LENGTH: 15,
    C_BEAM_LENGTH: 6,
    PARTICLE_COUNT: 20,
    C_BEAM_RANGE: 16,
    C_BEAM_WIDTH: 2,
    GAMEPAD_THRESH: 0.5,
    BOOST_COOLDOWN_FRAMES: 120,
    STORAGE_KEY: 'LED_MAZE_HIGHSCORES',
    DEFAULT_NAMES: ['P-1', 'P-2'],
    INPUT_DELAY: 20,
};



export const TIMING = {
    SUDDEN_DEATH_TIME: 1800,                                // Frames
    CHARGE_DURATION: Math.round(3000 / FIXED_STEP_MS),      // 180 frames
    MINE_ARM_TIME: Math.round(1000 / FIXED_STEP_MS),        // 60 frames
    STUN_DURATION: Math.round(1500 / FIXED_STEP_MS),        // 90 frames
    GLITCH_DURATION: Math.round(3000 / FIXED_STEP_MS),      // 180 frames
    DEMO_RESET_TIMER: 500,                                  // Frames
    AMMO_RESPAWN_DELAY: Math.round(1500 / FIXED_STEP_MS),   // 90 frames
    MINE_COOLDOWN: Math.round(250 / FIXED_STEP_MS),         // 15 frames
    BOOST_SOUND_THROTTLE: Math.round(600 / FIXED_STEP_MS),  // 36 frames
    IDLE_THRESHOLD: 15000,                                    // milliseconds (wall-clock)
};

export const ENERGY_RATES = {
    SHIELD_DRAIN: CONFIG.MAX_ENERGY / (6 * 60),       // 0.417 per tick (~6 sec to empty, same as boost)
    BOOST_DRAIN: CONFIG.MAX_ENERGY / (6 * 60),        // 0.417 per tick (~6 sec to empty)
    BOOST_REGEN: (CONFIG.MAX_ENERGY / (12 * 60))      // 0.208 per tick (~12 sec to full)
};

export const ENERGY_COSTS = {
    BEAM: 30,
    CHARGED_BEAM: 65,
    SHIELD_ACTIVATION: 10,
    DETONATION: 30,
    BEAM_HIT_TRANSFER: 15,      // Energy gained/lost on beam hit
};

// Collision and movement constants
export const COLLISION = {
    HITBOX_SIZE: 0.8,           // Player hitbox size for wall collision
    COLLISION_PAD: 0.6,         // Padding for collision detection
    CORNER_ASSIST_OFFSET: 0.6,  // How far to look ahead for corner assist
    CORNER_NUDGE_SPEED: 0.15,   // How fast to nudge player around corners
    MOVEMENT_STEP_SIZE: 0.5,    // Sub-step size for collision detection
    GOAL_DISTANCE: 1.0,         // Distance threshold for goal scoring
    BEAM_HIT_RADIUS: 1.5,       // Distance for beam to hit player
    BEAM_COLLISION_DIST: 4,     // Distance for beam vs beam collision
    STUN_SPEED_MULT: 0.5,       // Speed multiplier when stunned
    PORTAL_COOLDOWN: 60,        // Frames before portal can be used again
    PORTAL_INVULN_FRAMES: 10,   // Invulnerability frames after portal teleport
    DEATH_TIMER_FRAMES: 50,     // Frames to wait after death before round ends
};

export const CONTROLS_P1 = {
    select: 'KeySelect',
    start: 'KeyStart',
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    shield: 'KeyR',
    beam: 'KeyF',
    mine: 'KeyE',
    boost: 'KeyG',
    boom: 'Space'
};

export const CONTROLS_P2 = {
    select: 'KeySelect',
    start: 'KeyStart',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    shield: 'KeyI',
    beam: 'KeyK',
    mine: 'KeyO',
    boost: 'KeyL',
    boom: 'Enter'
};

export const TAUNTS = [
    "YOUR MOTHER WAS A HAMSTER!", "I FART IN YOUR GENERAL DIRECTION!",
    "GO AWAY OR I SHALL TAUNT YOU AGAIN!", "YOU FIGHT LIKE A DAIRY FARMER!",
    "TIS BUT A SCRATCH!", "RUN AWAY! RUN AWAY!",
    "MY HOVERCRAFT IS FULL OF EELS!", "YOU EMPTY-HEADED ANIMAL!"
];

export const BITMAP_FONT = {
    'A': [0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
    'B': [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0],
    'C': [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1],
    'D': [1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0],
    'E': [1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1],
    'F': [1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0],
    'G': [0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1],
    'H': [1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
    'I': [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    'J': [0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0],
    'K': [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    'L': [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
    'M': [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
    'N': [1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
    'O': [0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    'P': [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0],
    'Q': [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1],
    'R': [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    'S': [0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0],
    'T': [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    'U': [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    'V': [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    'W': [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
    'X': [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
    'Y': [1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    'Z': [1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1],
    '0': [0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    '2': [1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1],
    '3': [1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0],
    '4': [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    '5': [1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0],
    '6': [0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0],
    '7': [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    '8': [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    '9': [0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0],
    '!': [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    ' ': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    '-': [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
    '.': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    ':': [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    '/': [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
    '↑': [0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    '↓': [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0],
    '←': [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,],
    '→': [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,],
};

export const DIGIT_MAP = {
    0: [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
    1: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    2: [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    3: [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1],
    4: [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    5: [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    6: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    7: [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    8: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1]
};

export const COLORS = [
    { name: 'RED', hex: '#ff0000ff' },
    { name: 'YELLOW', hex: '#d9ff00ff' },
    { name: 'ORANGE', hex: '#ff8800ff' },
    { name: 'CYAN', hex: '#00aaffff' },
    { name: 'BLUE', hex: '#0000ffff' },
    { name: 'BLACK', hex: '#000000ff' },
    { name: 'WHITE', hex: '#ffffffff' },
    { name: 'MAGENTA', hex: '#ff0040ff' },
    { name: 'PURPLE', hex: '#aa00ffff' },
    { name: 'PINK', hex: '#ff00ffff' }
];

export const DIFFICULTIES = [
    { name: 'BEGINNER', hex: '#00ff00ff' },
    { name: 'INTERMEDIATE', hex: '#ffff00ff' },
    { name: 'HARD', hex: '#ff5100ff' },
    { name: 'INSANE', hex: '#ff0000ff' },
    { name: 'DYNAMIC', hex: '#00c3ffff' }
];
