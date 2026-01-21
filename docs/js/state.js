import { SoundFX, Camera, Player } from './classes.js';
import { CONFIG, CONTROLS_P1, CONTROLS_P2, TIMING, COLORS } from './config.js';

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
    ammoLastTakeTime: 0,
    keys: {},
    gameTime: 0,
    maxGameTime: 0,
    isGameOver: false,
    isRoundOver: false,
    deathTimer: 0,
    victimIdx: -1,
    isDraw: false,
    messages: {
        deathReason: "",
        win: "",
        taunt: "",
        round: "",
        winColor: "#fff",
        roundColor: "#fff"
    },
    scrollX: 70,
    scrollY: 0,
    sfx: new SoundFX(),
    camera: new Camera(),
    gpData: null,
    portalReverseColors: false,
    highScores: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [
        { name: "ZEUS", wins: 10 },
        { name: "ARES", wins: 5 },
        { name: "HERA", wins: 3 }
    ],
    playerSetup: {
        activePlayer: 0,      // 0 for P1, 1 for P2
        difficultyIdx: 3,     // Which difficulty selected
        colorIdx: 0,          // Which color selected
        nameCharIdx: 0,       // Which character in name (0, 1, 2)
        nameChars: [65, 65, 65],  // ASCII codes
        phase: 'DIFFICULTY',       // 'DIFFICULTY', 'COLOR' or 'NAME'
        isDone: false
    },
    difficulty: 'INSANE'
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

export function suddenDeathIsActive() {
    if (STATE.gameTime)
        return STATE.gameTime <= TIMING.SUDDEN_DEATH_TIME;
    else return false;
}

export function shouldSpawnAmmoCrate() {
    if (STATE.gameTime && !STATE.ammoCrate)
        return Date.now() - STATE.ammoLastTakeTime > TIMING.AMMO_RESPAWN_DELAY;
    else return false;
}

export function resetStateForMatch() {
    // Store current names if they exist
    let CPUColors = COLORS.filter(x => x.name !== 'BLACK' && x.name !== 'ORANGE' && x.name !== 'BLUE' && x.name !== 'RED' && x.name !== 'PURPLE')
    let p1Name = STATE.players[0]?.name || "CPU";
    let p1Color = STATE.players[0]?.color ?? CPUColors[Math.floor(Math.random() * CPUColors.length)]?.hex;
    let p2Name = STATE.players[1]?.name || "CPU";
    CPUColors = CPUColors.filter(x => x.hex !== p1Color);
    let p2Color = STATE.players[1]?.color ?? CPUColors[Math.floor(Math.random() * CPUColors.length)]?.hex;

    // Create fresh players
    STATE.players = [
        new Player(0, p1Color, CONTROLS_P1),
        new Player(1, p2Color, CONTROLS_P2)
    ];

    STATE.players[0].name = p1Name;
    STATE.players[1].name = p2Name;

    // Reset other match-level variables
    STATE.isGameOver = false;
    STATE.isRoundOver = false;
    STATE.maze = [];
    STATE.mines = [];
    STATE.particles = [];
    STATE.portals = [];
    STATE.projectiles = [];
    STATE.ammoCrate = null;
    STATE.gameTime = CONFIG.GAME_TIME;
    STATE.maxGameTime = CONFIG.GAME_TIME;
    STATE.deathTimer = 0;
    STATE.victimIdx = -1;
    STATE.isDraw = false;
    STATE.messages = {
        deathReason: "",
        win: "",
        taunt: "",
        round: "",
        winColor: "#fff",
        roundColor: "#fff"
    };
    STATE.scrollX = 70,
        STATE.scrollY = 0,
        STATE.portalReverseColors = false;
}
