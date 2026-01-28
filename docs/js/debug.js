import { CONFIG, GAME } from './config.js';
import { STATE } from './state.js';

export const DEV_MODE = location.search.includes('dev');

let lastWarningFrame = -Infinity;

function warn(msg) {
    if (STATE.frameCount - lastWarningFrame < 60) return;
    lastWarningFrame = STATE.frameCount;
    console.warn(`[frame ${STATE.frameCount}] STATE INVARIANT: ${msg}`);
}

export function validateState() {
    if (!DEV_MODE) return;
    if (GAME.screen !== 'PLAYING') return;

    // --- Round/game-over requires a valid victim (or draw) ---
    if (STATE.isRoundOver || STATE.isGameOver) {
        if (!STATE.isDraw && (STATE.victimIdx !== 0 && STATE.victimIdx !== 1)) {
            warn(`victimIdx is ${STATE.victimIdx} during round/game over (not a draw)`);
        }
    }

    // --- Player invariants (only when players exist) ---
    if (STATE.players.length === 2) {
        STATE.players.forEach((p, idx) => {
            if (p.score < 0) {
                warn(`players[${idx}].score is negative (${p.score})`);
            }
            if (p.score > CONFIG.MAX_SCORE) {
                warn(`players[${idx}].score (${p.score}) exceeds MAX_SCORE (${CONFIG.MAX_SCORE})`);
            }
            if (p.boostEnergy < 0) {
                warn(`players[${idx}].boostEnergy is negative (${p.boostEnergy})`);
            }
            if (p.boostEnergy > CONFIG.MAX_ENERGY * 1.01) {
                warn(`players[${idx}].boostEnergy (${p.boostEnergy}) exceeds MAX_ENERGY (${CONFIG.MAX_ENERGY})`);
            }
            if (p.minesLeft < 0) {
                warn(`players[${idx}].minesLeft is negative (${p.minesLeft})`);
            }
            if (p.minesLeft > CONFIG.MAX_MINES) {
                warn(`players[${idx}].minesLeft (${p.minesLeft}) exceeds MAX_MINES (${CONFIG.MAX_MINES})`);
            }
            // AI property validation for CPU players
            if (p.name === 'CPU') {
                if (p.aiMentalModel !== null && typeof p.aiMentalModel !== 'object') {
                    warn(`players[${idx}].aiMentalModel should be null or object, got ${typeof p.aiMentalModel}`);
                }
                if (!Array.isArray(p.directionHistory)) {
                    warn(`players[${idx}].directionHistory should be an array, got ${typeof p.directionHistory}`);
                }
                if (typeof p.aiFrameCounter !== 'number') {
                    warn(`players[${idx}].aiFrameCounter should be a number, got ${typeof p.aiFrameCounter}`);
                }
            }
        });
    }

    // --- deathTimer should not be negative ---
    if (STATE.deathTimer < 0) {
        warn(`deathTimer is negative (${STATE.deathTimer})`);
    }

    // --- gameTime should not be negative during active play ---
    if (!STATE.isRoundOver && !STATE.isGameOver && STATE.gameTime < 0) {
        warn(`gameTime is negative (${STATE.gameTime}) during active play`);
    }

    // --- frameCount should always increase ---
    if (STATE.frameCount < 0) {
        warn(`frameCount is negative (${STATE.frameCount})`);
    }
}
