import { CONFIG } from './config.js';
import { getState, updateState } from './state.js';

// --- SFX Wrappers ---

export function playShieldSfx() { getState().sfx.shield(); }
export function playChargeSfx() { getState().sfx.charge(); }
export function playMineDropSfx() { getState().sfx.mineDrop(); }
export function playShootSfx() { getState().sfx.shoot(); }
export function playChargedShootSfx() { getState().sfx.chargedShoot(); }
export function playExplosionSfx() { getState().sfx.explosion(); }
export function playDeathSfx() { getState().sfx.death(); }
export function playWinSfx() { getState().sfx.win(); }
export function playRoundOverSfx() { getState().sfx.roundOver(); }
export function playPowerupSfx() { getState().sfx.powerup(); }
export function playBoostSfx() { getState().sfx.boost(); }

// --- Camera ---

export function shakeCamera(amount) { getState().camera.shake(amount); }

// --- Particles ---

export function spawnDeathParticles(p) {
    const newParticles = [];
    for (let i = 0; i < 30; i++) {
        newParticles.push({
            x: p.x + 1,
            y: p.y + 1,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.5,
            color: p.color
        });
    }
    updateState(prevState => ({ particles: [...prevState.particles, ...newParticles] }));
}

export function spawnExplosionParticles(x, y) {
    const PARTICLE_COUNT = 30;
    const newParticles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 3.5;
        newParticles.push({
            x: x + 1,
            y: y + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            decay: 0.02 + Math.random() * 0.03,
            life: 1.0,
            color: '#ffffff'
        });
    }
    updateState(prevState => ({ particles: [...prevState.particles, ...newParticles] }));
}

export function spawnWallHitParticle(x, y, vx, vy) {
    const newParticle = {
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        decay: 0.02 + Math.random() * 0.04,
        life: 0.8,
        color: '#555'
    };
    updateState(prevState => ({ particles: [...prevState.particles, newParticle] }));
}

export function spawnMuzzleFlashParticles(x, y) {
    const newParticles = [];
    for (let i = 0; i < 10; i++) {
        newParticles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 2,
            decay: 0.02 + Math.random() * 0.03,
            color: '#fff'
        });
    }
    updateState(prevState => ({ particles: [...prevState.particles, ...newParticles] }));
}

export function updateParticles() {
    const state = getState();
    const updatedParticles = state.particles.map(p => {
        const newP = { ...p };
        // Move
        newP.x += newP.vx;
        newP.y += newP.vy;

        // 1. ADD FRICTION (Air Resistance)
        newP.vx *= 0.85;
        newP.vy *= 0.85;

        // Decay life
        newP.life -= newP.decay;

        // 2. DYNAMIC COLOR RAMP (Heat Cooling)
        if (newP.life > 0.8) newP.color = '#ffffff';
        else if (newP.life > 0.5) newP.color = '#ffff00';
        else if (newP.life > 0.25) newP.color = '#ff9900';
        else newP.color = '#660000';
        
        return newP;
    }).filter(p => p.life > 0);

    updateState({ particles: updatedParticles });
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

export function setDeathMessages(reason) {
    updateState(prevState => ({
        messages: {
            ...prevState.messages,
            deathReason: reason || "ELIMINATED"
        }
    }));
}
