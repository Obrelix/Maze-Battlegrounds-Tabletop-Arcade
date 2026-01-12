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
    portalReverseColors: false
};

export function resetStateForMatch() {
    STATE.players = [
        new Player(0, CONFIG.P1COLOR, CONTROLS_P1),
        new Player(1, CONFIG.P2COLOR, CONTROLS_P2)
    ];
    // Reset other match-level variables
    STATE.isGameOver = false;
    STATE.isRoundOver = false;
}