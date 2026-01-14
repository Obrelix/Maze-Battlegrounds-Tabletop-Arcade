import { CONFIG } from './config.js';

export class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.shakeStrength = 0;
        this.shakeDamp = 0.9;
    }

    shake(amount) {
        this.shakeStrength = amount;
    }

    update() {
        if (this.shakeStrength > 0.5) {
            this.x = (Math.random() - 0.5) * this.shakeStrength;
            this.y = (Math.random() - 0.5) * this.shakeStrength;
            this.shakeStrength *= this.shakeDamp;
        } else {
            this.x = 0;
            this.y = 0;
            this.shakeStrength = 0;
        }
    }
}

export class SoundFX {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3;
        this.masterGain.connect(this.ctx.destination);
        this.initialized = false;
    }

    init() {
        if (!this.initialized) {
            this.ctx.resume().then(() => {
                this.initialized = true;
            });
        }
    }

    playTone(freq, type, duration, slideTo = null) {
        if (this.ctx.state === 'suspended') this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration) {
        if (this.ctx.state === 'suspended') this.init();
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
    }

    // --- PRESETS ---
    shoot() {
        this.playTone(800, 'square', 0.1, 100);
    } // "Pew"
    chargedShoot() {
        this.playTone(400, 'sawtooth', 0.4, 500);
    } // deep "Zap"
    charge() {
        this.playTone(200, 'sine', 0.1, 600);
    } // pitch up
    mineDrop() {
        this.playTone(600, 'sine', 0.1, 300);
    }
    explosion() {
        this.playNoise(0.4);
    } // "Kshhh"

    win() {
        [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.playTone(f, 'square', 0.2), i * 150));
    }

    powerup() {
        this.playTone(400, 'sine', 0.1);
        setTimeout(() => this.playTone(600, 'sine', 0.1), 100);
    }
    start() {
        this.playTone(440, 'triangle', 0.5, 880);
    }
    death() {
        const melody = [500, 400, 300, 200, 100, 50, 10];
        melody.forEach((freq, index) => {
            setTimeout(() => {
                this.playTone(freq, 'triangle', 0.1, freq - 50);
            }, index * 120);
        });
    }
    roundOver() {
        this.playTone(880, 'square', 0.15); // Beep
        setTimeout(() => this.playTone(440, 'square', 0.4), 200); // Boop (Longer)
    }
    shield() {
        this.playTone(100, 'sine', 0.25, 800);
    }
    niaNiaNia() {
        const melody = [880, 784, 880, 784, 880, 784, 880];
        melody.forEach((freq, index) => {
            setTimeout(() => {
                this.playTone(freq, 'triangle', 0.1, freq - 50);
            }, index * 120);
        });
    }
    boost() {
        // Start at 60Hz, slide to 100Hz, duration 0.1s
        // 'sawtooth' gives it a buzzy, mechanical feel

        this.playTone(60, 'sine', 0.9, 850);
    }
}

export class Cell {
    constructor(c, r) {
        this.c = c;
        this.r = r;
        this.walls = [true, true, true, true];
        this.visited = false;
        this.parent = null;
        this.bfsVisited = false;
    }
}

export class Player {
    constructor(id, color, controls) {
        this.id = id;
        this.name = `CPU`;
        this.color = color;
        this.controls = controls;
        this.size = 2.0;
        this.score = 0;
        this.goalC = 0;
        this.goalR = 0;
        this.lastDir = {
            x: id === 0 ? 1 : -1,
            y: 0
        };

        // AI Memory
        this.lastPos = {
            x: 0,
            y: 0
        };
        this.stuckCounter = 0;
        this.forceUnstuckTimer = 0;
        this.unstuckDir = {
            x: 0,
            y: 0
        };
        this.resetState();
    }

    resetState() {
        this.minesLeft = CONFIG.MAX_MINES;
        this.lastMineTime = 0;
        this.lastBoostTime = 0;
        this.trail = [];
        this.boostEnergy = 100;
        this.boostCooldown = 0;
        this.portalCooldown = 0;
        this.stunTime = 0;
        this.shieldActive = false;
        this.currentSpeed = CONFIG.BASE_SPEED;
        this.prevDetonateKey = false;
        this.beamPixels = [];
        this.beamIdx = 0;
        this.isCharging = false;
        this.chargeStartTime = 0;
        this.glitchTime = 0;
        this.chargeGrace = 0;
        this.botPath = [];
        this.botNextCell = null;
        this.botRetargetTimer = 0;
        this.stuckCounter = 0;
        this.forceUnstuckTimer = 0;
        this.isDead = false;
        this.ai = null;
    }
}
