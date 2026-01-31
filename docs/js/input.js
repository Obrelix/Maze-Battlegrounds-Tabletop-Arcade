import { CONFIG, TIMING } from './config.js';
import { getState, updateState } from './state.js';
import { initMaze } from './grid.js';
import { getNextRoundSeed, sendNextRound, getRestartGameSeed, sendRestartGame, sendPause } from './network.js';

export let lastInputTime = Date.now();

export function resetIdleTimer() {
    lastInputTime = Date.now();
    if (getState().isAttractMode) {
        updateState({
            isAttractMode: false,
            screen: 'MENU',
            menuSelection: 0,
            inputDelay: CONFIG.INPUT_DELAY,
            gameMode: 'SINGLE'
        });
    }
}

export function checkIdle() {
    return Date.now() - lastInputTime > TIMING.IDLE_THRESHOLD;
}

export function setupInputs(startGame, startMatchSetup) {

    window.addEventListener('keydown', (e) => {
        resetIdleTimer();
        const state = getState();
        if (state.sfx) state.sfx.init();
        let k = e.code;
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(k)) e.preventDefault();
        
        updateState(prevState => ({ keys: { ...prevState.keys, [k]: true } }));

        if (k === 'Escape') {
            if (getState().screen === 'PLAYING' && !getState().isGameOver && !getState().isRoundOver && !getState().isAttractMode) {
                updateState(prevState => ({ isPaused: !prevState.isPaused, pauseMenuSelection: 0 }));
                if (getState().gameMode === 'ONLINE') {
                    sendPause(getState().isPaused);
                }
            } else {
                updateState({ isPaused: false });
                updateState({ screen: 'MENU' });
                updateState({ menuSelection: 0 });
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                document.getElementById('statusText').innerText = "SELECT MODE";
            }
        }

        // Pause menu navigation
        if (getState().screen === 'PLAYING' && getState().isPaused && getState().inputDelay <= 0) {
            const maxOptions = getState().gameMode === 'ONLINE' ? 2 : 3;

            if (k === 'KeyW' || k === 'ArrowUp') {
                updateState(prevState => ({ pauseMenuSelection: (prevState.pauseMenuSelection - 1 + maxOptions) % maxOptions }));
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
            }
            if (k === 'KeyS' || k === 'ArrowDown') {
                updateState(prevState => ({ pauseMenuSelection: (prevState.pauseMenuSelection + 1) % maxOptions }));
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
            }
            if (k === 'Space' || k === 'Enter' || k === 'KeyF') {
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                const currentSelection = getState().pauseMenuSelection;
                if (getState().gameMode === 'ONLINE') {
                    // Online mode: 0=Resume, 1=Quit
                    if (currentSelection === 0) {
                        // Resume
                        updateState({ isPaused: false });
                        sendPause(false);
                    } else if (currentSelection === 1) {
                        // Quit
                        updateState({ isPaused: false });
                        updateState({ screen: 'MENU' });
                        updateState({ menuSelection: 0 });
                        document.getElementById('statusText').innerText = "SELECT MODE";
                    }
                } else {
                    // Local mode: 0=Resume, 1=Restart, 2=Quit
                    if (currentSelection === 0) {
                        // Resume
                        updateState({ isPaused: false });
                    } else if (currentSelection === 1) {
                        // Restart
                        updateState({ isPaused: false });
                        startGame();
                    } else if (currentSelection === 2) {
                        // Quit
                        updateState({ isPaused: false });
                        updateState({ screen: 'MENU' });
                        updateState({ menuSelection: 0 });
                        document.getElementById('statusText').innerText = "SELECT MODE";
                    }
                }
            }
        }

        if (getState().screen === 'PLAYING' && !getState().isPaused) {
            if (getState().isGameOver) {
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                // In online mode, use synchronized seed and notify other player
                if (getState().gameMode === 'ONLINE') {
                    if (!getState().onlineTransitionPending) {
                        updateState({ onlineTransitionPending: true });
                        sendRestartGame();
                        startGame(getRestartGameSeed());
                    }
                } else {
                    startGame(); // Full Reset
                }
            } else if (getState().isRoundOver) {
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                // In online mode, use synchronized seed and notify other player
                if (getState().gameMode === 'ONLINE') {
                    if (!getState().onlineTransitionPending) {
                        updateState({ onlineTransitionPending: true });
                        sendNextRound();
                        initMaze(getNextRoundSeed());
                    }
                } else {
                    // Note: keyboard uses initMaze directly since startNextRound is not available here
                    initMaze(); // Next Round (Keep Score)
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => updateState(prevState => ({ keys: { ...prevState.keys, [e.code]: false } })));

    initTouchControls(startGame, startMatchSetup);

}

export function pollGamepads(startGame, startMatchSetup, startNextRound = null) {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const state = getState();

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
        if (getState().screen === 'PLAYING' && !getState().isGameOver && !getState().isRoundOver && !getState().isAttractMode) {
            if (isStart && !gp._prevStart) {
                updateState(prevState => ({ isPaused: !prevState.isPaused, pauseMenuSelection: 0 }));
                if (getState().gameMode === 'ONLINE') {
                    sendPause(getState().isPaused);
                }
            }
        }
        gp._prevStart = isStart;

        // PAUSE MENU NAVIGATION (when paused)
        if (getState().screen === 'PLAYING' &&getState().isPaused && getState().inputDelay <= 0) {
            const maxOptions = getState().gameMode === 'ONLINE' ? 2 : 3;

            if (targetState.up && !gp._prevPauseNav) {
                updateState(prevState => ({ pauseMenuSelection: (prevState.pauseMenuSelection - 1 + maxOptions) % maxOptions }));
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                gp._prevPauseNav = true;
            } else if (targetState.down && !gp._prevPauseNav) {
                updateState(prevState => ({ pauseMenuSelection: (prevState.pauseMenuSelection + 1) % maxOptions }));
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                gp._prevPauseNav = true;
            } else if ((targetState.beam || isStart) && !gp._prevPauseNav) {
                // Select current option
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                if (getState().gameMode === 'ONLINE') {
                    if (getState().pauseMenuSelection === 0) {
                        updateState({ isPaused: false });
                        sendPause(false);
                    } else if (getState().pauseMenuSelection === 1) {
                        updateState({ isPaused: false });
                        updateState({ screen: 'MENU' });
                        updateState({ menuSelection: 0 });
                    }
                } else {
                    if (getState().pauseMenuSelection === 0) {
                        updateState({ isPaused: false });
                    } else if (getState().pauseMenuSelection === 1) {
                        updateState({ isPaused: false });
                        startGame();
                    } else if (getState().pauseMenuSelection === 2) {
                        updateState({ isPaused: false });
                        updateState({ screen: 'MENU' });
                        updateState({ menuSelection: 0 });
                    }
                }
                gp._prevPauseNav = true;
            } else if (!targetState.up && !targetState.down && !targetState.beam && !isStart) {
                gp._prevPauseNav = false;
            }
        }
        if (!state.isPaused) gp._prevPauseNav = false;

        // MENU -> START GAME
        if (getState().screen === 'MENU') {
            if (isAnyButton || targetState.up || targetState.down) {
                // If P2 presses a button, start MULTI, otherwise SINGLE
                updateState({ gameMode: (i === 1) ? 'MULTI' : 'SINGLE' });
                startMatchSetup();
                return gpState; // Exit early to prevent "holding" button issues
            }
        }

        // GAME OVER / ROUND OVER -> RESET
        if (!state.isPaused && (getState().isGameOver || state.isRoundOver)) {
            if (isStart || isSelect || targetState.shield) { // 'Shield' is often top button (Restart)
                // updateState({ inputDelay: CONFIG.INPUT_DELAY });
                if (getState().isGameOver) {
                    updateState({ inputDelay: CONFIG.INPUT_DELAY });
                    if (getState().gameMode === 'ONLINE') {
                        if (!getState().onlineTransitionPending) {
                            updateState({ onlineTransitionPending: true });
                            sendRestartGame();
                            startGame(getRestartGameSeed());
                        }
                    } else {
                        startGame();
                    }
                } else if (getState().gameMode === 'ONLINE') {
                    updateState({ inputDelay: CONFIG.INPUT_DELAY });
                    if (!getState().onlineTransitionPending) {
                        updateState({ onlineTransitionPending: true });
                        sendNextRound();
                        if (startNextRound) startNextRound(getNextRoundSeed());
                        else initMaze(getNextRoundSeed());
                    }
                } else {
                    updateState({ inputDelay: CONFIG.INPUT_DELAY });
                    if (startNextRound) startNextRound();
                    else initMaze();
                }
                return gpState;
            }
        }
    }

    if (activityDetected) resetIdleTimer();

    return gpState;
}

export function getHumanInput(playerIdx, controls) {
    const state = getState();
    const gp = (playerIdx === 0) ? getState()?.gpData?.p1 : getState()?.gpData?.p2;
    if (gp === undefined)
        return {
            up: false, down: false, left: false, right: false, shield: false, beam: false,
            mine: false, boost: false, boom: false, start: false
        };
    else
        return {
            up: state.keys[controls.up] || gp.up,
            down: state.keys[controls.down] || gp.down,
            left: state.keys[controls.left] || gp.left,
            right: state.keys[controls.right] || gp.right,
            shield: state.keys[controls.shield] || gp.shield,
            beam: state.keys[controls.beam] || gp.beam,
            mine: state.keys[controls.mine] || gp.mine,
            boost: state.keys[controls.boost] || gp.boost,
            boom: state.keys[controls.boom] || gp.boom,
            start: state.keys[controls.start] || gp.start
        };
}

function initTouchControls(startGame, startMatchSetup) {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        const code = btn.getAttribute('data-key');

        btn.addEventListener('touchstart', (e) => {
            resetIdleTimer();
            e.preventDefault();
            const state = getState();
            if (state.sfx) state.sfx.init();
            updateState(prevState => ({ keys: { ...prevState.keys, [code]: true } }));

            // Pause menu navigation (touch)
            if (getState().screen === 'PLAYING' &&getState().isPaused && getState().inputDelay <= 0) {
                const maxOptions = getState().gameMode === 'ONLINE' ? 2 : 3;

                if (code === 'KeyW') {
                    updateState(prevState => ({ pauseMenuSelection: (prevState.pauseMenuSelection - 1 + maxOptions) % maxOptions }));
                    updateState({ inputDelay: CONFIG.INPUT_DELAY });
                } else if (code === 'KeyS') {
                    updateState(prevState => ({ pauseMenuSelection: (prevState.pauseMenuSelection + 1) % maxOptions }));
                    updateState({ inputDelay: CONFIG.INPUT_DELAY });
                } else if (code === 'KeyF' || code === 'Space' || code === 'KeyStart') {
                    updateState({ inputDelay: CONFIG.INPUT_DELAY });
                    const currentSelection = getState().pauseMenuSelection;
                    if (getState().gameMode === 'ONLINE') {
                        if (currentSelection === 0) {
                            updateState({ isPaused: false });
                            sendPause(false);
                        } else if (currentSelection === 1) {
                            updateState({ isPaused: false });
                            updateState({ screen: 'MENU' });
                            updateState({ menuSelection: 0 });
                            document.getElementById('statusText').innerText = "SELECT MODE";
                        }
                    } else {
                        if (currentSelection === 0) {
                            updateState({ isPaused: false });
                        } else if (currentSelection === 1) {
                            updateState({ isPaused: false });
                            startGame();
                        } else if (currentSelection === 2) {
                            updateState({ isPaused: false });
                            updateState({ screen: 'MENU' });
                            updateState({ menuSelection: 0 });
                            document.getElementById('statusText').innerText = "SELECT MODE";
                        }
                    }
                }
                return; // Don't process other actions while in pause menu
            }

            if ((code === "KeyStart" || code === "KeySelect") && getState().screen === 'PLAYING' && !getState().isGameOver && !getState().isRoundOver && !getState().isAttractMode) {
                updateState(prevState => ({ isPaused: !prevState.isPaused, pauseMenuSelection: 0 }));
                if (getState().gameMode === 'ONLINE') {
                    sendPause(getState().isPaused);
                }
            } else if (code === "KeySelect") {
                updateState({ isPaused: false });
                updateState({ screen: 'MENU' });
                updateState({ menuSelection: 0 });
                updateState({ inputDelay: CONFIG.INPUT_DELAY });
                document.getElementById('statusText').innerText = "SELECT MODE";
            }

            if (!state.isPaused && (getState().isGameOver || state.isRoundOver)) {
                if (getState().isGameOver) {
                    if (getState().gameMode === 'ONLINE') {
                        if (!getState().onlineTransitionPending) {
                            updateState({ onlineTransitionPending: true });
                            sendRestartGame();
                            startGame(getRestartGameSeed());
                        }
                    } else {
                        startGame();
                    }
                } else if (getState().gameMode === 'ONLINE') {
                    if (!getState().onlineTransitionPending) {
                        updateState({ onlineTransitionPending: true });
                        sendNextRound();
                        initMaze(getNextRoundSeed());
                    }
                } else {
                    initMaze();
                }
            }
            // if (getState().screen === 'MENU' && code !== "KeySelect") {
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
            updateState(prevState => ({ keys: { ...prevState.keys, [code]: false } }));
        };

        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
    });

    initJoystick(startMatchSetup);
}

function initJoystick(startMatchSetup) {
    const joystickZone = document.getElementById('joystick-zone');
    if (joystickZone) {
        const manager = nipplejs.create({
            zone: joystickZone,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            catchDistance: 150,
            multitouch: true,
            color: 'white',
            size: 100,
            restJoystick: true,
            follow: true
        });

        // Track joystick state for safety resets
        let joystickTouchId = null;

        function resetMoveKeys() {
            updateState(prevState => ({
                keys: {
                    ...prevState.keys,
                    'KeyW': false,
                    'KeyS': false,
                    'KeyA': false,
                    'KeyD': false,
                }
            }));
            joystickTouchId = null;
        }

        manager.on('start', (evt, data) => {
            const state = getState();
            if (state.sfx) state.sfx.init();
            // Track the touch identifier for this joystick interaction
            if (data.identifier !== undefined) {
                joystickTouchId = data.identifier;
            }
        });

        manager.on('move', (evt, data) => {
            resetIdleTimer();

            const newKeys = { ...getState().keys };
            newKeys['KeyW'] = false;
            newKeys['KeyS'] = false;
            newKeys['KeyA'] = false;
            newKeys['KeyD'] = false;

            if (data.direction) {
                const dir = data.direction;
                if (dir.angle === 'up' || dir.y === 'up') newKeys['KeyW'] = true;
                if (dir.angle === 'down' || dir.y === 'down') newKeys['KeyS'] = true;
                if (dir.angle === 'left' || dir.x === 'left') newKeys['KeyA'] = true;
                if (dir.angle === 'right' || dir.x === 'right') newKeys['KeyD'] = true;

                if (getState().screen === 'MENU') { updateState({ gameMode: 'SINGLE' }); startMatchSetup(); }
            }
            updateState({ keys: newKeys });
        });

        manager.on('end', () => {
            resetMoveKeys();
        });

        // Safety: Also handle 'destroyed' event
        manager.on('destroyed', () => {
            resetMoveKeys();
        });

        // Safety: Reset on visibility change (tab switch, app switch, notification)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                resetMoveKeys();
            }
        });

        // Safety: Reset when window loses focus
        window.addEventListener('blur', () => {
            resetMoveKeys();
        });

        // Safety: Track touch events directly as backup
        // This catches cases where nipplejs fails to fire 'end'
        let activeTouches = new Set();

        joystickZone.addEventListener('touchstart', (e) => {
            for (const touch of e.changedTouches) {
                activeTouches.add(touch.identifier);
            }
        }, { passive: true });

        const handleTouchEnd = (e) => {
            for (const touch of e.changedTouches) {
                activeTouches.delete(touch.identifier);
            }
            // If no more touches on joystick zone, ensure keys are reset
            if (activeTouches.size === 0) {
                resetMoveKeys();
            }
        };

        joystickZone.addEventListener('touchend', handleTouchEnd, { passive: true });
        joystickZone.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        // Safety: Global touchend listener as final fallback
        // If all touches end anywhere, reset joystick
        document.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                // No more touches on screen at all
                activeTouches.clear();
                resetMoveKeys();
            }
        }, { passive: true });

        document.addEventListener('touchcancel', (e) => {
            if (e.touches.length === 0) {
                activeTouches.clear();
                resetMoveKeys();
            }
        }, { passive: true });

    }
}