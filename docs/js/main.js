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
};

/** * ==========================================
 * 4. GRID & PHYSICS HELPERS
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
 * 5. GAME FLOW & GENERATION
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
 * 6. INPUT & AI LOGIC
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
        size: 100
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
 * NATIVE GAMEPAD POLLING (NEW)
 * ==========================================
 */
function pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gpInput = {
        p1: {
            up: false,
            down: false,
            left: false,
            right: false,
            shield: false,
            beam: false,
            mine: false,
            boost: false,
            boom: false
        },
        p2: {
            up: false,
            down: false,
            left: false,
            right: false,
            shield: false,
            beam: false,
            mine: false,
            boost: false,
            boom: false
        }
    };

    let activityDetected = false; // <--- Flag for activity
    for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (!gp) continue;

        // CHECK FOR ANY INPUT TO RESET TIMER
        // Check axes
        if (Math.abs(gp.axes[0]) > CONFIG.GAMEPAD_THRESH || Math.abs(gp.axes[1]) > CONFIG.GAMEPAD_THRESH) {
            activityDetected = true;
        }
        // Check all buttons
        for (let b = 0; b < gp.buttons.length; b++) {
            if (gp.buttons[b].pressed) activityDetected = true;
        }

        // make the assamption that the 1st gamepad belong to  Player 1
        let target = (i === 0) ? gpInput.p1 : gpInput.p2;

        // D-PAD / AXES  (Analog Stick)
        if (gp.axes[1] < -CONFIG.GAMEPAD_THRESH) target.up = true;
        if (gp.axes[1] > CONFIG.GAMEPAD_THRESH) target.down = true;
        if (gp.axes[0] < -CONFIG.GAMEPAD_THRESH) target.left = true;
        if (gp.axes[0] > CONFIG.GAMEPAD_THRESH) target.right = true;

        // SNES Style mapping (Standard HTML5 Gamepad Layout) B=0, A=1, Y=2, X=3, L=4, R=5
        if (gp.buttons[12]?.pressed) target.up = true; // D-Pad Up
        if (gp.buttons[13]?.pressed) target.down = true; // D-Pad Down
        if (gp.buttons[14]?.pressed) target.left = true; // D-Pad Left
        if (gp.buttons[15]?.pressed) target.right = true; // D-Pad Right

        if (gp.buttons[0]?.pressed) target.mine = true; // Button B (Bottom)
        if (gp.buttons[1]?.pressed) target.boom = true; // Button A (Right)
        if (gp.buttons[2]?.pressed) target.beam = true; // Button Y (Left)
        if (gp.buttons[3]?.pressed) target.shield = true; // Button X (Top)
        if (gp.buttons[4]?.pressed) target.boost = true; // L Shoulder
        if (gp.buttons[5]?.pressed) target.boost = true; // R Shoulder
        if (gp.buttons[9]?.pressed) { // Start Button -> Reset
            if (STATE.isGameOver || STATE.isRoundOver) startGame();
        }
    }


    if (activityDetected) resetIdleTimer(); // <--- Reset timer if active
    return gpInput;
}

function getHumanInput(playerIdx, controls) {
    const gpData = pollGamepads();
    const gp = (playerIdx === 0) ? gpData.p1 : gpData.p2;
    return {
        up: STATE.keys[controls.up] || gp.up,
        down: STATE.keys[controls.down] || gp.down,
        left: STATE.keys[controls.left] || gp.left,
        right: STATE.keys[controls.right] || gp.right,
        shield: STATE.keys[controls.shield] || gp.shield,
        beam: STATE.keys[controls.beam] || gp.beam,
        mine: STATE.keys[controls.mine] || gp.mine,
        boost: STATE.keys[controls.boost] || gp.boost,
        boom: STATE.keys[controls.boom] || gp.boom
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
    let cmd = {
        up: false,
        down: false,
        left: false,
        right: false,
        shield: false,
        beam: false,
        mine: false,
        boost: false,
        boom: false
    };

    // 1. DANGER SENSE
    let threat = null;
    let minDist = 999;
    STATE.projectiles.forEach(proj => {
        if (proj.owner !== cpu.id) {
            let d = Math.hypot(proj.x - cpu.x, proj.y - cpu.y);
            if (d < 30 && d < minDist) {
                threat = proj;
                minDist = d;
            }
        }
    });
    let immediateMine = STATE.mines.find(m => m.active && Math.hypot(m.x - cpu.x, m.y - cpu.y) < 6);

    // 2. DEFENSE
    if (threat && minDist < 6 && cpu.boostEnergy > 20) cmd.shield = true;
    if (immediateMine && cpu.boostEnergy > 20) cmd.shield = true;

    // 3. ATTACK
    let dx = opponent.x - cpu.x;
    let dy = opponent.y - cpu.y;
    let distOpp = Math.hypot(dx, dy);

    if (!cmd.shield && cpu.boostEnergy > 30) {
        if (Math.abs(dx) < 30 && Math.abs(dy) < 4) cmd.beam = true;
        else if (Math.abs(dy) < 30 && Math.abs(dx) < 4) cmd.beam = true;
    }

    // 4. STUCK DETECTION
    let distMoved = Math.hypot(cpu.x - cpu.lastPos.x, cpu.y - cpu.lastPos.y);
    if (distMoved < 0.1) cpu.stuckCounter++;
    else cpu.stuckCounter = 0;
    cpu.lastPos = {
        x: cpu.x,
        y: cpu.y
    };

    if (cpu.stuckCounter > 20) {
        cpu.forceUnstuckTimer = 15;
        cpu.stuckCounter = 0;
        let dirs = [{
            x: 0,
            y: -1
        }, {
            x: 0,
            y: 1
        }, {
            x: -1,
            y: 0
        }, {
            x: 1,
            y: 0
        }];
        let validDirs = dirs.filter(d => !isWall(cpu.x + d.x * 2, cpu.y + d.y * 2));
        cpu.unstuckDir = validDirs.length > 0 ? validDirs[Math.floor(Math.random() * validDirs.length)] : dirs[0];
    }

    if (cpu.forceUnstuckTimer > 0) {
        cpu.forceUnstuckTimer--;
        if (cpu.unstuckDir.y < 0) cmd.up = true;
        if (cpu.unstuckDir.y > 0) cmd.down = true;
        if (cpu.unstuckDir.x < 0) cmd.left = true;
        if (cpu.unstuckDir.x > 0) cmd.right = true;
        return cmd;
    }

    // 5. NAVIGATION
    if (!cpu.botNextCell || cpu.botRetargetTimer <= 0 || threat) {
        let path = findPath(cpu, cpu.goalC, cpu.goalR, false);
        if (!path) path = findPath(cpu, cpu.goalC, cpu.goalR, true);

        if (path && path.length > 1) cpu.botNextCell = path[1];
        else if (path && path.length > 0) cpu.botNextCell = path[0];
        else cpu.botNextCell = null;

        cpu.botRetargetTimer = 10;
    }
    cpu.botRetargetTimer--;

    if (cpu.botNextCell) {
        let tx = CONFIG.MAZE_OFFSET_X + cpu.botNextCell.c * CONFIG.CELL_SIZE + 0.5;
        let ty = cpu.botNextCell.r * CONFIG.CELL_SIZE + 0.5;

        let steppingOnMine = STATE.mines.some(m => m.active && Math.abs(m.x - tx) < 3 && Math.abs(m.y - ty) < 3);
        if (steppingOnMine && cpu.boostEnergy > 20) cmd.shield = true;

        let diffX = tx - cpu.x;
        let diffY = ty - cpu.y;
        if (Math.abs(diffX) > 0.1) {
            if (diffX < 0) cmd.left = true;
            else cmd.right = true;
        }
        if (Math.abs(diffY) > 0.1) {
            if (diffY < 0) cmd.up = true;
            else cmd.down = true;
        }
    }

    // 6. UTILITY
    if (distOpp < 8 && cpu.minesLeft > 0 && Math.random() < 0.05) cmd.mine = true;
    if (cpu.botNextCell && !threat && cpu.boostEnergy > 80 && Math.random() < 0.05) cmd.boost = true;

    STATE.mines.forEach(m => {
        if (m.owner === cpu.id && Math.hypot(m.x - opponent.x, m.y - opponent.y) < 5) cmd.boom = true;
    });

    return cmd;
}

/** * ==========================================
 * 7. CORE GAME LOOP & PHYSICS
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
        if (!p.shieldActive) STATE.sfx.shield();
        p.shieldActive = true;
        p.boostEnergy -= CONFIG.SHIELD_DRAIN;
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
        p.score += 2;
        if (p.score >= CONFIG.MAX_SCORE) {
            STATE.isGameOver = true;
            STATE.looser = p.id == 0 ? 2 : 1;
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
    p.boostEnergy -= CONFIG.CHARGED_BEAM_COST;
    STATE.sfx.chargedShoot();

    STATE.projectiles.push({
        x: p.x + (p.size / 2),
        y: p.y + (p.size / 2),
        vx: p.lastDir.x * CONFIG.C_BEAM_SPEED,
        vy: p.lastDir.y * CONFIG.C_BEAM_SPEED,
        distTraveled: 0,
        owner: p.id,
        color: p.color
    });

    for (let i = 0; i < 10; i++) {
        STATE.particles.push({
            x: p.x + 1,
            y: p.y + 1,
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
        STATE.looser = victimIdx == 0 ? 2 : 1; // Fixed logic
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

// --- Main Update ---
function update() {
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
            }
        }

        for (let i = STATE.mines.length - 1; i >= 0; i--) {
            let m = STATE.mines[i];
            let bIdx = Math.floor(p.beamIdx);
            if (bIdx >= 0 && bIdx < p.beamPixels.length) {
                let bp = p.beamPixels[bIdx];
                if (bp.x >= m.x - 1 && bp.x <= m.x + 3 && bp.y >= m.y - 1 && bp.y <= m.y + 3) {
                    triggerExplosion(m.x, m.y, "ATE SHRAPNEL");
                    STATE.mines.splice(i, 1);
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
 * 8. RENDERING
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

function renderMenu() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < CONFIG.LOGICAL_H; y++)
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) drawLED(x, y, '#111');

    drawText("SELECT MODE", 42, 10, "#fff");
    drawText("1. SINGLE PLAYER", 30, 25, Math.floor(Date.now() / 500) % 2 === 0 ? "#0ff" : "#555");
    drawText("2. MULTIPLAYER", 35, 35, Math.floor(Date.now() / 500) % 2 !== 0 ? "#f0f" : "#555");
    drawText("CPU: HARD", 45, 55, "#f55");
}

function renderGame() {
    // --- FIX 1: Update Camera Physics ---
    STATE.camera.update();

    // 1. Draw Background
    if (!isBgRendered) preRenderBackground();

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
    STATE.projectiles.forEach(p => {
        let hw = (Math.abs(p.vx) > 0) ? CONFIG.C_BEAM_LENGTH / 2 : CONFIG.C_BEAM_WIDTH / 2;
        let hh = (Math.abs(p.vx) > 0) ? CONFIG.C_BEAM_WIDTH / 2 : CONFIG.C_BEAM_LENGTH / 2;
        let c = (Date.now() % 50 === 0) ? '#fff' : p.color;
        for (let py = Math.floor(p.y - hh); py <= Math.floor(p.y + hh); py++)
            for (let px = Math.floor(p.x - hw); px <= Math.floor(p.x + hw); px++)
                drawLED(px, py, c);
    });

    // 6. Draw Players
    STATE.players.forEach(p => {
        if (p.isDead) return;
        let rc = p.stunTime > 0 ? (Date.now() % 100 < 50 ? '#808' : p.color) : (p.glitchTime > 0 ? (Date.now() % 100 < 50 ? '#0f0' : p.color) : p.color);
        if (p.glitchTime > 0) {
            let gc = Date.now() % 100 < 50 ? '#00FF27' : '#EEFF00';
            let sx = Math.floor(p.x) - 1,
                sy = Math.floor(p.y) - 1;
            let perim = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];
            for (let i = 0; i < perim.length; i++)
                drawLED(sx + perim[i].x, sy + perim[i].y, gc);
        }
        // Beam
        for (let k = 0; k < CONFIG.BEAM_LENGTH; k++) {
            let i = Math.floor(p.beamIdx) - k;
            if (i >= 0 && i < p.beamPixels.length) {
                ctx.globalAlpha = 1 - (k / CONFIG.BEAM_LENGTH);
                drawLED(p.beamPixels[i].x, p.beamPixels[i].y, rc);
                ctx.globalAlpha = 1;
            }
        }

        // Charge
        if (p.isCharging) {
            let r = (Date.now() - p.chargeStartTime) / CONFIG.CHARGE_TIME;
            if (r > 1) r = 1;
            let cc = `hsl(${Math.floor((1 - r) * 120)},100%,50%)`;
            let sx = Math.floor(p.x) - 1,
                sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            let n = Math.ceil(8 * r);
            for (let i = 0; i < n; i++)
                drawLED(sx + perim[i].x, sy + perim[i].y, cc);
        }

        // Shield
        if (p.shieldActive) {
            let sx = Math.floor(p.x) - 1,
                sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            for (let i = 0; i < 8; i++)
                drawLED(sx + perim[i].x, sy + perim[i].y, '#88f');
        }

        // Trail
        if (p.boostEnergy > 0 && p.currentSpeed > CONFIG.BASE_SPEED)
            p.trail.forEach((t, i) => {
                ctx.globalAlpha = 0.7;
                drawLED(Math.floor(t.x), Math.floor(t.y), rc);
                drawLED(Math.floor(t.x) + 1, Math.floor(t.y), rc);
                ctx.globalAlpha = 1;
            });

        drawLED(Math.floor(p.x), Math.floor(p.y), rc);
        drawLED(Math.floor(p.x) + 1, Math.floor(p.y), rc);
        drawLED(Math.floor(p.x), Math.floor(p.y) + 1, rc);
        drawLED(Math.floor(p.x) + 1, Math.floor(p.y) + 1, rc);
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
    drawDigit(0, 0, parseInt(p1.score.toString().padStart(2, '0')[0]), '#0ff', 90);
    drawDigit(0, 4, parseInt(p1.score.toString().padStart(2, '0')[1]), '#0ff', 90);
    drawDigit(0, 10, p1.minesLeft, `hsl(${p1.minesLeft / 4 * 120},100%,50%)`, 90);
    for (let h = 0; h < Math.floor(p1.boostEnergy / 100 * 38); h++)
        for (let w = 0; w < 5; w++) drawLED(w, 14 + h, `hsl(${p1.boostEnergy / 100 * 120},100%,50%)`);

    drawDigit(0, 53, parseInt(s[0]), wallColor, 90);
    drawDigit(0, 57, parseInt(s[1]), wallColor, 90);
    drawDigit(0, 61, parseInt(s[2]), wallColor, 90);

    let rx = 123;
    drawDigit(rx, 61, parseInt(p2.score.toString().padStart(2, '0')[0]), '#f0f', -90);
    drawDigit(rx, 57, parseInt(p2.score.toString().padStart(2, '0')[1]), '#f0f', -90);
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
            if (Math.floor(Date.now() / 300) % 2 === 0)
                drawText(STATE.messages.win, 38, 15, STATE.messages.winColor);
            let msg = `P${STATE.looser}: '${STATE.messages.taunt}'`
            drawText(msg, STATE.scrollX, 35, "#ff5555");
            drawText("PRESS 'R' TO RESET", 30, 52, "#888");
        } else {
            drawText("ROUND OVER", 46, 20, "#fff");
            drawText(STATE.messages.round, STATE.scrollX, 40, STATE.messages.roundColor);
            if (Math.floor(Date.now() / 500) % 2 === 0) drawText("PRESS 'START'", 42, 55, "#ffff00");
        }
    }
}
/** * ==========================================
 * 9. INIT & EVENT LISTENERS
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
    STATE.isRoundOver = false;
    STATE.players = [new Player(0, '#00ffff', CONTROLS_P1), new Player(1, '#ff00ff', CONTROLS_P2)];
    document.getElementById('statusText').innerText = "GOAL: 5 POINTS";
    initMaze();
}

function loop() {
    update();
    if (STATE.screen === 'MENU') renderMenu();
    else renderGame();
    requestAnimationFrame(loop);
}

function toggleRules() {
    const modal = document.getElementById('mobile-rules-modal');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
    }
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
    if (typeof nipplejs === 'undefined') {
        console.error("Nipple.js failed to load!");
        alert("Joystick library blocked by browser/network.\nPlease try a different browser or check internet connection.");
    } else
        initTouchControls();

    loop();
});