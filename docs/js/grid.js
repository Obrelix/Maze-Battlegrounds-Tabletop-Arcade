import { CONFIG, COLORS } from './config.js';
import { getState, updateState } from './state.js';
import { Cell } from './classes.js';
import { setSeed, seededRandom } from './seededRandom.js';

export function gridIndex(c, r) {
    if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.ROWS) return undefined;
    return getState().maze[c + r * CONFIG.COLS];
}

// Line of sight cache - cleared each frame
let losCache = new Map();
let losCacheFrame = -1;

/**
 * Clear the LoS cache (call once per frame from game loop)
 */
export function clearLoSCache(frameCount) {
    if (losCacheFrame !== frameCount) {
        losCache.clear();
        losCacheFrame = frameCount;
    }
}

/**
 * Check if there's a clear line of sight between two points (no walls blocking)
 * Uses ray-casting with small steps to detect wall intersections
 * Results are cached per frame for performance
 * @param {number} fromX - Starting X position
 * @param {number} fromY - Starting Y position
 * @param {number} toX - Target X position
 * @param {number} toY - Target Y position
 * @returns {boolean} True if path is clear (no walls), false if blocked
 */
export function hasLineOfSight(fromX, fromY, toX, toY) {
    // Round positions to create cache key (reduces cache misses for nearby checks)
    const fx = Math.round(fromX);
    const fy = Math.round(fromY);
    const tx = Math.round(toX);
    const ty = Math.round(toY);

    // Check cache first
    const cacheKey = `${fx},${fy},${tx},${ty}`;
    if (losCache.has(cacheKey)) {
        return losCache.get(cacheKey);
    }

    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.5) {
        losCache.set(cacheKey, true);
        return true;
    }

    // Ray-cast with 2.0 pixel steps (optimized from 0.5)
    const steps = Math.ceil(dist / 2.0);
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 1; i < steps; i++) {
        const checkX = fromX + stepX * i;
        const checkY = fromY + stepY * i;
        if (isWall(checkX, checkY)) {
            losCache.set(cacheKey, false);
            return false;
        }
    }

    losCache.set(cacheKey, true);
    return true;
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
    const state = getState();
    const cellIdx = c + r * CONFIG.COLS;
    if (cellIdx < 0 || cellIdx >= state.maze.length) return;

    // Create a new maze array with updated walls
    const newMaze = state.maze.map((cell, idx) => {
        // Check if this cell needs wall updates
        const needsUpdate = (
            idx === cellIdx ||
            (wallIdx === 0 && idx === c + (r - 1) * CONFIG.COLS) ||
            (wallIdx === 1 && idx === (c + 1) + r * CONFIG.COLS) ||
            (wallIdx === 2 && idx === c + (r + 1) * CONFIG.COLS) ||
            (wallIdx === 3 && idx === (c - 1) + r * CONFIG.COLS)
        );

        if (!needsUpdate) return cell;

        const newWalls = [...cell.walls];
        if (idx === cellIdx) {
            newWalls[wallIdx] = false;
        } else if (wallIdx === 0 && idx === c + (r - 1) * CONFIG.COLS) {
            newWalls[2] = false;
        } else if (wallIdx === 1 && idx === (c + 1) + r * CONFIG.COLS) {
            newWalls[3] = false;
        } else if (wallIdx === 2 && idx === c + (r + 1) * CONFIG.COLS) {
            newWalls[0] = false;
        } else if (wallIdx === 3 && idx === (c - 1) + r * CONFIG.COLS) {
            newWalls[1] = false;
        }
        return { ...cell, walls: newWalls };
    });

    updateState({ maze: newMaze });
}

export function destroyWallAt(c, r) {
    const state = getState();
    const cellIdx = c + r * CONFIG.COLS;
    if (cellIdx < 0 || cellIdx >= state.maze.length) return;

    // Collect all cells that need updates
    const cellsToUpdate = new Set([cellIdx]);
    if (r > 0) cellsToUpdate.add(c + (r - 1) * CONFIG.COLS);
    if (c < CONFIG.COLS - 1) cellsToUpdate.add((c + 1) + r * CONFIG.COLS);
    if (r < CONFIG.ROWS - 1) cellsToUpdate.add(c + (r + 1) * CONFIG.COLS);
    if (c > 0) cellsToUpdate.add((c - 1) + r * CONFIG.COLS);

    const newMaze = state.maze.map((cell, idx) => {
        if (!cellsToUpdate.has(idx)) return cell;

        const newWalls = [...cell.walls];
        const cellC = idx % CONFIG.COLS;
        const cellR = Math.floor(idx / CONFIG.COLS);

        // If this is the target cell, destroy all interior walls
        if (idx === cellIdx) {
            if (r > 0) newWalls[0] = false;
            if (c < CONFIG.COLS - 1) newWalls[1] = false;
            if (r < CONFIG.ROWS - 1) newWalls[2] = false;
            if (c > 0) newWalls[3] = false;
        }
        // Update neighbor walls
        else if (cellC === c && cellR === r - 1) {
            newWalls[2] = false; // Top neighbor's bottom wall
        }
        else if (cellC === c + 1 && cellR === r) {
            newWalls[3] = false; // Right neighbor's left wall
        }
        else if (cellC === c && cellR === r + 1) {
            newWalls[0] = false; // Bottom neighbor's top wall
        }
        else if (cellC === c - 1 && cellR === r) {
            newWalls[1] = false; // Left neighbor's right wall
        }

        return { ...cell, walls: newWalls };
    });

    updateState({ maze: newMaze });
}

export function createAmmoCrate() {
    let c = Math.floor(seededRandom() * (CONFIG.COLS - 2)) + 1;
    let r = Math.floor(seededRandom() * (CONFIG.ROWS - 2)) + 1;
    return {
        x: CONFIG.MAZE_OFFSET_X + c * CONFIG.CELL_SIZE + 0.5,
        y: r * CONFIG.CELL_SIZE + 0.5,
        c: c,
        r: r
    };
}

export function initMaze(seed = null) {
    // Initialize seeded RNG if seed is provided
    if (seed !== null) {
        setSeed(seed);
    } else {
        setSeed(Math.floor(Math.random() * 0xFFFFFFFF));
    }

    let maze = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS; c++) {
            maze.push(new Cell(c, r));
        }
    }

    function _gridIndex(c, r) {
        if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.ROWS) return undefined;
        return maze[c + r * CONFIG.COLS];
    }
    
    function _removeWalls(a, b) {
        let x = a.c - b.c;
        if (x === 1) { a.walls[3] = false; b.walls[1] = false; }
        if (x === -1) { a.walls[1] = false; b.walls[3] = false; }
        let y = a.r - b.r;
        if (y === 1) { a.walls[0] = false; b.walls[2] = false; }
        if (y === -1) { a.walls[2] = false; b.walls[0] = false; }
    }

    let stack = [];
    let current = maze[0];
    current.visited = true;

    while (true) {
        let neighbors = [];
        let top = _gridIndex(current.c, current.r - 1);
        let right = _gridIndex(current.c + 1, current.r);
        let bottom = _gridIndex(current.c, current.r + 1);
        let left = _gridIndex(current.c - 1, current.r);

        if (top && !top.visited) neighbors.push(top);
        if (right && !right.visited) neighbors.push(right);
        if (bottom && !bottom.visited) neighbors.push(bottom);
        if (left && !left.visited) neighbors.push(left);

        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(seededRandom() * neighbors.length)];
            next.visited = true;
            stack.push(current);
            _removeWalls(current, next);
            current = next;
        } else if (stack.length > 0) {
            current = stack.pop();
        } else {
            break;
        }
    }
    
    const { newMaze, portals } = _spawnPortals(maze);
    maze = newMaze;
    
    const { gameTime, maxGameTime } = _calculateGameTime(maze);

    const newPlayers = [...getState().players];
    newPlayers[0].x = CONFIG.MAZE_OFFSET_X + 1;
    newPlayers[0].y = 1;
    newPlayers[0].goalC = CONFIG.COLS - 1;
    newPlayers[0].goalR = CONFIG.ROWS - 1;
    newPlayers[0].resetState();
    let endX = CONFIG.MAZE_OFFSET_X + ((CONFIG.COLS - 1) * CONFIG.CELL_SIZE) + 1;
    let endY = ((CONFIG.ROWS - 1) * CONFIG.CELL_SIZE) + 1;
    newPlayers[1].x = endX;
    newPlayers[1].y = endY;
    newPlayers[1].goalC = 0;
    newPlayers[1].goalR = 0;
    newPlayers[1].resetState();
    
    updateState({
        maze: maze,
        players: newPlayers,
        portals: portals,
        gameTime: gameTime,
        maxGameTime: maxGameTime,
        isRoundOver: false,
        mines: [],
        particles: [],
        projectiles: [],
        ammoCrate: createAmmoCrate(),
    });
}

function _calculateGameTime(maze) {
    const _gridIndex = (c, r) => {
        if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.ROWS) return undefined;
        return maze[c + r * CONFIG.COLS];
    };
    
    let start = _gridIndex(0, 0);
    let end = _gridIndex(CONFIG.COLS - 1, CONFIG.ROWS - 1);
    
    maze.forEach(c => {
        c.bfsVisited = false;
        c.parent = null;
    });

    let q = [start];
    let head = 0;
    start.bfsVisited = true;
    let len = 0;

    while (head < q.length) {
        let curr = q[head++];
        if (curr === end) {
            while (curr.parent) {
                len++;
                curr = curr.parent;
            }
            break;
        }
        [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]].forEach(d => {
            let n = _gridIndex(curr.c + d[0], curr.r + d[1]);
            if (n && !n.bfsVisited && !curr.walls[d[2]]) {
                n.bfsVisited = true;
                n.parent = curr;
                q.push(n);
            }
        });
    }
    const gameTime = Math.floor((len * CONFIG.CELL_SIZE / (CONFIG.BASE_SPEED * 1.2)) * 6);
    return { gameTime, maxGameTime: gameTime };
}

function _spawnPortals(maze) {
    const state = getState();
    const portals = [];
    const MIN_DIST = 8;
    const MAX_DIST = 18;

    let p1 = { c: Math.floor(CONFIG.COLS / 4), r: Math.floor(CONFIG.ROWS / 4) };
    let attempts = 0;
    while (attempts < 1000) {
        attempts++;
        let c = Math.floor(4 + seededRandom() * ((CONFIG.COLS - 4) / 2));
        let r = Math.floor(4 + seededRandom() * ((CONFIG.ROWS - 4) / 2));
        let dist = Math.hypot(c, r);
        if (dist >= MIN_DIST && dist <= MAX_DIST) {
            p1 = { c, r };
            break;
        }
    }

    let p2 = { c: Math.floor(CONFIG.COLS * 3 / 4), r: Math.floor(CONFIG.ROWS * 3 / 4) };
    attempts = 0;
    while (attempts < 1000) {
        attempts++;
        let c = Math.floor(seededRandom() * (CONFIG.COLS / 2)) + Math.floor(CONFIG.COLS / 2);
        let r = Math.floor(seededRandom() * (CONFIG.ROWS / 2)) + Math.floor(CONFIG.ROWS / 2);
        if (c >= CONFIG.COLS || r >= CONFIG.ROWS) continue;
        let dist = Math.hypot(c - (CONFIG.COLS - 1), r - (CONFIG.ROWS - 1));
        if (dist >= MIN_DIST && dist <= MAX_DIST) {
            p2 = { c, r };
            break;
        }
    }

    portals.push({ c: p1.c, r: p1.r, x: CONFIG.MAZE_OFFSET_X + p1.c * CONFIG.CELL_SIZE + 1.5, y: p1.r * CONFIG.CELL_SIZE + 1.5, color: state.cyanColor });
    portals.push({ c: p2.c, r: p2.r, x: CONFIG.MAZE_OFFSET_X + p2.c * CONFIG.CELL_SIZE + 1.5, y: p2.r * CONFIG.CELL_SIZE + 1.5, color: state.blueColor });

    const newMaze = maze.map(cell => ({ ...cell, walls: [...cell.walls] }));
    
    portals.forEach(p => {
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                _removeWallInMaze(p.c + x, p.r + y, 0, newMaze);
                _removeWallInMaze(p.c + x, p.r + y, 1, newMaze);
                _removeWallInMaze(p.c + x, p.r + y, 2, newMaze);
                _removeWallInMaze(p.c + x, p.r + y, 3, newMaze);
            }
        }
    });

    return { newMaze, portals };
}

function _removeWallInMaze(c, r, wallIdx, maze) {
    const _gridIndex = (c, r) => {
        if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.ROWS) return undefined;
        return maze[c + r * CONFIG.COLS];
    };
    let cell = _gridIndex(c, r);
    if (!cell) return;
    cell.walls[wallIdx] = false;
    if (wallIdx === 0) { let n = _gridIndex(c, r - 1); if (n) n.walls[2] = false; }
    else if (wallIdx === 1) { let n = _gridIndex(c + 1, r); if (n) n.walls[3] = false; }
    else if (wallIdx === 2) { let n = _gridIndex(c, r + 1); if (n) n.walls[0] = false; }
    else if (wallIdx === 3) { let n = _gridIndex(c - 1, r); if (n) n.walls[1] = false; }
}

