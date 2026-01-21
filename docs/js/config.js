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
    BEAM_SPEED: 2.5,
    C_BEAM_SPEED: 1.2,
    CHARGE_MOVEMENT_PENALTY: 0.6,
    PORTAL_GLITCH_CHANCE: 0.3,
    BEAM_LENGTH: 20,
    TRAIL_LENGTH: 15,
    C_BEAM_LENGTH: 6,
    PARTICLE_COUNT: 20,
    C_BEAM_RANGE: 16,
    C_BEAM_WIDTH: 2,
    GAMEPAD_THRESH: 0.5,
    BOOST_COOLDOWN_FRAMES: 120,
    STORAGE_KEY: 'LED_MAZE_HIGHSCORES',
    DEFAULT_NAMES: ['P-1', 'P-2'],
    SCROLL_X_VAL: -1,
    SCROLL_Y_VAL: +2,
};

export const GAME = {
    setupInputDelay: 0,
    lastUpdateTime: 0,
    accumulator: 0
};

export const TIMING = {
    SUDDEN_DEATH_TIME: 1800,        // Frames
    CHARGE_DURATION: 3000,          // milliseconds
    MINE_ARM_TIME: 1000,            // milliseconds
    STUN_DURATION: 1500,            // milliseconds
    GLITCH_DURATION: 3000,          // milliseconds
    DEMO_RESET_TIMER: 500,          // milliseconds
    AMMO_RESPAWN_DELAY: 1500,       // milliseconds
    MINE_COOLDOWN: 250,            // milliseconds
    IDLE_THRESHOLD: 8000,           // milliseconds
};

export const ENERGY_RATES = {
    SHIELD_DRAIN: CONFIG.MAX_ENERGY / (4 * 60),       // 0.83 per tick
    BOOST_DRAIN: CONFIG.MAX_ENERGY / (6 * 60),        // 0.5 per tick
    BOOST_REGEN: (CONFIG.MAX_ENERGY / (12 * 60)) // 0.09375 per tick            
};

export const ENERGY_COSTS = {
    BEAM: 30,
    CHARGED_BEAM: 65,
    SHIELD_ACTIVATION: 10,
    DETONATION: 30,
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
    '3': [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1],
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
    // { name: 'DYNAMIC', hex: '#00c3ffff' }
];
