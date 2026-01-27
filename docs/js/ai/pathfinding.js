import { CONFIG } from '../config.js';
import { STATE } from '../state.js';
import { gridIndex } from '../grid.js';

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

  STATE.maze.forEach(c => {
    c.bfsVisited = false;
    c.parent = null;
  });

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

    let dirs = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
    dirs.sort((a, b) => {
      let distA = Math.abs((curr.c + a[0]) - endC) + Math.abs((curr.r + a[1]) - endR);
      let distB = Math.abs((curr.c + b[0]) - endC) + Math.abs((curr.r + b[1]) - endR);
      return distA - distB;
    });

    dirs.forEach(d => {
      let n = gridIndex(curr.c + d[0], curr.r + d[1]);
      if (n && !n.bfsVisited && !curr.walls[d[2]] && !n.walls[(d[2] + 2) % 4]) {
        n.bfsVisited = true;
        n.parent = curr;
        queue.push(n);
      }
    });
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
