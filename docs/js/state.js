import { SoundFX, Camera, Player } from './classes.js';
import { CONFIG, CONTROLS_P1, CONTROLS_P2, TIMING, COLORS, DIFFICULTIES, GAME } from './config.js';
import { DIFFICULTY_PRESETS } from './ai/difficulty.js';

export const STATE = {
    frameCount: 0,
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
    isPaused: false,
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
    scrollXVal: -1,
    scrollYVal: +2,
    sfx: new SoundFX(),
    camera: new Camera(),
    gpData: null,
    portalReverseColors: false,
    cyanColor: COLORS.find(x => x.name === "CYAN").hex,
    blueColor: COLORS.find(x => x.name === "BLUE").hex,
    highScores: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [
        { name: "ZEU", winColor: "#aa00ffff", oppColor: "#ff0000ff", score: 10, oppScore: 6, opponent: "CPU-INSANE", multiplier: 1 },
        { name: "ARE", winColor: "#ffffffff", oppColor: "#ff5100ff", score: 8, oppScore: 5, opponent: "CPU-HARD", multiplier: 0.8 },
        { name: "HER", winColor: "#00aaffff", oppColor: "#ffff00ff", score: 8, oppScore: 5, opponent: "CPU-INTERME", multiplier: 0.4 }
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
    difficulty: 'INSANE',
    aiMentalModel: {
        strategy: null,
        moveDir: { dx: 0, dy: 0 },
        energyStrat: { shield: false, boost: false },
        lastThinkTime: 0
    }
};

export function saveHighScore() {
    let victimIdx = STATE.victimIdx;
    let winnerIdx = (victimIdx === 0) ? 1 : 0;
    let winner = STATE.players[winnerIdx];
    let opponent = STATE.players[victimIdx];
    const ps = STATE.playerSetup;
    const diff = DIFFICULTY_PRESETS[DIFFICULTIES[ps.difficultyIdx].name];
    let victimName = opponent.name === "CPU" ? `CPU-${diff.NAME.substring(0, 7)}` : `${opponent.name}`;
    let entry = STATE.highScores.find(e => e.name === winner.name && e.opponent === victimName && e.multiplier == diff.HIGHSCORE_MULTIPLIER);
    let oppColor = opponent.name === "CPU" ? diff.COLOR : opponent.color;
    if (entry) {
        entry.score += winner.score;
        entry.oppScore += opponent.score;
    } else {
        STATE.highScores.push({
            name: winner.name,
            winColor: winner.color,
            oppColor: oppColor,
            score: winner.score,
            oppScore: opponent.score,
            opponent: victimName,
            multiplier: diff.HIGHSCORE_MULTIPLIER
        });
    }
    // Sort by wins (descending) and keep top 5
    STATE.highScores.sort((a, b) => ((b.score - b.oppScore) * b.multiplier) - ((a.score - a.oppScore) * a.multiplier));
    STATE.highScores = STATE.highScores.slice(0, 10);

    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(STATE.highScores));
}

export function suddenDeathIsActive() {
    if (STATE.gameTime)
        return STATE.gameTime <= TIMING.SUDDEN_DEATH_TIME;
    else return false;
}

export function shouldSpawnAmmoCrate() {
    if (STATE.gameTime && !STATE.ammoCrate)
        return STATE.frameCount - STATE.ammoLastTakeTime > TIMING.AMMO_RESPAWN_DELAY;
    else return false;
}

export function resetStateForMatch() {
    // Store current names if they exist
    let CPUColors = COLORS.filter(x => x.name !== 'BLACK' && x.name !== 'ORANGE' && x.name !== 'BLUE' && x.name !== 'RED' && x.name !== 'PURPLE')
    let p1Name = STATE.players[0]?.name || "CPU";
    let p1Color = STATE.players[0]?.color ?? CPUColors[Math.floor(Math.random() * CPUColors.length)]?.hex;
    let p2Name = GAME.gameMode === 'MULTI' ? STATE.players[1]?.name || "CPU" : "CPU";
    CPUColors = CPUColors.filter(x => x.hex !== p1Color);
    let randomColor2 = CPUColors[Math.floor(Math.random() * CPUColors.length)]?.hex
    let p2Color = GAME.gameMode === 'MULTI' ? (STATE.players[1]?.color ?? randomColor2) : randomColor2;

    // Create fresh players
    STATE.players = [
        new Player(0, p1Color, CONTROLS_P1),
        new Player(1, p2Color, CONTROLS_P2)
    ];

    STATE.players[0].name = p1Name;
    STATE.players[1].name = p2Name;

    // Reset other match-level variables
    STATE.frameCount = 0;
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
    STATE.isPaused = false;
    STATE.isDraw = false;
    STATE.messages = {
        deathReason: "",
        win: "",
        taunt: "",
        round: "",
        winColor: "#fff",
        roundColor: "#fff"
    };
    STATE.scrollX = 70;
    STATE.scrollY = 0;
    STATE.scrollXVal = -1;
    STATE.scrollYVal = +2;
    STATE.portalReverseColors = false;
}
