import { CONFIG } from '../config.js';
import { getState } from '../state.js';
import { gridIndex, isWall } from '../grid.js';

// Pre-defined directions: [dc, dr, wallIndex]
const DIRECTIONS = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];

/**
 * Simple binary heap for A* priority queue
 * O(log n) push and pop operations instead of O(n) splice
 */
class MinHeap {
  constructor() {
    this.heap = [];
  }

  push(node, priority) {
    this.heap.push({ node, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._bubbleDown(0);
    }
    return min.node;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  _bubbleDown(i) {
    const len = this.heap.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < len && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < len && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

/**
 * Find path from player to target using A* algorithm with Manhattan heuristic
 * Uses binary heap priority queue for O(log n) operations
 * @param {Object} fromPlayer - Player object with x, y, size properties
 * @param {number} targetX - Target X coordinate in pixels
 * @param {number} targetY - Target Y coordinate in pixels
 * @returns {Array} Array of cell objects forming the path, or empty if no path
 */
export function findPathToTarget(fromPlayer, targetX, targetY) {
  const state = getState();
  if (!state.maze || state.maze.length === 0) return [];

  let startC = Math.floor((fromPlayer.x - CONFIG.MAZE_OFFSET_X + (fromPlayer.size / 2)) / CONFIG.CELL_SIZE);
  let startR = Math.floor((fromPlayer.y + (fromPlayer.size / 2)) / CONFIG.CELL_SIZE);
  let endC = Math.floor((targetX - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
  let endR = Math.floor(targetY / CONFIG.CELL_SIZE);

  startC = Math.max(0, Math.min(startC, CONFIG.COLS - 1));
  startR = Math.max(0, Math.min(startR, CONFIG.ROWS - 1));
  endC = Math.max(0, Math.min(endC, CONFIG.COLS - 1));
  endR = Math.max(0, Math.min(endR, CONFIG.ROWS - 1));

  const start = gridIndex(startC, startR);
  const end = gridIndex(endC, endR);

  if (!start || !end) return [];

  // Reset A* state
  for (let i = 0; i < state.maze.length; i++) {
    state.maze[i].gCost = Infinity;
    state.maze[i].parent = null;
  }

  // Manhattan distance heuristic
  const heuristic = (c, r) => Math.abs(c - endC) + Math.abs(r - endR);

  const heap = new MinHeap();
  start.gCost = 0;
  heap.push(start, heuristic(startC, startR));

  while (!heap.isEmpty()) {
    const curr = heap.pop();

    // Found target
    if (curr === end) break;

    // Skip if we've already found a better path to this node
    // (can happen with duplicate entries in heap)
    if (curr.gCost === Infinity) continue;

    for (let i = 0; i < 4; i++) {
      const d = DIRECTIONS[i];
      const nc = curr.c + d[0];
      const nr = curr.r + d[1];
      const neighbor = gridIndex(nc, nr);

      // Check if neighbor is valid and reachable (no wall blocking)
      if (!neighbor || curr.walls[d[2]] || neighbor.walls[(d[2] + 2) % 4]) continue;

      const newG = curr.gCost + 1;
      if (newG < neighbor.gCost) {
        neighbor.gCost = newG;
        neighbor.parent = curr;
        const f = newG + heuristic(nc, nr);
        heap.push(neighbor, f);
      }
    }
  }

  // No path found
  if (end.gCost === Infinity) return [];

  // Reconstruct path
  const path = [];
  let temp = end;
  while (temp) {
    path.push(temp);
    temp = temp.parent;
  }
  return path.reverse();
}

export function isPlayerStuck(player) {
  if (!player.lastPos) return false;
  let dx = Math.abs(player.x - player.lastPos.x);
  let dy = Math.abs(player.y - player.lastPos.y);
  return (dx < 0.3 && dy < 0.3);
}

/**
 * Get a direction to escape when stuck
 * Improved version checks walls and prefers directions opposite to last movement
 * @param {Object} player - Player object with position and lastDir (optional)
 * @returns {{x: number, y: number}} Direction vector to move
 */
export function getUnstuckDirection(player = null) {
  const directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
  ];

  // If no player position, fall back to random shuffle
  if (!player) {
    for (let i = directions.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }
    return directions[0];
  }

  const checkDist = 3; // pixels to check ahead
  const playerCenterX = player.x + (player.size || 3) / 2;
  const playerCenterY = player.y + (player.size || 3) / 2;

  // Filter directions to only wall-free options
  const validDirections = directions.filter(dir => {
    const checkX = playerCenterX + dir.x * checkDist;
    const checkY = playerCenterY + dir.y * checkDist;
    return !isWall(checkX, checkY);
  });

  // If no valid directions, fall back to random (we're trapped)
  if (validDirections.length === 0) {
    return directions[Math.floor(Math.random() * directions.length)];
  }

  // If player has last direction, prefer opposite direction
  if (player.lastDir && (player.lastDir.x !== 0 || player.lastDir.y !== 0)) {
    const lastDirX = player.lastDir.x > 0 ? 1 : (player.lastDir.x < 0 ? -1 : 0);
    const lastDirY = player.lastDir.y > 0 ? 1 : (player.lastDir.y < 0 ? -1 : 0);

    // Score directions: prefer opposite to last movement
    const scored = validDirections.map(dir => {
      let score = 0;
      // Opposite direction bonus
      if (dir.x === -lastDirX && lastDirX !== 0) score += 2;
      if (dir.y === -lastDirY && lastDirY !== 0) score += 2;
      // Perpendicular is also good
      if (dir.x !== 0 && lastDirX === 0) score += 1;
      if (dir.y !== 0 && lastDirY === 0) score += 1;
      // Small random factor to avoid predictability
      score += Math.random() * 0.5;
      return { dir, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].dir;
  }

  // No last direction, pick random from valid
  return validDirections[Math.floor(Math.random() * validDirections.length)];
}
