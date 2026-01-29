import { CONFIG, TIMING, GAME } from './config.js';
import { STATE } from './state.js';
import { initMaze } from './grid.js';
import { getNextRoundSeed, sendNextRound, getRestartGameSeed, sendRestartGame } from './network.js';

export let lastInputTime = Date.now();

export function resetIdleTimer() {
    lastInputTime = Date.now();
    if (GAME.isAttractMode) {
        GAME.isAttractMode = false;
        GAME.screen = 'MENU';
        GAME.menuSelection = 0;
        GAME.inputDelay = CONFIG.INPUT_DELAY;
        GAME.gameMode = 'SINGLE';
    }
}

export function checkIdle() {
    return Date.now() - lastInputTime > TIMING.IDLE_THRESHOLD;
}

export function setupInputs(startGame, startMatchSetup) {

    window.addEventListener('keydown', (e) => {
        resetIdleTimer();
        if (STATE.sfx) STATE.sfx.init();
        let k = e.code;
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(k)) e.preventDefault();
        STATE.keys[k] = true;

        if (k === 'Escape') {
            if (GAME.screen === 'PLAYING' && !STATE.isGameOver && !STATE.isRoundOver && !GAME.isAttractMode) {
                STATE.isPaused = !STATE.isPaused;
            } else {
                STATE.isPaused = false;
                GAME.screen = 'MENU';
                GAME.menuSelection = 0;
                GAME.inputDelay = CONFIG.INPUT_DELAY;
                document.getElementById('statusText').innerText = "SELECT MODE";
            }
        }

        if (GAME.screen === 'PLAYING' && !STATE.isPaused) {
            if (STATE.isGameOver) {
                // In online mode, use synchronized seed and notify other player
                if (GAME.gameMode === 'ONLINE') {
                    sendRestartGame();
                    startGame(getRestartGameSeed());
                } else {
                    startGame(); // Full Reset
                }
            } else if (STATE.isRoundOver) {
                // In online mode, use synchronized seed and notify other player
                if (GAME.gameMode === 'ONLINE') {
                    sendNextRound();
                    initMaze(getNextRoundSeed());
                } else {
                    initMaze(); // Next Round (Keep Score)
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => STATE.keys[e.code] = false);

    initTouchControls(startGame, startMatchSetup);

}

export function pollGamepads(startGame, startMatchSetup) {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];

    // We will populate this "Input Snapshot" to merge with Keyboard later
    const gpState = {
        p1: { up: false, down: false, left: false, right: false, shield: false, beam: false, mine: false, boost: false, boom: false, start: false },
        p2: { up: false, down: false, left: false, right: false, shield: false, beam: false, mine: false, boost: false, boom: false, start: false }
    };

    let activityDetected = false;

    for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (!gp) continue;

        // 1. DETECT ACTIVITY (Reset Demo Timer)
        // Check axes (Stick movement)
        if (Math.abs(gp.axes[0]) > CONFIG.GAMEPAD_THRESH || Math.abs(gp.axes[1]) > CONFIG.GAMEPAD_THRESH) activityDetected = true;
        // Check buttons
        if (gp.buttons.some(b => b.pressed)) activityDetected = true;

        // 2. IDENTIFY PLAYER & MAPPING
        // If it's Gamepad 0, it controls P1. Gamepad 1 controls P2.
        let targetState = (i === 0) ? gpState.p1 : gpState.p2;

        // 3. READ INPUTS (Standard Mapping)
        // Axes (Analog Stick)
        if (gp.axes[1] < -CONFIG.GAMEPAD_THRESH) targetState.up = true;
        if (gp.axes[1] > CONFIG.GAMEPAD_THRESH) targetState.down = true;
        if (gp.axes[0] < -CONFIG.GAMEPAD_THRESH) targetState.left = true;
        if (gp.axes[0] > CONFIG.GAMEPAD_THRESH) targetState.right = true;

        // D-PAD (Standard Layout: 12=Up, 13=Down, 14=Left, 15=Right)
        if (gp.buttons[12]?.pressed) targetState.up = true;
        if (gp.buttons[13]?.pressed) targetState.down = true;
        if (gp.buttons[14]?.pressed) targetState.left = true;
        if (gp.buttons[15]?.pressed) targetState.right = true;

        // ACTION BUTTONS (SNES/Xbox Layout)
        if (gp.buttons[0]?.pressed) targetState.beam = true;   // B / A
        if (gp.buttons[1]?.pressed) targetState.boom = true;   // A / B
        if (gp.buttons[2]?.pressed) targetState.mine = true;   // Y / X
        if (gp.buttons[3]?.pressed) targetState.shield = true; // X / Y
        if (gp.buttons[4]?.pressed) targetState.shield = true;  // L1
        if (gp.buttons[5]?.pressed) targetState.boost = true;  // R1

        // 4. SYSTEM ACTIONS (The "InitTouchControls" Logic)
        // This makes the gamepad feel like a full citizen of the UI
        const isStart = gp.buttons[9]?.pressed;  // Start
        const isSelect = gp.buttons[8]?.pressed; // Select
        const isAnyButton = gp.buttons.some(b => b.pressed);

        // PAUSE TOGGLE (Start button, edge-detected)
        if (GAME.screen === 'PLAYING' && !STATE.isGameOver && !STATE.isRoundOver && !GAME.isAttractMode) {
            if (isStart && !gp._prevStart) {
                STATE.isPaused = !STATE.isPaused;
            }
        }
        gp._prevStart = isStart;

        // MENU -> START GAME
        if (GAME.screen === 'MENU') {
            if (isAnyButton || targetState.up || targetState.down) {
                // If P2 presses a button, start MULTI, otherwise SINGLE
                GAME.gameMode = (i === 1) ? 'MULTI' : 'SINGLE';
                startMatchSetup();
                return gpState; // Exit early to prevent "holding" button issues
            }
        }

        // GAME OVER / ROUND OVER -> RESET
        if (!STATE.isPaused && (STATE.isGameOver || STATE.isRoundOver)) {
            if (isStart || isSelect || targetState.shield) { // 'Shield' is often top button (Restart)
                if (STATE.isGameOver) {
                    if (GAME.gameMode === 'ONLINE') {
                        sendRestartGame();
                        startGame(getRestartGameSeed());
                    } else {
                        startGame();
                    }
                } else if (GAME.gameMode === 'ONLINE') {
                    sendNextRound();
                    initMaze(getNextRoundSeed());
                } else {
                    initMaze();
                }
                return gpState;
            }
        }
    }

    if (activityDetected) resetIdleTimer();

    return gpState;
}

export function getHumanInput(playerIdx, controls) {
    const gp = (playerIdx === 0) ? STATE?.gpData?.p1 : STATE?.gpData?.p2;
    if (gp === undefined)
        return {
            up: false, down: false, left: false, right: false, shield: false, beam: false,
            mine: false, boost: false, boom: false, start: false
        };
    else
        return {
            up: STATE.keys[controls.up] || gp.up,
            down: STATE.keys[controls.down] || gp.down,
            left: STATE.keys[controls.left] || gp.left,
            right: STATE.keys[controls.right] || gp.right,
            shield: STATE.keys[controls.shield] || gp.shield,
            beam: STATE.keys[controls.beam] || gp.beam,
            mine: STATE.keys[controls.mine] || gp.mine,
            boost: STATE.keys[controls.boost] || gp.boost,
            boom: STATE.keys[controls.boom] || gp.boom,
            start: STATE.keys[controls.start] || gp.start
        };
}

function initTouchControls(startGame, startMatchSetup) {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        const code = btn.getAttribute('data-key');

        btn.addEventListener('touchstart', (e) => {
            resetIdleTimer();
            e.preventDefault();
            if (STATE.sfx) STATE.sfx.init();
            STATE.keys[code] = true;
            if ((code === "KeyStart" || code === "KeySelect") && GAME.screen === 'PLAYING' && !STATE.isGameOver && !STATE.isRoundOver && !GAME.isAttractMode) 
                STATE.isPaused = !STATE.isPaused;
            else if (code === "KeySelect"){
                STATE.isPaused = false;
                GAME.screen = 'MENU';
                GAME.menuSelection = 0;
                GAME.inputDelay = CONFIG._INPUT_DELAY;
                document.getElementById('statusText').innerText = "SELECT MODE";
            }

            if (!STATE.isPaused && (STATE.isGameOver || STATE.isRoundOver)) {
                if (STATE.isGameOver) {
                    if (GAME.gameMode === 'ONLINE') {
                        sendRestartGame();
                        startGame(getRestartGameSeed());
                    } else {
                        startGame();
                    }
                } else if (GAME.gameMode === 'ONLINE') {
                    sendNextRound();
                    initMaze(getNextRoundSeed());
                } else {
                    initMaze();
                }
            }
            // if (GAME.screen === 'MENU' && code !== "KeySelect") {
            //     GAME.gameMode = 'SINGLE';
            //     startMatchSetup();
            // }
        }, { passive: false });

        const release = (e) => {
            e.preventDefault();
            // Only release if no remaining touches are on this button
            const touches = e.touches;
            for (let i = 0; i < touches.length; i++) {
                if (document.elementFromPoint(touches[i].clientX, touches[i].clientY) === btn) return;
            }
            STATE.keys[code] = false;
        };

        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
    });

    initJoystick(startMatchSetup);
}

function initJoystick(startMatchSetup) {
    const joystickZone = document.getElementById('joystick-zone');
    if (joystickZone !== undefined) {
        const manager = nipplejs.create({
            zone: joystickZone,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 85
        });

        function resetMoveKeys() {
            STATE.keys['KeyW'] = false;
            STATE.keys['KeyS'] = false;
            STATE.keys['KeyA'] = false;
            STATE.keys['KeyD'] = false;
        }

        manager.on('start', () => {
            if (STATE.sfx) STATE.sfx.init();
        });

        manager.on('move', (evt, data) => {
            resetIdleTimer();
            resetMoveKeys();
            if (data.direction) {
                const dir = data.direction;
                if (dir.angle === 'up' || dir.y === 'up') STATE.keys['KeyW'] = true;
                if (dir.angle === 'down' || dir.y === 'down') STATE.keys['KeyS'] = true;
                if (dir.angle === 'left' || dir.x === 'left') STATE.keys['KeyA'] = true;
                if (dir.angle === 'right' || dir.x === 'right') STATE.keys['KeyD'] = true;

                if (GAME.screen === 'MENU') { GAME.gameMode = 'SINGLE'; startMatchSetup(); }
            }
        });

        manager.on('end', (evt, data) => {
            resetMoveKeys();
        });

    }
}