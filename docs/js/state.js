import { SoundFX, Camera, Player } from './classes.js';
import { CONFIG, CONTROLS_P1, CONTROLS_P2 } from './config.js';

export const STATE = {
    screen: 'MENU',
    gameMode: 'SINGLE',
    isAttractMode: false,
    demoResetTimer: 0,
    maze: [],
    players: [],
    mines: [],
    particles: [],
    portals: [],
    projectiles: [],
    ammoCrate: null,
    ammoRespawnTimer: 0,
    keys: {},
    gameTime: 0,
    maxGameTime: 0,
    isGameOver: false,
    isRoundOver: false,
    deathTimer: 0,
    victimIdx: -1,
    looser: -1,
    isDraw: false,
    messages: {
        deathReason: "",
        win: "",
        taunt: "",
        round: "",
        winColor: "#fff",
        roundColor: "#fff"
    },
    scrollX: 0,
    sfx: new SoundFX(),
    camera: new Camera(),
    gpData: null,
    portalReverseColors: false,
    highScores: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [
        { name: "ZEUS", wins: 10 },
        { name: "ARES", wins: 5 },
        { name: "HERA", wins: 3 }
    ],
    nameEntry: {
        activePlayer: 0, // 0 for P1, 1 for P2
        charIdx: 0,      // Which letter (0, 1, 2)
        chars: [65, 65, 65], // ASCII codes for 'A'
        p1Name: "AAA",
        p2Name: "BBB",
        isDone: false
    }
};

export function saveHighScore(name) {
    let entry = STATE.highScores.find(e => e.name === name);
    if (entry) {
        entry.wins++;
    } else {
        STATE.highScores.push({ name: name, wins: 1 });
    }
    // Sort by wins (descending) and keep top 5
    STATE.highScores.sort((a, b) => b.wins - a.wins);
    STATE.highScores = STATE.highScores.slice(0, 5);
    
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(STATE.highScores));
}

export function resetStateForMatch() {
    STATE.players = [
        new Player(0, CONFIG.P1COLOR, CONTROLS_P1),
        new Player(1, CONFIG.P2COLOR, CONTROLS_P2)
    ];
    // Reset other match-level variables
    STATE.isGameOver = false;
    STATE.isRoundOver = false;
}