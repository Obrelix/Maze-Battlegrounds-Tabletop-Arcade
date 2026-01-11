import { CONFIG, CONTROLS_P1, CONTROLS_P2, TAUNTS, BITMAP_FONT, DIGIT_MAP } from './config.js';
import { Camera, SoundFX, Cell, Player } from './classes.js';
const canvas = document.getElementById('ledMatrix');
const ctx = canvas.getContext('2d');
const bgCanvas = document.createElement('canvas');// OFFSCREEN BUFFER
const bgCtx = bgCanvas.getContext('2d');
let isBgRendered = false; // Flag to ensure we only draw it once
let lastInputTime = Date.now();
const STATE = {
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
};

/** * ==========================================
 * 1. GRID & PHYSICS HELPERS
 * ==========================================
 */
function gridIndex(c, r) {
    if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.ROWS) return undefined;
    return STATE.maze[c + r * CONFIG.COLS];
}

function removeWalls(a, b) {
    let x = a.c - b.c;
    if (x === 1) {
        a.walls[3] = false;
        b.walls[1] = false;
    }
    if (x === -1) {
        a.walls[1] = false;
        b.walls[3] = false;
    }
    let y = a.r - b.r;
    if (y === 1) {
        a.walls[0] = false;
        b.walls[2] = false;
    }
    if (y === -1) {
        a.walls[2] = false;
        b.walls[0] = false;
    }
}

function isWall(pixelX, pixelY) {
    if (pixelX < CONFIG.MAZE_OFFSET_X || pixelX >= CONFIG.LOGICAL_W - CONFIG.HUD_WIDTH) return true;
    if (pixelY < 0 || pixelY >= CONFIG.LOGICAL_H) return true;

    let mx = pixelX - CONFIG.MAZE_OFFSET_X;
    let cell = gridIndex(Math.floor(mx / CONFIG.CELL_SIZE), Math.floor(pixelY / CONFIG.CELL_SIZE));

    if (!cell) return true;

    let lx = Math.floor(mx) % CONFIG.CELL_SIZE;
    let ly = Math.floor(pixelY) % CONFIG.CELL_SIZE;

    if (lx === 0 && ly === 0) return true;
    if (ly === 0 && cell.walls[0]) return true;
    if (lx === 0 && cell.walls[3]) return true;
    return false;
}

function checkPlayerCollision(p, dx, dy) {
    let nx = p.x + dx;
    let ny = p.y + dy;
    let hitbox = 0.8;
    let pad = 0.6;
    return (
        isWall(nx + pad, ny + pad) ||
        isWall(nx + pad + hitbox, ny + pad) ||
        isWall(nx + pad, ny + pad + hitbox) ||
        isWall(nx + pad + hitbox, ny + pad + hitbox)
    );
}

function destroyWallAt(c, r) {
    // FIX: Removed the restrictive line that returned early for edge cells
    let cell = gridIndex(c, r);
    if (!cell) return;

    // 1. Destroy TOP wall (Index 0) - ONLY if not the absolute map top border
    if (r > 0) {
        cell.walls[0] = false;
        let top = gridIndex(c, r - 1);
        if (top) top.walls[2] = false;
    }

    // 2. Destroy RIGHT wall (Index 1) - ONLY if not the absolute map right border
    if (c < CONFIG.COLS - 1) {
        cell.walls[1] = false;
        let right = gridIndex(c + 1, r);
        if (right) right.walls[3] = false;
    }

    // 3. Destroy BOTTOM wall (Index 2) - ONLY if not the absolute map bottom border
    if (r < CONFIG.ROWS - 1) {
        cell.walls[2] = false;
        let bottom = gridIndex(c, r + 1);
        if (bottom) bottom.walls[0] = false;
    }

    // 4. Destroy LEFT wall (Index 3) - ONLY if not the absolute map left border
    if (c > 0) {
        cell.walls[3] = false;
        let left = gridIndex(c - 1, r);
        if (left) left.walls[1] = false;
    }
}
/** * ==========================================
 * 2. GAME FLOW & GENERATION
 * ==========================================
 */
function initMaze() {
    STATE.maze = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS; c++) {
            STATE.maze.push(new Cell(c, r));
        }
    }

    let stack = [];
    let current = STATE.maze[0];
    current.visited = true;

    while (true) {
        let neighbors = [];
        let top = gridIndex(current.c, current.r - 1);
        let right = gridIndex(current.c + 1, current.r);
        let bottom = gridIndex(current.c, current.r + 1);
        let left = gridIndex(current.c - 1, current.r);

        if (top && !top.visited) neighbors.push(top);
        if (right && !right.visited) neighbors.push(right);
        if (bottom && !bottom.visited) neighbors.push(bottom);
        if (left && !left.visited) neighbors.push(left);

        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            next.visited = true;
            stack.push(current);
            removeWalls(current, next);
            current = next;
        } else if (stack.length > 0) {
            current = stack.pop();
        } else {
            break;
        }
    }
    resetRoundEntities();
}

function resetRoundEntities() {
    STATE.players[0].x = CONFIG.MAZE_OFFSET_X + 1;
    STATE.players[0].y = 1;
    STATE.players[0].goalC = CONFIG.COLS - 1;
    STATE.players[0].goalR = CONFIG.ROWS - 1;
    STATE.players[0].resetState();

    let endX = CONFIG.MAZE_OFFSET_X + ((CONFIG.COLS - 1) * CONFIG.CELL_SIZE) + 1;
    let endY = ((CONFIG.ROWS - 1) * CONFIG.CELL_SIZE) + 1;
    STATE.players[1].x = endX;
    STATE.players[1].y = endY;
    STATE.players[1].goalC = 0;
    STATE.players[1].goalR = 0;
    STATE.players[1].resetState();

    STATE.mines = [];
    STATE.particles = [];
    STATE.projectiles = [];

    STATE.portals = [];
    let attempts = 0;
    while (STATE.portals.length < 2 && attempts < 100) {
        attempts++;
        let c = Math.floor(Math.random() * (CONFIG.COLS - 2)) + 1;
        let r = Math.floor(Math.random() * (CONFIG.ROWS - 2)) + 1;
        if ((c < 5 && r < 5) || (c > CONFIG.COLS - 5 && r > CONFIG.ROWS - 5)) continue;
        let tooClose = false;
        for (let p of STATE.portals) {
            if (Math.abs(p.c - c) + Math.abs(p.r - r) < 10) tooClose = true;
        }
        if (tooClose) continue;
        STATE.portals.push({
            c: c,
            r: r,
            x: CONFIG.MAZE_OFFSET_X + c * CONFIG.CELL_SIZE + 1.5,
            y: r * CONFIG.CELL_SIZE + 1.5,
            color: STATE.portals.length === 0 ? '#ffaa00' : '#00aaff'
        });
    }
    if (STATE.portals.length < 2) {
        STATE.portals = [{
            c: 10,
            r: 10,
            x: CONFIG.MAZE_OFFSET_X + 10 * CONFIG.CELL_SIZE + 1.5,
            y: 10 * CONFIG.CELL_SIZE + 1.5,
            color: '#ffaa00'
        },
        {
            c: 20,
            r: 10,
            x: CONFIG.MAZE_OFFSET_X + 20 * CONFIG.CELL_SIZE + 1.5,
            y: 10 * CONFIG.CELL_SIZE + 1.5,
            color: '#00aaff'
        }
        ];
    }

    STATE.ammoCrate = null;
    spawnAmmoCrate();
    calculateGameTime();
    STATE.isRoundOver = false;
}

function spawnAmmoCrate() {
    let c = Math.floor(Math.random() * (CONFIG.COLS - 2)) + 1;
    let r = Math.floor(Math.random() * (CONFIG.ROWS - 2)) + 1;
    STATE.ammoCrate = {
        x: CONFIG.MAZE_OFFSET_X + c * CONFIG.CELL_SIZE + 0.5,
        y: r * CONFIG.CELL_SIZE + 0.5,
        c: c,
        r: r
    };
}

function calculateGameTime() {
    let start = gridIndex(0, 0);
    let end = gridIndex(CONFIG.COLS - 1, CONFIG.ROWS - 1);
    STATE.maze.forEach(c => {
        c.bfsVisited = false;
        c.parent = null;
    });

    let q = [start];
    start.bfsVisited = true;
    let len = 0;

    while (q.length > 0) {
        let curr = q.shift();
        if (curr === end) {
            while (curr.parent) {
                len++;
                curr = curr.parent;
            }
            break;
        }
        [
            [0, -1, 0],
            [1, 0, 1],
            [0, 1, 2],
            [-1, 0, 3]
        ].forEach(d => {
            let n = gridIndex(curr.c + d[0], curr.r + d[1]);
            if (n && !n.bfsVisited && !curr.walls[d[2]]) {
                n.bfsVisited = true;
                n.parent = curr;
                q.push(n);
            }
        });
    }
    STATE.gameTime = Math.floor((len * CONFIG.CELL_SIZE / ((CONFIG.BASE_SPEED + CONFIG.MAX_SPEED) / 2)) * 6);
    STATE.maxGameTime = STATE.gameTime;
}

/** * ==========================================
 * 3. INPUT & AI LOGIC
 * ==========================================
 */
function resetIdleTimer() {
    lastInputTime = Date.now();

    // If we are in Demo Mode and someone touches a button, QUIT immediately
    if (STATE.isAttractMode) {
        STATE.isAttractMode = false;
        STATE.screen = 'MENU';
        STATE.gameMode = 'SINGLE';
        // Reset brightness or other arcade specific hardware flags here later
        document.getElementById('statusText').innerText = "SELECT MODE";
    }
}

function initTouchControls() {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.addEventListener('touchstart', (e) => {
            resetIdleTimer();
            e.preventDefault();
            if (STATE.sfx) STATE.sfx.init();
            const code = btn.getAttribute('data-key');
            STATE.keys[code] = true;

            if ((STATE.isGameOver || STATE.isRoundOver) && (code === 'KeyR' || code === 'KeyStart' || code === 'KeySelect')) {
                if (STATE.isGameOver) startGame(); else initMaze();
            }
            if (STATE.screen === 'MENU') { STATE.gameMode = 'SINGLE'; startGame(); }
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            const code = btn.getAttribute('data-key');
            STATE.keys[code] = false;
        }, { passive: false });
    });

    // if (window.innerWidth > 1024) return; 

    const joystickZone = document.getElementById('joystick-zone');

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

            if (STATE.screen === 'MENU') { STATE.gameMode = 'SINGLE'; startGame(); }
        }
    });

    manager.on('end', (evt, data) => {
        resetMoveKeys();
    });
}
/** * ==========================================
 * NATIVE GAMEPAD POLLING 
 * ==========================================
 */
/** * ==========================================
 * NATIVE GAMEPAD POLLING (Refactored)
 * ==========================================
 */
function pollGamepads() {
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

        // MENU -> START GAME
        if (STATE.screen === 'MENU') {
            if (isAnyButton || targetState.up || targetState.down) {
                // If P2 presses a button, start MULTI, otherwise SINGLE
                STATE.gameMode = (i === 1) ? 'MULTI' : 'SINGLE';
                startGame();
                return gpState; // Exit early to prevent "holding" button issues
            }
        }

        // GAME OVER / ROUND OVER -> RESET
        if (STATE.isGameOver || STATE.isRoundOver) {
            if (isStart || isSelect || targetState.shield) { // 'Shield' is often top button (Restart)
                if (STATE.isGameOver) startGame();
                else initMaze();
                return gpState;
            }
        }
    }

    if (activityDetected) resetIdleTimer();

    return gpState;
}

function getHumanInput(playerIdx, controls) {
    const gp = (playerIdx === 0) ? STATE.gpData.p1 : STATE.gpData.p2;

    // 2. Merge Keyboard (STATE.keys) + Gamepad (gp)
    // This allows you to use BOTH simultaneously without conflict
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

function findPath(cpu, targetC, targetR, ignoreMines) {
    let start = gridIndex(Math.floor((cpu.x - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE), Math.floor(cpu.y / CONFIG.CELL_SIZE));
    let end = gridIndex(targetC, targetR);
    if (!start || !end) return null;

    STATE.maze.forEach(c => {
        c.bfsVisited = false;
        c.parent = null;
    });
    let q = [start];
    start.bfsVisited = true;
    let found = false;

    while (q.length > 0) {
        let curr = q.shift();
        if (curr === end) {
            found = true;
            break;
        }

        [
            [0, -1, 0],
            [1, 0, 1],
            [0, 1, 2],
            [-1, 0, 3]
        ].forEach(d => {
            let n = gridIndex(curr.c + d[0], curr.r + d[1]);
            let isSafe = true;
            if (n && !ignoreMines) {
                let mx = CONFIG.MAZE_OFFSET_X + n.c * CONFIG.CELL_SIZE + 1.5;
                let my = n.r * CONFIG.CELL_SIZE + 1.5;
                if (STATE.mines.some(m => m.active && Math.abs(m.x - mx) < 3 && Math.abs(m.y - my) < 3)) {
                    isSafe = false;
                }
            }
            if (n && !n.bfsVisited && !curr.walls[d[2]] && isSafe) {
                n.bfsVisited = true;
                n.parent = curr;
                q.push(n);
            }
        });
    }

    if (found) {
        let path = [];
        let t = end;
        while (t) {
            path.push(t);
            t = t.parent;
        }
        path.reverse();
        return path;
    }
    return null;
}

function getCpuInput(cpu, opponent) {
    // --- 0. INIT MEMORY (Simplified) ---
    if (!cpu.ai) {
        cpu.ai = {
            mode: 'ATTACK', // ATTACK or FLEE
            modeTimer: 0,
            chargeTimer: 0
        };
    }

    let cmd = {
        up: false, down: false, left: false, right: false,
        shield: false, beam: false, mine: false, boost: false, boom: false
    };

    let distOpp = Math.hypot(opponent.x - cpu.x, opponent.y - cpu.y);
    let myHealth = cpu.boostEnergy;

    // =============================================
    // 1. REFLEXES (Always Active)
    // =============================================

    // A. Shielding (Only if projectile is VERY close and lethal)
    STATE.projectiles.forEach(proj => {
        if (proj.owner !== cpu.id) {
            let d = Math.hypot(cpu.x - proj.x, cpu.y - proj.y);
            // Simple check: Is it close and are we low on health or stuck?
            if (d < 20 && cpu.boostEnergy > 15) {
                // Vector dot product to see if it's moving towards us
                let dot = (proj.vx * (cpu.x - proj.x)) + (proj.vy * (cpu.y - proj.y));
                if (dot > 0) cmd.shield = true;
            }
        }
    });

    // B. Mine Avoidance
    if (!cmd.shield) {
        let nearMine = STATE.mines.some(m => m.active && Math.abs(m.x - cpu.x) < 3 && Math.abs(m.y - cpu.y) < 3);
        if (nearMine && cpu.boostEnergy > 10) cmd.shield = true;
    }

    // =============================================
    // 2. STRATEGY (Update Mode occasionally)
    // =============================================
    cpu.ai.modeTimer--;
    if (cpu.ai.modeTimer <= 0) {
        cpu.ai.modeTimer = 30; // Re-evaluate every 0.5s

        // Simple Logic: Flee if low health, otherwise Hunt
        if (myHealth < 25 && opponent.boostEnergy > 40) cpu.ai.mode = 'FLEE';
        else cpu.ai.mode = 'ATTACK';

        // Reset Charge if we were charging but lost target
        if (cpu.isCharging && distOpp < 15) cpu.ai.chargeTimer = 0;
    }

    // =============================================
    // 3. COMBAT (Shooting)
    // =============================================

    // A. CHARGED SHOT LOGIC
    // Condition: Long range, lots of energy, and roughly aligned
    let dx = opponent.x - cpu.x;
    let dy = opponent.y - cpu.y;
    let isAligned = Math.abs(dx) < 8 || Math.abs(dy) < 8; // Roughly in same row/col

    if (cpu.isCharging) {
        // We are already charging, HOLD THE BUTTON
        cmd.beam = true;

        // Cancel if threatened
        if (distOpp < 12 || cpu.stunTime > 0) {
            cmd.beam = false; // Release to move faster
        }
    } else {
        // Start Charging?
        if (cpu.boostEnergy > 90 && distOpp > 25 && isAligned && Math.random() < 0.05) {
            cmd.beam = true; // Start the charge
        }
        // Standard Shot?
        else if (!cmd.shield && cpu.boostEnergy > 30 && distOpp < 35) {
            // PREDICTIVE AIM: Aim where they are GOING
            let lead = 5.0;
            let pX = opponent.x + (opponent.lastDir.x * lead);
            let pY = opponent.y + (opponent.lastDir.y * lead);
            let aimDx = pX - cpu.x;
            let aimDy = pY - cpu.y;

            // Fire if aligned with predicted position
            if (Math.abs(aimDx) < 20 && Math.abs(aimDy) < 4) cmd.beam = true;
            else if (Math.abs(aimDy) < 20 && Math.abs(aimDx) < 4) cmd.beam = true;
        }
    }

    // =============================================
    // 4. MOVEMENT (Frame-by-Frame Precision)
    // =============================================
    // Reverted to standard pathfinding to prevent getting stuck

    // Determine Goal
    let targetC, targetR;
    if (cpu.ai.mode === 'FLEE') {
        // Go to Ammo if it exists, otherwise corners
        if (STATE.ammoCrate) {
            targetC = STATE.ammoCrate.c;
            targetR = STATE.ammoCrate.r;
        } else {
            // Run away from opponent
            targetC = (opponent.c < CONFIG.COLS / 2) ? CONFIG.COLS - 1 : 0;
            targetR = (opponent.r < CONFIG.ROWS / 2) ? CONFIG.ROWS - 1 : 0;
        }
        // Drop mines while fleeing
        if (cpu.minesLeft > 0 && distOpp < 15 && Math.random() < 0.1) cmd.mine = true;
    } else {
        // ATTACK MODE: Go to opponent
        targetC = (opponent.x - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE;
        targetR = opponent.y / CONFIG.CELL_SIZE;
        // Clamp to integer grid
        targetC = Math.floor(Math.max(0, Math.min(CONFIG.COLS - 1, targetC)));
        targetR = Math.floor(Math.max(0, Math.min(CONFIG.ROWS - 1, targetR)));
    }

    // Calculate Path (Every few frames to save CPU, but execute movement every frame)
    if (!cpu.botNextCell || cpu.botRetargetTimer <= 0) {
        // Try safe path first
        let path = findPath(cpu, targetC, targetR, false);
        // If no safe path (stuck by mines), force path through mines
        if (!path) path = findPath(cpu, targetC, targetR, true);

        if (path && path.length > 0) {
            // Target the next cell in the chain
            cpu.botNextCell = path.length > 1 ? path[1] : path[0];
        } else {
            cpu.botNextCell = null;
        }
        cpu.botRetargetTimer = 6; // Fast updates (100ms)
    }
    cpu.botRetargetTimer--;

    // Execute Movement to Next Cell
    if (cpu.botNextCell) {
        let tx = CONFIG.MAZE_OFFSET_X + cpu.botNextCell.c * CONFIG.CELL_SIZE + 0.5;
        let ty = cpu.botNextCell.r * CONFIG.CELL_SIZE + 0.5;

        let diffX = tx - cpu.x;
        let diffY = ty - cpu.y;

        // Precise Movement (No Jiggle)
        if (Math.abs(diffX) > 0.15) { if (diffX < 0) cmd.left = true; else cmd.right = true; }
        if (Math.abs(diffY) > 0.15) { if (diffY < 0) cmd.up = true; else cmd.down = true; }
    }

    // Unstuck Logic (Keep this, it's vital)
    let distMoved = Math.hypot(cpu.x - cpu.lastPos.x, cpu.y - cpu.lastPos.y);
    if (distMoved < 0.1) cpu.stuckCounter++; else cpu.stuckCounter = 0;
    cpu.lastPos = { x: cpu.x, y: cpu.y };

    if (cpu.stuckCounter > 20) {
        cpu.forceUnstuckTimer = 15;
        cpu.stuckCounter = 0;
        let dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
        let validDirs = dirs.filter(d => !isWall(cpu.x + d.x * 2, cpu.y + d.y * 2));
        cpu.unstuckDir = validDirs.length > 0 ? validDirs[Math.floor(Math.random() * validDirs.length)] : dirs[0];
    }
    if (cpu.forceUnstuckTimer > 0) {
        cpu.forceUnstuckTimer--;
        if (cpu.unstuckDir.y < 0) cmd.up = true;
        if (cpu.unstuckDir.y > 0) cmd.down = true;
        if (cpu.unstuckDir.x < 0) cmd.left = true;
        if (cpu.unstuckDir.x > 0) cmd.right = true;
    }

    // Detonate Mines
    STATE.mines.forEach(m => {
        if (m.owner === cpu.id && Math.hypot(m.x - opponent.x, m.y - opponent.y) < 5) cmd.boom = true;
    });

    return cmd;
}
/** * ==========================================
 * 4. CORE GAME LOOP & PHYSICS
 * ==========================================
 */

function applyPlayerActions(p, input) {
    let now = Date.now();

    // Detonate
    if (input.boom && !p.prevDetonateKey) {
        if (p.boostEnergy >= CONFIG.DETONATE_COST) {
            let minesFound = false;
            for (let i = STATE.mines.length - 1; i >= 0; i--) {
                if (STATE.mines[i].owner === p.id) {
                    triggerExplosion(STATE.mines[i].x, STATE.mines[i].y, "WAS FRAGGED");
                    STATE.mines.splice(i, 1);
                    minesFound = true;
                }
            }
            if (minesFound) p.boostEnergy -= CONFIG.DETONATE_COST;
        }
    }
    p.prevDetonateKey = input.boom;

    // Shield
    if (input.shield && p.boostEnergy > 0) {
        if (!p.shieldActive) {
            p.boostEnergy -= CONFIG.SHIELD_ACTIVATION_COST;
        }
        if (p.boostEnergy >= 0 && !p.shieldActive) {
            STATE.sfx.shield();
            p.shieldActive = true;
        }
        p.boostEnergy -= CONFIG.SHIELD_DRAIN;

        // Clamp to 0 so we don't go negative
        if (p.boostEnergy < 0) p.boostEnergy = 0;
    } else {
        p.shieldActive = false;
    }

    // Beam
    if (input.beam) {
        p.chargeGrace = 0;
        if (!p.isCharging) {
            p.isCharging = true;
            p.chargeStartTime = now;
        }
        if (now - p.chargeStartTime > CONFIG.CHARGE_TIME) {
            fireChargedBeam(p);
            p.isCharging = false;
            p.chargeStartTime = 0;
        } else if (p.isCharging && Math.floor(now / 100) % 5 === 0) {
            STATE.sfx.charge();
        }
    } else {
        if (p.isCharging) {
            p.chargeGrace++;
            if (now - p.chargeStartTime < CONFIG.CHARGE_TIME) fireBeam(p);
            p.isCharging = false;
        }
        // Reset
        p.isCharging = false;
        p.chargeStartTime = 0;
        p.chargeGrace = 0;
    }

    // Movement
    let speed = CONFIG.BASE_SPEED;
    if (p.stunTime > 0) {
        speed = CONFIG.BASE_SPEED * 0.8;
        if (!input.boost && !p.shieldActive) p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
    } else if (p.isCharging) {
        speed = CONFIG.BASE_SPEED * CONFIG.CHARGE_PENALTY;
        p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
    } else {
        if (p.boostCooldown > 0) {
            p.boostCooldown--;
            if (!p.shieldActive) p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
        } else if (input.boost && p.boostEnergy > 0) {
            p.boostEnergy -= CONFIG.BOOST_DRAIN;
            speed = CONFIG.MAX_SPEED;
            if (p.boostEnergy <= 0) p.boostEnergy = 0;

            // Play sound every 100ms (prevents stuttering)
            if (now - p.lastBoostTime > 600) {
                p.lastBoostTime = now;
                STATE.sfx.boost();
            }
            if (Math.random() < 0.4) { // 40% chance per frame
                STATE.particles.push({
                    x: p.x + 1, // Center of player
                    y: p.y + 1,
                    // Velocity: Shoot opposite to player movement
                    vx: -(p.lastDir.x * (Math.random() * 0.5 + 0.2)),
                    vy: -(p.lastDir.y * (Math.random() * 0.5 + 0.2)),
                    life: 0.4, // Short life
                    decay: 0.08,
                    color: '#ffffff' // White hot sparks
                });
            }
        } else {
            if (p.boostEnergy <= 0) p.boostCooldown = CONFIG.BOOST_COOLDOWN_FRAMES;
            else if (!p.shieldActive) p.boostEnergy = Math.min(100, p.boostEnergy + CONFIG.BOOST_REGEN);
        }
    }
    p.currentSpeed = speed;

    let dx = 0,
        dy = 0;
    if (input.up) dy = -speed;
    if (input.down) dy = speed;
    if (input.left) dx = -speed;
    if (input.right) dx = speed;

    if (p.glitchTime > 0) {
        dx = -dx;
        dy = -dy;
    }

    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        if (Math.abs(dx) > Math.abs(dy)) p.lastDir = {
            x: dx > 0 ? 1 : -1,
            y: 0
        };
        else p.lastDir = {
            x: 0,
            y: dy > 0 ? 1 : -1
        };
    }

    let dist = Math.hypot(dx, dy);
    let steps = Math.ceil(dist / 0.5);
    let sx = dx / steps;
    let sy = dy / steps;

    // --- CORNER ASSIST CONSTANTS ---
    // How far to "look ahead" for an open space (approx 1/3 of player size)
    const ASSIST_OFFSET = 0.6;
    // How fast to push the player into alignment (smoothness)
    const NUDGE_SPEED = 0.15;

    for (let i = 0; i < steps; i++) {
        // ----------------------
        // X-AXIS MOVEMENT
        // ----------------------
        if (sx !== 0) {
            if (!checkPlayerCollision(p, sx, 0)) {
                // Path is clear, move normally
                p.x += sx;
            } else {
                // BLOCKED! Check for a corner to slide around.
                // We "look" slightly Up and Down to see if the path is clear there.

                // Check UP (Negative Y)
                // If we shifted the player UP by ASSIST_OFFSET, could they move?
                if (!checkPlayerCollision(p, sx, -ASSIST_OFFSET)) {
                    p.y -= NUDGE_SPEED; // Yes! Nudge them Up
                }
                // Check DOWN (Positive Y)
                else if (!checkPlayerCollision(p, sx, ASSIST_OFFSET)) {
                    p.y += NUDGE_SPEED; // Yes! Nudge them Down
                }
            }
        }

        // ----------------------
        // Y-AXIS MOVEMENT
        // ----------------------
        if (sy !== 0) {
            if (!checkPlayerCollision(p, 0, sy)) {
                // Path is clear, move normally
                p.y += sy;
            } else {
                // BLOCKED! Check for a corner.

                // Check LEFT (Negative X)
                if (!checkPlayerCollision(p, -ASSIST_OFFSET, sy)) {
                    p.x -= NUDGE_SPEED; // Nudge Left
                }
                // Check RIGHT (Positive X)
                else if (!checkPlayerCollision(p, ASSIST_OFFSET, sy)) {
                    p.x += NUDGE_SPEED; // Nudge Right
                }
            }
        }
    }

    // Mine Drop
    if (input.mine && p.minesLeft > 0 && now - p.lastMineTime > CONFIG.MINE_COOLDOWN) {
        STATE.sfx.mineDrop();
        p.lastMineTime = now;
        p.minesLeft--;
        STATE.mines.push({
            x: Math.floor(p.x),
            y: Math.floor(p.y),
            droppedAt: now,
            active: false,
            visX: Math.floor(Math.random() * 2),
            visY: Math.floor(Math.random() * 2),
            owner: p.id
        });
    }

    // Goal
    let gx = CONFIG.MAZE_OFFSET_X + (p.goalC * CONFIG.CELL_SIZE) + 1;
    let gy = (p.goalR * CONFIG.CELL_SIZE) + 1;
    if (Math.abs(p.x - gx) < 1.0 && Math.abs(p.y - gy) < 1.0) {
        p.score += 1;
        if (p.score >= CONFIG.MAX_SCORE) {
            STATE.isGameOver = true;
            STATE.looser = (p.id + 1 == 1) ? 2 : 1;
            STATE.messages.win = `PLAYER ${p.id + 1} WINS!`;
            STATE.messages.taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
            STATE.messages.winColor = p.color;
            STATE.scrollX = CONFIG.LOGICAL_W + 5;
        } else {
            STATE.isRoundOver = true;
            STATE.messages.round = `PLAYER ${p.id + 1} SCORES!`;
            STATE.messages.roundColor = p.color;
            STATE.scrollX = CONFIG.LOGICAL_W + 5;
        }
        if (STATE.isAttractMode) STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER;
    }
}

function triggerExplosion(x, y, reason = "EXPLODED") {
    STATE.sfx.explosion();
    STATE.camera.shake(15);
    const BLAST_RADIUS = 4.0;
    let centerC = Math.floor((x - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
    let centerR = Math.floor(y / CONFIG.CELL_SIZE);
    let cellRadius = 1;

    // --- Wall Destruction Logic ---
    for (let r = centerR - cellRadius; r <= centerR + cellRadius; r++) {
        for (let c = centerC - cellRadius; c <= centerC + cellRadius; c++) {
            if (c < 0 || c >= CONFIG.COLS || r < 0 || r >= CONFIG.ROWS) continue;
            let dc = c - centerC;
            let dr = r - centerR;
            if (dc * dc + dr * dr <= 2) {
                destroyWallAt(c, r);
            }
        }
    }

    // --- Particle Spawning ---
    const PARTICLE_COUNT = 30;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 3.5;
        STATE.particles.push({
            x: x + 1,
            y: y + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            decay: 0.03 + Math.random() * 0.04,
            life: 1.0,
            color: '#ffffff'
        });
    }

    // --- Player Damage Logic (FIXED) ---
    // 1. Collect all victims first
    let hitIndices = [];
    if (!STATE.isRoundOver && !STATE.isGameOver) {
        STATE.players.forEach((p, idx) => {
            if (Math.abs(p.x + 1 - (x + 1)) < BLAST_RADIUS && Math.abs(p.y + 1 - (y + 1)) < BLAST_RADIUS) {
                if (!p.shieldActive && !p.isDead) {
                    hitIndices.push(idx);
                }
            }
        });
    }

    // 2. Process deaths if anyone was hit
    if (hitIndices.length > 0) {
        handleMultiDeath(hitIndices, reason);
    }
}

function handleMultiDeath(indices, reason) {
    if (STATE.isGameOver || STATE.isRoundOver || STATE.deathTimer > 0) return;

    // Set global death state
    STATE.deathTimer = 50;
    STATE.deathReason = reason || "ELIMINATED";
    STATE.sfx.death();

    // Check for Draw
    if (indices.length > 1) {
        STATE.isDraw = true; // Mark as draw
    } else {
        STATE.victimIdx = indices[0]; // Mark single victim
        STATE.isDraw = false;
    }

    // Apply death effects to ALL victims
    indices.forEach(idx => {
        let p = STATE.players[idx];
        p.isDead = true;

        // Visual effects for each player
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
    });
}

function handlePlayerDeath(victimIdx, reason) {
    if (STATE.isGameOver || STATE.isRoundOver || STATE.deathTimer > 0) return;

    // 1. Mark player as dead
    STATE.players[victimIdx].isDead = true;
    STATE.victimIdx = victimIdx;
    // 2. Store the reason in the global state (add this property implicitly)
    STATE.deathReason = reason || "ELIMINATED BY A SNEAKY BUG";
    // 3. Start the Death Timer 
    STATE.deathTimer = 50;

    // 4. Extra visual effects
    let p = STATE.players[victimIdx];
    STATE.sfx.death();

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

function fireChargedBeam(p) {
    if (p.boostEnergy < CONFIG.CHARGED_BEAM_COST) return;

    // 1. Identify Opponent
    let opponent = STATE.players[(p.id + 1) % 2];

    // 2. Calculate Vector to Opponent (Center to Center)
    let startX = p.x + (p.size / 2);
    let startY = p.y + (p.size / 2);

    let targetX = opponent.x + (opponent.size / 2);
    let targetY = opponent.y + (opponent.size / 2);

    let dx = targetX - startX;
    let dy = targetY - startY;
    let dist = Math.hypot(dx, dy);

    // 3. Normalize & Scale by C_BEAM_SPEED
    // Prevent division by zero if players are overlapping
    if (dist < 0.1) { dx = 1; dy = 0; dist = 1; }

    let vx = (dx / dist) * CONFIG.C_BEAM_SPEED;
    let vy = (dy / dist) * CONFIG.C_BEAM_SPEED;

    // 4. Fire!
    p.boostEnergy -= CONFIG.CHARGED_BEAM_COST;
    STATE.sfx.chargedShoot();

    STATE.projectiles.push({
        x: startX,
        y: startY,
        vx: vx,  // Now moving towards enemy
        vy: vy,
        distTraveled: 0,
        owner: p.id,
        color: p.color
    });

    // Recoil / Kickback (Optional: pushes player back slightly)
    // p.x -= vx * 2;
    // p.y -= vy * 2;

    for (let i = 0; i < 10; i++) {
        STATE.particles.push({
            x: startX,
            y: startY,
            vx: (Math.random() - 0.5),
            vy: (Math.random() - 0.5),
            life: 0.8,
            color: '#fff'
        });
    }
}

function fireBeam(p) {
    if (p.boostEnergy < CONFIG.BEAM_ENERGY_COST) return;
    if (p.beamIdx < p.beamPixels.length) return;
    let opponent = STATE.players[(p.id + 1) % 2];

    // 2. Calculate Opponent's Grid Coordinates
    // We target the center of the opponent for accuracy
    let targetC = Math.floor((opponent.x + (opponent.size / 2) - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
    let targetR = Math.floor((opponent.y + (opponent.size / 2)) / CONFIG.CELL_SIZE);

    // 3. Set Start (Self) and End (Enemy)
    let start = gridIndex(Math.floor((p.x - CONFIG.MAZE_OFFSET_X + 1) / CONFIG.CELL_SIZE), Math.floor((p.y + 1) / CONFIG.CELL_SIZE));
    let end = gridIndex(targetC, targetR);

    if (!start || !end) return;

    // Apply costs now that we have a valid path target
    p.boostEnergy -= CONFIG.BEAM_ENERGY_COST;
    STATE.sfx.shoot();

    // --- PATHFINDING (Existing Logic) ---
    // Reset pathfinding flags
    STATE.maze.forEach(c => {
        c.parent = null;
        c.bfsVisited = false;
    });

    let queue = [start];
    start.bfsVisited = true;
    let found = false;

    // BFS Search Loop
    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr === end) {
            found = true;
            break;
        }
        [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]].forEach(d => {
            let n = gridIndex(curr.c + d[0], curr.r + d[1]);
            // Standard BFS: Check walls and visited status
            if (n && !n.bfsVisited && !curr.walls[d[2]]) {
                n.bfsVisited = true;
                n.parent = curr;
                queue.push(n);
            }
        });
    }

    // If no path to enemy (e.g., they are walled off perfectly), cancel shot
    if (!found) {
        // Refund energy if shot fails
        p.boostEnergy += CONFIG.BEAM_ENERGY_COST;
        return;
    }

    let pathCells = [];
    let temp = end;
    while (temp) {
        pathCells.push(temp);
        temp = temp.parent;
    }
    pathCells.reverse();

    p.beamPixels = [];
    for (let i = 0; i < pathCells.length - 1; i++) {
        let x1 = CONFIG.MAZE_OFFSET_X + (pathCells[i].c * CONFIG.CELL_SIZE) + 1;
        let y1 = (pathCells[i].r * CONFIG.CELL_SIZE) + 1;
        let x2 = CONFIG.MAZE_OFFSET_X + (pathCells[i + 1].c * CONFIG.CELL_SIZE) + 1;
        let y2 = (pathCells[i + 1].r * CONFIG.CELL_SIZE) + 1;

        p.beamPixels.push({
            x: x1,
            y: y1
        });
        let dx = (x2 - x1) / 3;
        let dy = (y2 - y1) / 3;
        p.beamPixels.push({
            x: x1 + dx,
            y: y1 + dy
        });
        p.beamPixels.push({
            x: x1 + dx * 2,
            y: y1 + dy * 2
        });
    }
    p.beamPixels.push({
        x: CONFIG.MAZE_OFFSET_X + (pathCells[pathCells.length - 1].c * CONFIG.CELL_SIZE) + 1,
        y: (pathCells[pathCells.length - 1].r * CONFIG.CELL_SIZE) + 1
    });
    p.beamIdx = 0;
}

function finalizeRound() {
    // --- HANDLE DRAW ---
    if (STATE.isDraw) {
        STATE.messages.round = "DOUBLE KO! DRAW!";
        STATE.messages.roundColor = "#ffffff";
        STATE.sfx.roundOver(); // Play generic sound
        STATE.isRoundOver = true;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (STATE.isAttractMode) STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER;
        // Reset Logic
        STATE.deathTimer = 0;
        STATE.isDraw = false;
        return;
    }

    // --- STANDARD WINNER LOGIC ---
    let victimIdx = STATE.victimIdx;
    let winnerIdx = (victimIdx === 0) ? 1 : 0;

    STATE.players[winnerIdx].score++;
    STATE.messages.round = `P${victimIdx + 1} ${STATE.deathReason}!`;
    STATE.messages.roundColor = "#ff0000";

    if (STATE.players[winnerIdx].score >= CONFIG.MAX_SCORE) {
        STATE.sfx.win();
        STATE.isGameOver = true;
        STATE.looser = (winnerIdx + 1 == 1) ? 2 : 1;
        STATE.messages.win = `PLAYER ${winnerIdx + 1} WINS!`;
        STATE.messages.taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
        STATE.messages.winColor = STATE.players[winnerIdx].color;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
    } else {
        STATE.sfx.roundOver();
        STATE.isRoundOver = true;
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
    }

    STATE.deathTimer = 0;
    if (STATE.isAttractMode) {
        STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER; // Wait ~3 seconds (60 frames/sec * 3)
    }
}

function update() {
    if (navigator.getGamepads)//  Get Gamepad State (This now handles System Logic too!)
        STATE.gpData = pollGamepads();
    if (STATE.screen === 'MENU') {
        if (STATE.keys['Digit1']) {
            STATE.gameMode = 'SINGLE';
            startGame();
        }
        if (STATE.keys['Digit2']) {
            STATE.gameMode = 'MULTI';
            startGame();
        }
        if (Date.now() - lastInputTime > CONFIG.IDLE_THRESHOLD) {// CHECK IDLE TIMER
            STATE.isAttractMode = true;
            STATE.gameMode = 'MULTI'; // Doesn't matter, but keeps logic clean
            startGame();
            document.getElementById('statusText').innerText = "DEMO MODE";
        }
        updateParticles();
        return;
    }

    if (STATE.deathTimer > 0) {
        STATE.deathTimer--;

        updateProjectiles();
        updateParticles();

        if (STATE.deathTimer <= 0) {
            finalizeRound();
        }
        return;
    }

    if (STATE.isGameOver || STATE.isRoundOver) {
        updateParticles();
        STATE.scrollX -= 0.5;
        let msgLen = (STATE.isGameOver ? STATE.messages.taunt.length : STATE.messages.round.length);
        if (STATE.scrollX < -(msgLen * 4.5)) STATE.scrollX = CONFIG.LOGICAL_W;
        if (STATE.isAttractMode && STATE.demoResetTimer > 0) {
            STATE.demoResetTimer--;
            if (STATE.demoResetTimer <= 0) {
                // Determine action: Restart Game (if Game Over) or Next Round (if Round Over)
                if (STATE.isGameOver) {
                    startGame();
                } else {
                    initMaze();
                }
            }
        }
        return;
    }
    updateProjectiles();
    if (STATE.gameTime <= 0) {
        STATE.isRoundOver = true;
        STATE.messages.round = "TIME OUT!";
        STATE.messages.roundColor = "#ffff00";
        STATE.scrollX = CONFIG.LOGICAL_W + 5;
        if (STATE.isAttractMode) STATE.demoResetTimer = CONFIG.DEMO_RESET_TIMER;
        return;
    }
    STATE.gameTime -= 1;
    // NEW: Sudden Death - Every second after time runs low (e.g. < 30 seconds left)
    if (STATE.gameTime < 1800 && STATE.gameTime % 50 === 0) {
        STATE.messages.round = "SUDDEN DEATH!";
        STATE.scrollX = CONFIG.LOGICAL_W; // Flash warning

        // Spawn a neutral mine in a random spot to increase panic
        let rx = Math.floor(Math.random() * CONFIG.COLS);
        let ry = Math.floor(Math.random() * CONFIG.ROWS);
        STATE.mines.push({
            x: CONFIG.MAZE_OFFSET_X + rx * CONFIG.CELL_SIZE,
            y: ry * CONFIG.CELL_SIZE,
            active: true, // Instantly active
            droppedAt: Date.now(),
            visX: 0, visY: 0,
            owner: -1 // Neutral owner (hurts everyone)
        });
    }
    let now = Date.now();
    STATE.mines.forEach(m => {
        if (!m.active && now - m.droppedAt > CONFIG.MINE_ARM_TIME) m.active = true;
    });
    if (!STATE.ammoCrate) {
        STATE.ammoRespawnTimer++;
        if (STATE.ammoRespawnTimer > CONFIG.AMMO_RESPAWN_DELAY) {
            spawnAmmoCrate();
            STATE.ammoRespawnTimer = 0;
        }
    }

    let p1 = STATE.players[0];
    let p2 = STATE.players[1];
    if (p1.beamPixels.length > 0 && p2.beamPixels.length > 0) {
        let b1 = Math.floor(p1.beamIdx);
        let b2 = Math.floor(p2.beamIdx);
        if (b1 < p1.beamPixels.length && b2 < p2.beamPixels.length) {
            let h1 = p1.beamPixels[b1];
            let h2 = p2.beamPixels[b2];
            if (Math.abs(h1.x - h2.x) + Math.abs(h1.y - h2.y) < 4) {
                triggerExplosion((h1.x + h2.x) / 2, (h1.y + h2.y) / 2, "ANNIHILATED");
                p1.beamPixels = [];
                p1.beamIdx = 9999;
                p2.beamPixels = [];
                p2.beamIdx = 9999;
            }
        }
    }

    STATE.players.forEach((p, idx) => {
        if (STATE.ammoCrate && Math.abs((p.x + 1) - (STATE.ammoCrate.x + 1)) < 2 && Math.abs((p.y + 1) - (STATE.ammoCrate.y + 1)) < 2) {
            p.minesLeft = CONFIG.MAX_MINES;
            STATE.sfx.powerup();
            STATE.ammoCrate = null;
            STATE.ammoRespawnTimer = 0;
        }

        if (p.stunTime > 0) p.stunTime--;
        if (p.glitchTime > 0) p.glitchTime--;
        if (p.portalCooldown > 0) p.portalCooldown--;
        else {
            let pc = Math.floor((p.x + p.size / 2 - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
            let pr = Math.floor((p.y + p.size / 2) / CONFIG.CELL_SIZE);
            let portal = STATE.portals.find(pt => pt.c === pc && pt.r === pr);
            if (portal) {
                let dest = STATE.portals.find(pt => pt !== portal);
                if (dest) {
                    p.x = CONFIG.MAZE_OFFSET_X + dest.c * CONFIG.CELL_SIZE + 0.5;
                    p.y = dest.r * CONFIG.CELL_SIZE + 0.5;
                    p.portalCooldown = 60;
                    if (Math.random() < CONFIG.GLITCH_CHANCE) {
                        p.glitchStartTime = Date.now();
                        p.glitchTime = CONFIG.GLITCH_DURATION;
                    }
                }
            }
        }
        p.trail.push({
            x: p.x,
            y: p.y
        });
        if (p.trail.length > CONFIG.TRAIL_LENGTH) p.trail.shift();

        if (p.beamIdx < p.beamPixels.length + CONFIG.BEAM_LENGTH) p.beamIdx += 0.8;
        let opponent = STATE.players[(idx + 1) % 2];
        let tipIdx = Math.floor(opponent.beamIdx);
        if (tipIdx >= 0 && tipIdx < opponent.beamPixels.length) {
            let tip = opponent.beamPixels[tipIdx];
            if (Math.abs(p.x - tip.x) < 1.5 && Math.abs(p.y - tip.y) < 1.5) {
                if (!p.shieldActive) {
                    p.stunTime = CONFIG.STUN_DURATION;
                    p.glitchStartTime = Date.now();
                    p.glitchTime = CONFIG.STUN_DURATION;
                    STATE.sfx.charge();
                }
                opponent.beamPixels = [];
                opponent.beamIdx = 9999;
                opponent.boostEnergy = Math.min(100, opponent.boostEnergy + 15); // Attacker gains
                p.boostEnergy = Math.max(0, p.boostEnergy - 15);                 // Victim loses
            }
        }

        for (let i = STATE.mines.length - 1; i >= 0; i--) {
            let m = STATE.mines[i];
            let bIdx = Math.floor(p.beamIdx);
            if (bIdx >= 0 && bIdx < p.beamPixels.length) {
                let bp = p.beamPixels[bIdx];
                if (bp.x >= m.x - 1 && bp.x <= m.x + 3 && bp.y >= m.y - 1 && bp.y <= m.y + 3) {
                    // Change: Don't trigger full explosion, just "defuse" or small pop
                    triggerExplosion(m.x, m.y, "MINESWEEPER");
                    STATE.mines.splice(i, 1);

                    // Stop the beam so you can't snipe through mines
                    p.beamPixels = [];
                    p.beamIdx = 9999;
                    continue;
                }
            }
            if (m.active && p.x + p.size > m.x && p.x < m.x + 2 && p.y + p.size > m.y && p.y < m.y + 2) {
                triggerExplosion(m.x, m.y, "TRIPPED MINE");
                STATE.mines.splice(i, 1);
            }
        }

        // --- INPUT LOGIC  ---
        let cmd = {};

        // If in Attract Mode, BOTH players use AI
        if (STATE.isAttractMode) { // Player 1 targets Player 2, Player 2 targets Player 1
            cmd = getCpuInput(p, STATE.players[(idx + 1) % 2]);
        } else {// Normal Gameplay
            if (idx === 0) {
                cmd = getHumanInput(idx, CONTROLS_P1);
            } else {
                if (STATE.gameMode === 'SINGLE') cmd = getCpuInput(p, STATE.players[0]);
                else cmd = getHumanInput(idx, CONTROLS_P2);
            }
        }
        applyPlayerActions(p, cmd);
    });
    updateParticles();
}

function updateParticles() {
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

function updateProjectiles() {

    // Projectiles Update
    for (let i = STATE.projectiles.length - 1; i >= 0; i--) {
        let proj = STATE.projectiles[i];
        proj.x += proj.vx;
        proj.y += proj.vy;
        proj.distTraveled += CONFIG.C_BEAM_SPEED;

        if (proj.distTraveled >= CONFIG.C_BEAM_RANGE) {
            STATE.projectiles.splice(i, 1);
            continue;
        }

        let hw = (Math.abs(proj.vx) > 0) ? CONFIG.C_BEAM_LENGTH / 2 : CONFIG.C_BEAM_WIDTH / 2;
        let hh = (Math.abs(proj.vx) > 0) ? CONFIG.C_BEAM_WIDTH / 2 : CONFIG.C_BEAM_LENGTH / 2;
        let tipX = proj.x + (proj.vx * 2);
        let tipY = proj.y + (proj.vy * 2);

        if (isWall(tipX, tipY)) {
            let gc = Math.floor((tipX - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
            let gr = Math.floor(tipY / CONFIG.CELL_SIZE);
            destroyWallAt(gc, gr);
            STATE.particles.push({
                x: tipX,
                y: tipY,
                vx: proj.vx * 0.5,
                vy: proj.vy * 0.5,
                life: 0.5,
                color: '#555'
            });
        }

        for (let mIdx = STATE.mines.length - 1; mIdx >= 0; mIdx--) {
            let m = STATE.mines[mIdx];
            if (Math.abs(proj.x - m.x) < hw + 1 && Math.abs(proj.y - m.y) < hh + 1) {
                triggerExplosion(m.x, m.y, "SHOCKWAVE");
                STATE.mines.splice(mIdx, 1);
            }
        }

        let oppId = (proj.owner + 1) % 2;
        let opp = STATE.players[oppId];
        let pLeft = opp.x;
        let pRight = opp.x + opp.size;
        let pTop = opp.y;
        let pBot = opp.y + opp.size;
        let bLeft = proj.x - hw;
        let bRight = proj.x + hw;
        let bTop = proj.y - hh;
        let bBot = proj.y + hh;

        if (bLeft < pRight && bRight > pLeft && bTop < pBot && bBot > pTop) {
            if (!opp.shieldActive) {
                handlePlayerDeath(oppId, "WAS VAPORIZED");
                STATE.projectiles.splice(i, 1);
                return;
            } else {
                STATE.projectiles.splice(i, 1);
                return;
            }
        }
    }

}

/** * ==========================================
 * 5. RENDERING
 * ==========================================
 */

function drawLED(lx, ly, color) {
    const cx = (lx * CONFIG.PITCH) + (CONFIG.PITCH / 2);
    const cy = (ly * CONFIG.PITCH) + (CONFIG.PITCH / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, CONFIG.LED_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    // const cx = (lx * CONFIG.PITCH) + (CONFIG.PITCH / 2);
    // const cy = (ly * CONFIG.PITCH) + (CONFIG.PITCH / 2);
    // ctx.fillStyle = color;
    // const size = CONFIG.PITCH - 4;
    // ctx.fillRect(cx, cy, size, size);
}

function drawText(str, x, y, color) {
    str = str.toUpperCase();
    let cx = x;
    for (let i = 0; i < str.length; i++) {
        let map = BITMAP_FONT[str[i]];
        if (map) {
            for (let p = 0; p < 15; p++) {
                if (map[p]) drawLED(cx + (p % 3), y + Math.floor(p / 3), color);
            }
        }
        cx += 4;
    }
}

function drawDigit(x, y, num, color, rotateDeg) {
    const map = DIGIT_MAP[num];
    for (let i = 0; i < 15; i++) {
        if (map[i]) {
            let c = i % 3;
            let r = Math.floor(i / 3);
            let dx, dy;
            if (rotateDeg === -90) {
                dx = r;
                dy = (2 - c);
            } else if (rotateDeg === 90) {
                dx = (4 - r);
                dy = c;
            } else {
                dx = c;
                dy = r;
            }
            drawLED(x + dx, y + dy, color);
        }
    }
}

function drawPlayerBody(x, y, color) {
    let p = STATE.players.find(pl => pl.color === color); // Simplified lookup
    if (p && p.boostEnergy < 25 && Math.floor(Date.now() / 100) % 2 === 0) {
        color = '#555'; // Flash grey if exhausted
    }
    drawLED(Math.floor(x), Math.floor(y), color);
    drawLED(Math.floor(x) + 1, Math.floor(y), color);
    drawLED(Math.floor(x), Math.floor(y) + 1, color);
    drawLED(Math.floor(x) + 1, Math.floor(y) + 1, color);
}

function renderMenu() {
    document.getElementById('p1-header').style.color = CONFIG.P1COLOR;
    document.getElementById('p2-header').style.color = CONFIG.P2COLOR;
    document.getElementById('p1-panel').style.border = `1px solid ${CONFIG.P1COLOR.slice(0, 7)}63`;
    document.getElementById('p1-panel').style.boxShadow = `inset 0 0 15px ${CONFIG.P1COLOR.slice(0, 7)}23`;
    document.getElementById('p2-panel').style.border = `1px solid ${CONFIG.P2COLOR.slice(0, 7)}63`;
    document.getElementById('p2-panel').style.boxShadow = `inset 0 0 15px ${CONFIG.P2COLOR.slice(0, 7)}23`;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < CONFIG.LOGICAL_H; y++)
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) drawLED(x, y, '#111');

    drawText("SELECT MODE", 42, 10, "#fff");
    drawText("1. SINGLE PLAYER", 30, 25, Math.floor(Date.now() / 500) % 2 === 0 ? CONFIG.P1COLOR : "#555");
    drawText("2. MULTIPLAYER", 35, 35, Math.floor(Date.now() / 500) % 2 !== 0 ? CONFIG.P2COLOR : "#555");
    drawText("CPU: HARD", 45, 55, "#f55");
}

function renderGame() {
    // --- FIX 1: Update Camera Physics ---
    STATE.camera.update();

    // 1. Draw Background
    if (!isBgRendered) preRenderBackground();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // SAVE CONTEXT BEFORE SHAKING
    ctx.save();
    ctx.translate(STATE.camera.x, STATE.camera.y); // Apply Shake

    // Draw Background Image
    ctx.drawImage(bgCanvas, 0, 0);

    let timeRatio = STATE.maxGameTime > 0 ? Math.max(0, Math.min(1, STATE.gameTime / STATE.maxGameTime)) : 0;
    let hue = Math.floor(timeRatio * 180);
    let wallColor = `hsl(${hue}, 100%, 50%)`;

    // 2. Draw Maze Walls
    STATE.maze.forEach(c => {
        let x = c.c * CONFIG.CELL_SIZE + CONFIG.MAZE_OFFSET_X;
        let y = c.r * CONFIG.CELL_SIZE;

        let drawCorner = false;
        if (c.walls[0] || c.walls[3]) drawCorner = true;

        if (!drawCorner) {
            let left = gridIndex(c.c - 1, c.r);
            let top = gridIndex(c.c, c.r - 1);
            if (left && left.walls[0]) drawCorner = true;
            if (top && top.walls[3]) drawCorner = true;
        }

        if (drawCorner) drawLED(x, y, wallColor);

        if (c.walls[0]) {
            drawLED(x + 1, y, wallColor);
            drawLED(x + 2, y, wallColor);
        }
        if (c.walls[3]) {
            drawLED(x, y + 1, wallColor);
            drawLED(x, y + 2, wallColor);
        }

        if (c.c === CONFIG.COLS - 1) {
            if (c.walls[1] || c.walls[0]) drawLED(x + 3, y, wallColor);
            if (c.walls[1]) {
                drawLED(x + 3, y + 1, wallColor);
                drawLED(x + 3, y + 2, wallColor);
            }
        }
        if (c.r === CONFIG.ROWS - 1) {
            if (c.walls[2] || c.walls[3]) drawLED(x, y + 3, wallColor);
            if (c.walls[2]) {
                drawLED(x + 1, y + 3, wallColor);
                drawLED(x + 2, y + 3, wallColor);
            }
        }
        if (c.c === CONFIG.COLS - 1 && c.r === CONFIG.ROWS - 1) {
            drawLED(x + 3, y + 3, wallColor);
        }
    });

    // 3. Draw Goals
    let gc = Math.floor(Date.now() / 200) % 2 === 0 ? '#fff' : '#444';
    STATE.players.forEach(p => {
        let gx = CONFIG.MAZE_OFFSET_X + p.goalC * CONFIG.CELL_SIZE + 1;
        let gy = p.goalR * CONFIG.CELL_SIZE + 1;
        drawLED(gx, gy, gc);
        drawLED(gx + 1, gy, gc);
        drawLED(gx, gy + 1, gc);
        drawLED(gx + 1, gy + 1, gc);
    });

    // 4. Draw Portals & Ammo
    STATE.portals.forEach(p => {
        drawLED(p.x, p.y, p.color);
        drawLED(p.x + 1, p.y, p.color);
        drawLED(p.x, p.y + 1, p.color);
        drawLED(p.x + 1, p.y + 1, p.color);
    });
    if (STATE.ammoCrate) {
        drawLED(STATE.ammoCrate.x, STATE.ammoCrate.y, '#0f0');
        drawLED(STATE.ammoCrate.x + 1, STATE.ammoCrate.y, '#0f0');
        drawLED(STATE.ammoCrate.x, STATE.ammoCrate.y + 1, '#0f0');
        drawLED(STATE.ammoCrate.x + 1, STATE.ammoCrate.y + 1, '#0f0');
    }

    // 5. Draw Mines & Projectiles
    STATE.mines.forEach(m => drawLED(m.x + m.visX, m.y + m.visY, m.active ? (Date.now() % 200 < 100 ? '#f00' : '#800') : '#444'));
    // ... Mines drawing code above ...

    // --- 5b. PROJECTILE RENDER (Rasterized Rotated Rectangle) ---
    STATE.projectiles.forEach(p => {
        // 1. Calculate Basis Vectors
        let mag = Math.hypot(p.vx, p.vy);
        if (mag === 0) return;

        let nx = p.vx / mag; // Direction Vector (Length)
        let ny = p.vy / mag;

        let px = -ny;        // Perpendicular Vector (Width)
        let py = nx;

        let halfLen = CONFIG.C_BEAM_LENGTH / 2;
        let halfWidth = CONFIG.C_BEAM_WIDTH / 2;

        // 2. Define Scan Area (Bounding Box)
        // We only check LEDs close to the projectile to save CPU
        let scanRadius = halfLen + 2;
        let minX = Math.floor(p.x - scanRadius);
        let maxX = Math.ceil(p.x + scanRadius);
        let minY = Math.floor(p.y - scanRadius);
        let maxY = Math.ceil(p.y + scanRadius);

        let color = (Date.now() % 60 < 30) ? '#ffffff' : p.color; // Strobe effect

        // 3. Scan the Grid
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {

                // Vector from Projectile Center to this LED
                let dx = x - p.x;
                let dy = y - p.y;

                // 4. Dot Product Projection
                // "How far is this LED along the length?"
                let distLength = Math.abs((dx * nx) + (dy * ny));

                // "How far is this LED along the width?"
                let distWidth = Math.abs((dx * px) + (dy * py));

                // 5. Check if inside the rotated rectangle
                if (distLength <= halfLen && distWidth <= halfWidth) {
                    drawLED(x, y, color);
                }
            }
        }
    });

    // 6. Draw Players
    // ... inside renderGame() ...

    STATE.players.forEach(p => {
        if (p.isDead) return;

        // --- 1. BEAM RENDERING (Unchanged) ---
        // (Keep your existing beam drawing loop here)
        for (let k = 0; k < CONFIG.BEAM_LENGTH; k++) {
            let i = Math.floor(p.beamIdx) - k;
            if (i >= 0 && i < p.beamPixels.length) {
                ctx.globalAlpha = 1 - (k / CONFIG.BEAM_LENGTH);
                drawLED(p.beamPixels[i].x, p.beamPixels[i].y, p.color);
                ctx.globalAlpha = 1;
            }
        }

        // --- 2. CHARGING EFFECT (Unchanged) ---
        // (Keep your existing charge effect logic here)
        if (p.isCharging) {
            let r = (Date.now() - p.chargeStartTime) / CONFIG.CHARGE_TIME; if (r > 1) r = 1;
            let cc = `hsl(${Math.floor((1 - r) * 120)},100%,50%)`;
            let sx = Math.floor(p.x) - 1, sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            let n = Math.ceil(8 * r);
            for (let i = 0; i < n; i++) drawLED(sx + perim[i].x, sy + perim[i].y, cc);
        }

        // --- 3. SHIELD EFFECT (Unchanged) ---
        if (p.shieldActive) {
            let sx = Math.floor(p.x) - 1, sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            for (let i = 0; i < 8; i++) drawLED(sx + perim[i].x, sy + perim[i].y, '#88f');
        }

        // --- 4. TRAIL EFFECT (Unchanged) ---
        if (p.boostEnergy > 0 && p.currentSpeed > CONFIG.BASE_SPEED) {
            p.trail.forEach((t, i) => {
                const alpha = (i / p.trail.length) * 0.4;
                ctx.globalAlpha = alpha;
                drawLED(Math.floor(t.x), Math.floor(t.y), p.color);
                drawLED(Math.floor(t.x) + 1, Math.floor(t.y) + 1, p.color); 11
            });
            ctx.globalAlpha = 1.0;
        }

        // --- 5. NEW: GLITCH & STUN VISUALS ---
        if (p.glitchTime > 0 || p.stunTime > 0) {
            // 
            // EFFECT: "RGB Split" (Simulates Broken Controls)
            // const shake = Math.random(-3,1); // Pixel offset amount
            const min = -1, max = 1;
            // Draw RED Ghost (Offset Randomly)
            let rX = (Math.floor(Math.random() * (max - min + 1) + min));
            let rY = (Math.floor(Math.random() * (max - min + 1) + min));
            drawPlayerBody(p.x + rX, p.y + rY, '#FF0000');

            // Draw CYAN Ghost (Offset Opposite)
            let cX = Math.floor(Math.random() * (max - min + 1) + min);
            let cY = Math.floor(Math.random() * (max - min + 1) + min);
            drawPlayerBody(p.x + cX, p.y + cY, '#00FFFF');

            // 20% Chance to draw the real white core on top
            if (Math.random() > 0.8) drawPlayerBody(p.x, p.y, '#FFFFFF');

            if (p.stunTime > 0) {
                // 
                // EFFECT: "Static Shock" (Simulates Stun)
                // Rapidly flash between Dim Grey and Bright White
                let flashColor = (Math.floor(Date.now() / 40) % 2 === 0) ? '#444444' : '#FFFFFF';
                drawPlayerBody(p.x, p.y, flashColor);
            }
            // Draw random "sparks" around the player
            // for (let i = 0; i < 3; i++) {
            //     // Pick a random spot near the player
            //     let sx = p.x + (Math.random() * 3) ;
            //     let sy = p.y + (Math.random() * 3) - 0.5;
            //     // Draw a single yellow/white spark pixel
            //     drawLED(Math.floor(sx), Math.floor(sy), Math.random() > 0.5 ? '#FFFF00' : '#FFFFFF');
            // }

        } else {
            // NORMAL RENDER
            drawPlayerBody(p.x, p.y, p.color);
        }
    });

    // 7. Draw Particles
    STATE.particles.forEach(p => drawLED(p.x, p.y, p.color));

    // --- FIX 2: Restore Context BEFORE Drawing HUD ---
    // This ensures the HUD doesn't shake with the world
    ctx.restore();

    // 8. Draw HUD
    let p1 = STATE.players[0],
        p2 = STATE.players[1],
        s = Math.ceil(STATE.gameTime / 60).toString().padStart(3, '0');
    drawDigit(0, 0, parseInt(p1.score.toString().padStart(2, '0')[0]), p1.color, 90);
    drawDigit(0, 4, parseInt(p1.score.toString().padStart(2, '0')[1]), p1.color, 90);
    drawDigit(0, 10, p1.minesLeft, `hsl(${p1.minesLeft / 4 * 120},100%,50%)`, 90);
    for (let h = 0; h < Math.floor(p1.boostEnergy / 100 * 38); h++)
        for (let w = 0; w < 5; w++) drawLED(w, 14 + h, `hsl(${p1.boostEnergy / 100 * 120},100%,50%)`);

    drawDigit(0, 53, parseInt(s[0]), wallColor, 90);
    drawDigit(0, 57, parseInt(s[1]), wallColor, 90);
    drawDigit(0, 61, parseInt(s[2]), wallColor, 90);

    let rx = 123;
    drawDigit(rx, 61, parseInt(p2.score.toString().padStart(2, '0')[0]), p2.color, -90);
    drawDigit(rx, 57, parseInt(p2.score.toString().padStart(2, '0')[1]), p2.color, -90);
    drawDigit(rx, 51, p2.minesLeft, `hsl(${p2.minesLeft / 4 * 120},100%,50%)`, -90);
    for (let h = 0; h < Math.floor(p2.boostEnergy / 100 * 38); h++)
        for (let w = 0; w < 5; w++) drawLED(rx + w, 49 - h, `hsl(${p2.boostEnergy / 100 * 120},100%,50%)`);

    drawDigit(rx, 8, parseInt(s[0]), wallColor, -90);
    drawDigit(rx, 4, parseInt(s[1]), wallColor, -90);
    drawDigit(rx, 0, parseInt(s[2]), wallColor, -90);
    if (STATE.isAttractMode) {
        if (Math.floor(Date.now() / 800) % 2 === 0) { // Blink slowly
            drawText("DEMO MODE", 46, 25, "#ff0000");
            drawText("PRESS ANY BUTTON", 32, 35, "#ffff00");
        }
    }
    // 9. OVERLAY TEXT & DIMMER
    if (STATE.isGameOver || STATE.isRoundOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (STATE.isGameOver) {
            const winColor = STATE.looser == 1 ? CONFIG.P2COLOR : CONFIG.P1COLOR;
            const tauntColor = STATE.looser == 2 ? CONFIG.P2COLOR : CONFIG.P1COLOR;
            if (Math.floor(Date.now() / 300) % 2 === 0)
                drawText(STATE.messages.win, 38, 15, winColor);
            let msg = `P${STATE.looser}: '${STATE.messages.taunt}'`
            drawText(msg, STATE.scrollX, 35, tauntColor);
            drawText("PRESS 'R' TO RESET", 30, 52, "#888");
        } else {
            drawText("ROUND OVER", 46, 20, "#fff");
            drawText(STATE.messages.round, STATE.scrollX, 40, STATE.messages.roundColor);
            if (Math.floor(Date.now() / 500) % 2 === 0) drawText("PRESS 'START'", 42, 55, "#ffff00");
        }
    }
}
/** * ==========================================
 * 6. INIT & EVENT LISTENERS
 * ==========================================
 */

function preRenderBackground() {
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;

    // Fill black background
    bgCtx.fillStyle = '#000';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    // Draw the faint #222 LEDs once
    for (let y = 0; y < CONFIG.LOGICAL_H; y++) {
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) {
            // We inline the drawLED logic here for the offscreen context
            const cx = (x * CONFIG.PITCH) + (CONFIG.PITCH / 2);
            const cy = (y * CONFIG.PITCH) + (CONFIG.PITCH / 2);
            bgCtx.fillStyle = '#222';
            bgCtx.beginPath();
            bgCtx.arc(cx, cy, CONFIG.LED_RADIUS, 0, Math.PI * 2);
            bgCtx.fill();
        }
    }
    isBgRendered = true;
}

function startGame() {
    if (STATE.sfx) STATE.sfx.init();
    STATE.screen = 'PLAYING';
    STATE.isGameOver = false;
    STATE.isRoundOver = false; 1
    STATE.players = [
        new Player(0, CONFIG.P1COLOR, CONTROLS_P1),
        new Player(1, CONFIG.P2COLOR, CONTROLS_P2)
    ];
    document.getElementById('statusText').innerText = "GOAL: 5 POINTS";
    initMaze();
}

function loop() {
    update();
    if (STATE.screen === 'MENU') renderMenu();
    else renderGame();
    requestAnimationFrame(loop);
}


window.addEventListener('keydown', (e) => {
    resetIdleTimer();
    if (STATE.sfx) STATE.sfx.init();
    let k = e.code;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(k)) e.preventDefault();
    STATE.keys[k] = true;

    if (k === 'Escape') {
        STATE.screen = 'MENU';
        document.getElementById('statusText').innerText = "SELECT MODE";
    }

    if (STATE.screen === 'PLAYING') {
        if (STATE.isGameOver && (k === 'KeyR' || k === 'KeyStart' || k === 'KeySelect')) {
            startGame(); // Full Reset
        } else if (STATE.isRoundOver && (k === 'KeyR' || k === 'KeyStart' || k === 'KeySelect')) {
            initMaze(); // Next Round (Keep Score)
        }
    }
});

window.addEventListener('keyup', (e) => STATE.keys[e.code] = false);

window.addEventListener('load', () => {
    initTouchControls();
    loop();
});