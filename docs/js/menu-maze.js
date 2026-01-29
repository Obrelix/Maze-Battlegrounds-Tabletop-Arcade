import { Cell } from './classes.js';
import { setSeed, seededRandom } from './seededRandom.js';

function gridIndex(c, r, cols, maze) {
    if (c < 0 || r < 0 || c >= cols || r >= maze.length / cols) return undefined;
    return maze[c + r * cols];
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

export function generateDecorativeMaze(cols, rows, seed = null) {
    if (seed !== null) {
        setSeed(seed);
    } else {
        setSeed(Math.floor(Math.random() * 0xFFFFFFFF));
    }

    const maze = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            maze.push(new Cell(c, r));
        }
    }

    let stack = [];
    let current = maze[0];
    current.visited = true;

    while (true) {
        let neighbors = [];
        let top = gridIndex(current.c, current.r - 1, cols, maze);
        let right = gridIndex(current.c + 1, current.r, cols, maze);
        let bottom = gridIndex(current.c, current.r + 1, cols, maze);
        let left = gridIndex(current.c - 1, current.r, cols, maze);

        if (top && !top.visited) neighbors.push(top);
        if (right && !right.visited) neighbors.push(right);
        if (bottom && !bottom.visited) neighbors.push(bottom);
        if (left && !left.visited) neighbors.push(left);

        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(seededRandom() * neighbors.length)];
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
    return maze;
}
