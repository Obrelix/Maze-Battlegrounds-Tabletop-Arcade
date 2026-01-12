import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { Cell } from './classes.js';

export function gridIndex(c, r) {
    if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.ROWS) return undefined;
    return STATE.maze[c + r * CONFIG.COLS];
}

export function isWall(pixelX, pixelY) {
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
            color: STATE.portals.length === 0 ? CONFIG.PORTAL1_COLOR : CONFIG.PORTAL2_COLOR
        });
    }
    if (STATE.portals.length < 2) {
        STATE.portals = [{
            c: 10,
            r: 10,
            x: CONFIG.MAZE_OFFSET_X + 10 * CONFIG.CELL_SIZE + 1.5,
            y: 10 * CONFIG.CELL_SIZE + 1.5,
            color: CONFIG.PORTAL1_COLOR
        },
        {
            c: 20,
            r: 10,
            x: CONFIG.MAZE_OFFSET_X + 20 * CONFIG.CELL_SIZE + 1.5,
            y: 10 * CONFIG.CELL_SIZE + 1.5,
            color: CONFIG.PORTAL2_COLOR
        }
        ];
    }

    STATE.ammoCrate = null;
    spawnAmmoCrate();
    calculateGameTime();
    STATE.isRoundOver = false;
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

