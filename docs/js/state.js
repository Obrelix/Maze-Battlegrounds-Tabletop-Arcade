import { SoundFX, Camera, Player } from './classes.js';
import { CONFIG, CONTROLS_P1, CONTROLS_P2, TIMING, COLORS, DIFFICULTIES } from './config.js';
import { DIFFICULTY_PRESETS } from './ai/difficulty.js';

let _state = {
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
    onlineTransitionPending: false, // Prevents double round/game transitions in online mode
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
    highScores: (() => {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
        } catch (e) {
            console.warn('Failed to load high scores:', e);
            return [];
        }
    })() || [
        { name: "ZEU", winColor: "#aa00ffff", oppColor: "#ff0000ff", score: 10, oppScore: 6, opponent: "CPU-INSANE", multiplier: 1 },
        { name: "ARE", winColor: "#ffffffff", oppColor: "#ff5100ff", score: 8, oppScore: 5, opponent: "CPU-HARD", multiplier: 0.8 },
        { name: "HER", winColor: "#00aaffff", oppColor: "#ffff00ff", score: 8, oppScore: 5, opponent: "CPU-INTERME", multiplier: 0.4 }
    ],
    // Match statistics
    stats: (() => {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY + '_stats')) || {
                totalMatches: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                totalRounds: 0,
                totalPlayTime: 0, // in frames
                byDifficulty: {}, // { "HARD": { wins: 0, losses: 0 }, ... }
                byMode: { SINGLE: { wins: 0, losses: 0 }, MULTI: { wins: 0, losses: 0 }, ONLINE: { wins: 0, losses: 0 } },
                recentMatches: [] // Last 10 matches
            };
        } catch (e) {
            console.warn('Failed to load stats:', e);
            return {
                totalMatches: 0, wins: 0, losses: 0, draws: 0,
                totalRounds: 0, totalPlayTime: 0,
                byDifficulty: {},
                byMode: { SINGLE: { wins: 0, losses: 0 }, MULTI: { wins: 0, losses: 0 }, ONLINE: { wins: 0, losses: 0 } },
                recentMatches: []
            };
        }
    })(),
    matchStartFrame: 0, // Track when match started for duration calculation
    pauseMenuSelection: 0, // 0: Resume, 1: Restart, 2: Quit
    highScoreTab: 0, // 0: Leaderboard, 1: Stats
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
    },
    gameMode: 'SINGLE', // 'SINGLE', 'MULTI', 'ONLINE', 'HIGHSCORES'
    screen: 'MENU',
    isAttractMode: false,
    demoResetTimer: 0,
    inputDelay: CONFIG.INPUT_DELAY,
    menuSelection: 0, // 0: SINGLE, 1: LOCAL MULTI, 2: ONLINE MULTI, 3: HIGH SCORES
    lastUpdateTime: 0,
    accumulator: 0,
};

export function getState() {
    return _state;
}

export function updateState(updater) {
    const updates = typeof updater === 'function' ? updater(_state) : updater;
    _state = { ..._state, ...updates };
}

export function saveHighScore() {
    const state = getState();
    let victimIdx = state.victimIdx;
    let winnerIdx = (victimIdx === 0) ? 1 : 0;
    let winner = state.players[winnerIdx];
    let opponent = state.players[victimIdx];
    const ps = state.playerSetup;
    const diff = DIFFICULTY_PRESETS[DIFFICULTIES[ps.difficultyIdx].name];
    let victimName = opponent.name === "CPU" ? `CPU-${diff.NAME.substring(0, 7)}` : `${opponent.name}`;
    let highScores = JSON.parse(JSON.stringify(state.highScores)); // Deep copy
    let entry = highScores.find(e => e.name === winner.name && e.opponent === victimName && e.multiplier === diff.HIGHSCORE_MULTIPLIER);
    let oppColor = opponent.name === "CPU" ? diff.COLOR : opponent.color;
    if (entry) {
        entry.score += winner.score;
        entry.oppScore += opponent.score;
    } else {
        highScores.push({
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
    highScores.sort((a, b) => ((b.score - b.oppScore) * b.multiplier) - ((a.score - a.oppScore) * a.multiplier));
    highScores = highScores.slice(0, 10);

    updateState({ highScores });
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(highScores));
}

/**
 * Save match statistics to localStorage
 */
export function saveStats() {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY + '_stats', JSON.stringify(getState().stats));
    } catch (e) {
        console.warn('Failed to save stats:', e);
    }
}

/**
 * Record match result in statistics
 * @param {number} winnerIdx - Index of winner (0 or 1), or -1 for draw
 */
export function recordMatchStats(winnerIdx) {
    const state = getState();
    const stats = JSON.parse(JSON.stringify(state.stats));

    const p1 = state.players[0];
    const p2 = state.players[1];
    const isP1Human = p1.name !== "CPU";
    const isP2Human = p2.name !== "CPU";
    const ps = state.playerSetup;
    const diffName = DIFFICULTIES[ps.difficultyIdx]?.name || 'UNKNOWN';
    const mode = getState().gameMode;
    const matchDuration = state.frameCount - state.matchStartFrame;

    // Update totals
    stats.totalMatches++;
    stats.totalPlayTime += matchDuration;
    stats.totalRounds += Math.max(p1.score, p2.score);

    // Determine win/loss from human player perspective
    let result = 'draw';
    if (winnerIdx === 0 && isP1Human) result = 'win';
    else if (winnerIdx === 1 && isP1Human && !isP2Human) result = 'loss';
    else if (winnerIdx === 1 && isP2Human) result = 'win';
    else if (winnerIdx === 0 && isP2Human && !isP1Human) result = 'loss';
    else if (winnerIdx === -1) result = 'draw';

    // Update win/loss/draw counts
    if (result === 'win') stats.wins++;
    else if (result === 'loss') stats.losses++;
    else stats.draws++;

    // Update by difficulty (for single player)
    if (mode === 'SINGLE') {
        if (!stats.byDifficulty[diffName]) {
            stats.byDifficulty[diffName] = { wins: 0, losses: 0 };
        }
        if (result === 'win') stats.byDifficulty[diffName].wins++;
        else if (result === 'loss') stats.byDifficulty[diffName].losses++;
    }

    // Update by mode
    if (!stats.byMode[mode]) {
        stats.byMode[mode] = { wins: 0, losses: 0 };
    }
    if (result === 'win') stats.byMode[mode].wins++;
    else if (result === 'loss') stats.byMode[mode].losses++;

    // Add to recent matches (keep last 10)
    stats.recentMatches.unshift({
        date: Date.now(),
        mode: mode,
        difficulty: mode === 'SINGLE' ? diffName : null,
        p1Name: p1.name,
        p1Score: p1.score,
        p2Name: p2.name,
        p2Score: p2.score,
        winner: winnerIdx === 0 ? p1.name : (winnerIdx === 1 ? p2.name : 'DRAW'),
        duration: Math.round(matchDuration / 60) // in seconds
    });
    stats.recentMatches = stats.recentMatches.slice(0, 10);

    updateState({ stats });
    saveStats();
}

/**
 * Get formatted stats for display
 */
export function getFormattedStats() {
    const stats = getState().stats;
    const winRate = stats.totalMatches > 0
        ? Math.round((stats.wins / stats.totalMatches) * 100)
        : 0;
    const avgDuration = stats.totalMatches > 0
        ? Math.round(stats.totalPlayTime / stats.totalMatches / 60)
        : 0;

    return {
        totalMatches: stats.totalMatches,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        winRate: winRate,
        avgDuration: avgDuration,
        totalPlayTime: Math.round(stats.totalPlayTime / 3600), // in minutes
        byDifficulty: stats.byDifficulty,
        byMode: stats.byMode,
        recentMatches: stats.recentMatches
    };
}

export function suddenDeathIsActive() {
    const state = getState();
    if (state.gameTime)
        return state.gameTime <= TIMING.SUDDEN_DEATH_TIME;
    else return false;
}

export function shouldSpawnAmmoCrate() {
    const state = getState();
    if (state.gameTime && !state.ammoCrate)
        return state.frameCount - state.ammoLastTakeTime > TIMING.AMMO_RESPAWN_DELAY;
    else return false;
}

export function resetStateForMatch() {
    const state = getState();
    // Store current names if they exist
    let CPUColors = COLORS.filter(x => x.name !== 'BLACK' && x.name !== 'ORANGE' && x.name !== 'BLUE' && x.name !== 'RED' && x.name !== 'PURPLE')
    let p1Name = state.players[0]?.name || "CPU";
    let p1Color = state.players[0]?.color ?? CPUColors[Math.floor(Math.random() * CPUColors.length)]?.hex;
    let p2Name = state.gameMode === 'MULTI' ? state.players[1]?.name || "CPU" : "CPU";
    CPUColors = CPUColors.filter(x => x.hex !== p1Color);
    let randomColor2 = CPUColors[Math.floor(Math.random() * CPUColors.length)]?.hex
    let p2Color = state.gameMode === 'MULTI' ? (state.players[1]?.color ?? randomColor2) : randomColor2;

    const newPlayers = [
        new Player(0, p1Color, CONTROLS_P1),
        new Player(1, p2Color, CONTROLS_P2)
    ];

    newPlayers[0].name = p1Name;
    newPlayers[1].name = p2Name;

    updateState({
        players: newPlayers,
        frameCount: 0,
        isGameOver: false,
        isRoundOver: false,
        maze: [],
        mines: [],
        particles: [],
        portals: [],
        projectiles: [],
        ammoCrate: null,
        gameTime: CONFIG.GAME_TIME,
        maxGameTime: CONFIG.GAME_TIME,
        deathTimer: 0,
        victimIdx: -1,
        isPaused: false,
        isDraw: false,
        onlineTransitionPending: false,
        matchStartFrame: 0,
        pauseMenuSelection: 0,
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
        portalReverseColors: false
    });
}