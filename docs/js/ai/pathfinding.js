import { CONFIG } from '../config.js';
import { STATE } from '../state.js';
import { gridIndex } from '../grid.js';

// Pre-defined directions: [dc, dr, wallIndex]
const DIRECTIONS = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];

/**
 * Find path from player to target using BFS with heuristic ordering
 * @param {Object} fromPlayer - Player object with x, y, size properties
 * @param {number} targetX - Target X coordinate in pixels
 * @param {number} targetY - Target Y coordinate in pixels
 * @returns {Array} Array of cell objects forming the path, or empty if no path
 */
export function findPathToTarget(fromPlayer, targetX, targetY) {
  if (!STATE.maze || STATE.maze.length === 0) return [];

  let startC = Math.floor((fromPlayer.x - CONFIG.MAZE_OFFSET_X + (fromPlayer.size / 2)) / CONFIG.CELL_SIZE);
  let startR = Math.floor((fromPlayer.y + (fromPlayer.size / 2)) / CONFIG.CELL_SIZE);
  let endC = Math.floor((targetX - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
  let endR = Math.floor(targetY / CONFIG.CELL_SIZE);

  startC = Math.max(0, Math.min(startC, CONFIG.COLS - 1));
  startR = Math.max(0, Math.min(startR, CONFIG.ROWS - 1));
  endC = Math.max(0, Math.min(endC, CONFIG.COLS - 1));
  endR = Math.max(0, Math.min(endR, CONFIG.ROWS - 1));

  let start = gridIndex(startC, startR);
  let end = gridIndex(endC, endR);

  if (!start || !end) return [];

  // Reset BFS state
  for (let i = 0; i < STATE.maze.length; i++) {
    STATE.maze[i].bfsVisited = false;
    STATE.maze[i].parent = null;
  }

  let queue = [start];
  let head = 0;
  start.bfsVisited = true;
  let found = false;

  while (head < queue.length) {
    let curr = queue[head++];
    if (curr === end) {
      found = true;
      break;
    }

    // Process directions with heuristic priority (no sort - use inline comparison)
    // Calculate which direction moves us closer to target
    let dcToEnd = endC - curr.c;
    let drToEnd = endR - curr.r;

    // Process directions in heuristic order based on target direction
    for (let i = 0; i < 4; i++) {
      // Prioritize direction that aligns with target
      let d = DIRECTIONS[i];
      let alignScore = d[0] * dcToEnd + d[1] * drToEnd;

      // Skip if this direction moves away from target and other options exist
      // (simple heuristic - still visits all valid neighbors)
      let n = gridIndex(curr.c + d[0], curr.r + d[1]);
      if (n && !n.bfsVisited && !curr.walls[d[2]] && !n.walls[(d[2] + 2) % 4]) {
        n.bfsVisited = true;
        n.parent = curr;
        // Insert with priority: neighbors closer to target go first
        if (alignScore > 0) {
          // This direction moves toward target - add to front of remaining queue
          queue.splice(head, 0, n);
        } else {
          queue.push(n);
        }
      }
    }
  }

  if (!found) return [];

  let path = [];
  let temp = end;
  while (temp) {
    path.push(temp);
    temp = temp.parent;
  }
  path.reverse();
  return path;
}

export function isPlayerStuck(player) {
  if (!player.lastPos) return false;
  let dx = Math.abs(player.x - player.lastPos.x);
  let dy = Math.abs(player.y - player.lastPos.y);
  return (dx < 0.3 && dy < 0.3);
}

export function getUnstuckDirection() {
  let directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
  ];
  for (let i = directions.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }
  return directions[0];
}
