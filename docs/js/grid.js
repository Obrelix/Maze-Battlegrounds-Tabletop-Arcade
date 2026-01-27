import { CONFIG, COLORS } from './config.js';
import { STATE } from './state.js';
import { Cell } from './classes.js';

export function gridIndex(c, r) {
    if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.ROWS) return undefined;
    return STATE.maze[c + r * CONFIG.COLS];
}

export function isWall(pixelX, pixelY) {
    if (pixelX < CONFIG.MAZE_OFFSET_X || pixelX >= CONFIG.LOGICAL_W - CONFIG.MAZE_OFFSET_X) return true;
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

export function removeWall(c, r, wallIdx) {
    let cell = gridIndex(c, r);
    if (!cell) return;

    // 0: Top, 1: Right, 2: Bottom, 3: Left
    cell.walls[wallIdx] = false;

    // Update the neighbor to match
    if (wallIdx === 0) { // Top -> Update neighbor's Bottom
        let n = gridIndex(c, r - 1);
        if (n) n.walls[2] = false;
    } else if (wallIdx === 1) { // Right -> Update neighbor's Left
        let n = gridIndex(c + 1, r);
        if (n) n.walls[3] = false;
    } else if (wallIdx === 2) { // Bottom -> Update neighbor's Top
        let n = gridIndex(c, r + 1);
        if (n) n.walls[0] = false;
    } else if (wallIdx === 3) { // Left -> Update neighbor's Right
        let n = gridIndex(c - 1, r);
        if (n) n.walls[1] = false;
    }
}

export function destroyWallAt(c, r) {
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

export function spawnAmmoCrate() {
    let c = Math.floor(Math.random() * (CONFIG.COLS - 2)) + 1;
    let r = Math.floor(Math.random() * (CONFIG.ROWS - 2)) + 1;
    STATE.ammoCrate = {
        x: CONFIG.MAZE_OFFSET_X + c * CONFIG.CELL_SIZE + 0.5,
        y: r * CONFIG.CELL_SIZE + 0.5,
        c: c,
        r: r
    };
}

export function initMaze() {
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
    STATE.ammoCrate = null;
    spawnPortals();
    spawnAmmoCrate();
    calculateGameTime();
    STATE.isRoundOver = false;
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
    STATE.gameTime = Math.floor((len * CONFIG.CELL_SIZE / (CONFIG.BASE_SPEED * 1.2)) * 6);
    STATE.maxGameTime = STATE.gameTime;
}

function spawnPortals() {
    // We want 2 portals: 
    // Portal 1: Near Player 1 spawn (0,0) 
    // Portal 2: Near Player 2 spawn (COLS-1, ROWS-1) 

    // Constraints: Distance range from spawn for portal placement.
    const MIN_DIST = 8;
    const MAX_DIST = 18;

    STATE.portals = [];

    // --- 1. Find Location for Portal 1 (Near Top-Left) ---
    let p1 = { c: Math.floor(CONFIG.COLS / 4), r: Math.floor(CONFIG.ROWS / 4) };
    let attempts = 0;
    while (attempts < 1000) {
        attempts++;
        // Random spot in the top-left quadrant mostly
        let c = Math.floor(4 + Math.random() * ((CONFIG.COLS - 4) / 2));
        let r = Math.floor(4 + Math.random() * ((CONFIG.ROWS - 4) / 2));

        // Calculate distance from P1 Spawn (0,0)
        let dist = Math.hypot(c, r);

        if (dist >= MIN_DIST && dist <= MAX_DIST) {
            p1 = { c, r };
            break;
        }
    }

    // --- 2. Find Location for Portal 2 (Near Bottom-Right) ---
    let p2 = { c: Math.floor(CONFIG.COLS * 3 / 4), r: Math.floor(CONFIG.ROWS * 3 / 4) };
    attempts = 0;
    while (attempts < 1000) {
        attempts++;
        // Random spot in the bottom-right quadrant mostly
        let c = Math.floor(Math.random() * (CONFIG.COLS / 2)) + Math.floor(CONFIG.COLS / 2);
        let r = Math.floor(Math.random() * (CONFIG.ROWS / 2)) + Math.floor(CONFIG.ROWS / 2);

        if (c >= CONFIG.COLS || r >= CONFIG.ROWS) continue;

        // Calculate distance from P2 Spawn (COLS-1, ROWS-1)
        let dist = Math.hypot(c - (CONFIG.COLS - 1), r - (CONFIG.ROWS - 1));

        if (dist >= MIN_DIST && dist <= MAX_DIST) {
            p2 = { c, r };
            break;
        }
    }

    // Push Portal 1
    STATE.portals.push({
        c: p1.c,
        r: p1.r,
        x: CONFIG.MAZE_OFFSET_X + p1.c * CONFIG.CELL_SIZE + 1.5,
        y: p1.r * CONFIG.CELL_SIZE + 1.5,
        color: COLORS.find(x => x.name === "CYAN").hex
    });

    // Push Portal 2
    STATE.portals.push({
        c: p2.c,
        r: p2.r,
        x: CONFIG.MAZE_OFFSET_X + p2.c * CONFIG.CELL_SIZE + 1.5,
        y: p2.r * CONFIG.CELL_SIZE + 1.5,
        color: COLORS.find(x => x.name === "BLUE").hex
    });

    // --- 3. Apply Wall Clearing (Your requested fix) ---
    STATE.portals.forEach(p => {
        // Clear 3x3 area around portal center
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                removeWall(p.c + x, p.r + y, 0); // Top
                removeWall(p.c + x, p.r + y, 1); // Right
                removeWall(p.c + x, p.r + y, 2); // Bottom
                removeWall(p.c + x, p.r + y, 3); // Left
            }
        }
    });
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

