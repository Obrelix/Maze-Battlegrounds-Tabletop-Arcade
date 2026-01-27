import { CONFIG, TAUNTS } from './config.js';
import { STATE } from './state.js';

// --- SFX Wrappers ---

export function playShieldSfx() { STATE.sfx.shield(); }
export function playChargeSfx() { STATE.sfx.charge(); }
export function playMineDropSfx() { STATE.sfx.mineDrop(); }
export function playShootSfx() { STATE.sfx.shoot(); }
export function playChargedShootSfx() { STATE.sfx.chargedShoot(); }
export function playExplosionSfx() { STATE.sfx.explosion(); }
export function playDeathSfx() { STATE.sfx.death(); }
export function playWinSfx() { STATE.sfx.win(); }
export function playRoundOverSfx() { STATE.sfx.roundOver(); }
export function playPowerupSfx() { STATE.sfx.powerup(); }
export function playBoostSfx() { STATE.sfx.boost(); }

// --- Camera ---

export function shakeCamera(amount) { STATE.camera.shake(amount); }

// --- Particles ---

export function spawnDeathParticles(p) {
    for (let i = 0; i < 30; i++) {
        STATE.particles.push({
            x: p.x + 1,
            y: p.y + 1,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.5,
            color: p.color
        });
    }
}

export function spawnExplosionParticles(x, y) {
    const PARTICLE_COUNT = 30;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 3.5;
        STATE.particles.push({
            x: x + 1,
            y: y + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            decay: 0.02 + Math.random() * 0.03,
            life: 1.0,
            color: '#ffffff'
        });
    }
}

export function spawnWallHitParticle(x, y, vx, vy) {
    STATE.particles.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        decay: 0.02 + Math.random() * 0.04,
        life: 0.8,
        color: '#555'
    });
}

export function spawnMuzzleFlashParticles(x, y) {
    for (let i = 0; i < 10; i++) {
        STATE.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 2,
            decay: 0.02 + Math.random() * 0.03,
            color: '#fff'
        });
    }
}

export function updateParticles() {
    for (let i = STATE.particles.length - 1; i >= 0; i--) {
        let p = STATE.particles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // 1. ADD FRICTION (Air Resistance)
        // This makes particles burst fast then slow down nicely
        p.vx *= 0.85;
        p.vy *= 0.85;

        // Decay life
        p.life -= p.decay;

        // 2. DYNAMIC COLOR RAMP (Heat Cooling)
        // White -> Yellow -> Orange -> Red -> Fade
        if (p.life > 0.8) p.color = '#ffffff';       // White Hot
        else if (p.life > 0.5) p.color = '#ffff00';  // Yellow
        else if (p.life > 0.25) p.color = '#ff9900'; // Orange
        else p.color = '#660000';                    // Dark Red (Smoke)

        if (p.life <= 0) STATE.particles.splice(i, 1);
    }
}

// --- Boost Trail ---

export function checkBoostTrail(p) {
    if (p.boostEnergy > 0 && p.currentSpeed > CONFIG.BASE_SPEED) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > CONFIG.TRAIL_LENGTH) p.trail.shift();
    } else if (p.trail.length > 0) {
        p.trail.shift();  // Remove oldest point
    }
}

// --- Messages ---

export function setGoalMessages(p) {
    STATE.sfx.roundOver();
    STATE.isRoundOver = true;
    STATE.messages.round = `${STATE.players[p.id]?.name} SCORES!`;
    STATE.messages.roundColor = p.color;
    STATE.scrollX = CONFIG.LOGICAL_W + 5;
}

export function setGameOverMessages(p) {
    STATE.sfx.win();
    STATE.messages.win = `${STATE.players[p.id]?.name} WINS!`;
    STATE.messages.taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
    STATE.messages.winColor = p.color;
    STATE.messages.roundColor = p.color;
    STATE.scrollX = CONFIG.LOGICAL_W + 5;
}

export function setDeathMessages(reason) {
    STATE.messages.deathReason = reason || "ELIMINATED";
}
