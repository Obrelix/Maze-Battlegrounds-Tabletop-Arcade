# pi/ai/pathfinding.py
# Fast BFS pathfinding for AI, ported from docs/js/ai/pathfinding.js
# Optimised: uses flat arrays and deque instead of A* with MinHeap.

import math
import random
from collections import deque

from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, BASE_SPEED
from grid import is_wall

# Pre-defined directions: (dc, dr, wall_index)
_DIRECTIONS = ((0, -1, 0), (1, 0, 1), (0, 1, 2), (-1, 0, 3))
_TOTAL_CELLS = COLS * ROWS

# Reusable flat arrays — avoids allocation every call
_visited = bytearray(_TOTAL_CELLS)
_parent = [-1] * _TOTAL_CELLS


class MinHeap:
    """Binary min-heap kept for test compatibility."""

    def __init__(self):
        self._heap = []

    def push(self, priority, item):
        self._heap.append([priority, item])
        self._bubble_up(len(self._heap) - 1)

    def pop(self):
        if not self._heap:
            return None
        min_item = self._heap[0]
        last = self._heap.pop()
        if self._heap:
            self._heap[0] = last
            self._bubble_down(0)
        return (min_item[0], min_item[1])

    def is_empty(self):
        return len(self._heap) == 0

    def _bubble_up(self, i):
        h = self._heap
        while i > 0:
            parent = (i - 1) // 2
            if h[parent][0] <= h[i][0]:
                break
            h[parent], h[i] = h[i], h[parent]
            i = parent

    def _bubble_down(self, i):
        h = self._heap
        n = len(h)
        while True:
            left = 2 * i + 1
            right = 2 * i + 2
            smallest = i
            if left < n and h[left][0] < h[smallest][0]:
                smallest = left
            if right < n and h[right][0] < h[smallest][0]:
                smallest = right
            if smallest == i:
                break
            h[smallest], h[i] = h[i], h[smallest]
            i = smallest


# ---------------------------------------------------------------------------
# Fast BFS path-finding
# ---------------------------------------------------------------------------

def find_path_to_target(maze: list, from_x: float, from_y: float,
                         to_x: float, to_y: float) -> list:
    """
    Find shortest path through maze using BFS (unweighted grid).

    Returns list of Cell objects forming the path (including start), or [].
    """
    if not maze:
        return []

    sc = int((from_x - MAZE_OFFSET_X) // CELL_SIZE)
    sr = int(from_y // CELL_SIZE)
    ec = int((to_x - MAZE_OFFSET_X) // CELL_SIZE)
    er = int(to_y // CELL_SIZE)

    sc = max(0, min(sc, COLS - 1))
    sr = max(0, min(sr, ROWS - 1))
    ec = max(0, min(ec, COLS - 1))
    er = max(0, min(er, ROWS - 1))

    start_idx = sc + sr * COLS
    end_idx = ec + er * COLS

    if start_idx == end_idx:
        return [maze[start_idx]]

    # Reset only the cells we'll visit (clear all with memset-like ops)
    visited = _visited
    parent = _parent
    for i in range(_TOTAL_CELLS):
        visited[i] = 0
        parent[i] = -1

    visited[start_idx] = 1
    queue = deque()
    queue.append(start_idx)
    found = False

    while queue:
        ci = queue.popleft()
        if ci == end_idx:
            found = True
            break

        cell = maze[ci]
        cc = cell.c
        cr = cell.r

        for dc, dr, wall_idx in _DIRECTIONS:
            nc = cc + dc
            nr = cr + dr
            if nc < 0 or nc >= COLS or nr < 0 or nr >= ROWS:
                continue
            ni = nc + nr * COLS
            if visited[ni]:
                continue
            if cell.walls[wall_idx]:
                continue
            neighbor = maze[ni]
            if neighbor.walls[(wall_idx + 2) & 3]:
                continue
            visited[ni] = 1
            parent[ni] = ci
            queue.append(ni)

    if not found:
        return []

    # Reconstruct path
    path = []
    idx = end_idx
    while idx != -1:
        path.append(maze[idx])
        idx = parent[idx]
    path.reverse()
    return path


# ---------------------------------------------------------------------------
# Stuck detection
# ---------------------------------------------------------------------------

def is_player_stuck(player) -> bool:
    """Return True if player hasn't moved more than 0.3 px since last check."""
    last = getattr(player, 'last_pos', None)
    if last is None:
        player.last_pos = {'x': player.x, 'y': player.y}
        return False
    dx = abs(player.x - last.get('x', player.x))
    dy = abs(player.y - last.get('y', player.y))
    stuck = dx < 0.3 and dy < 0.3
    player.last_pos = {'x': player.x, 'y': player.y}
    return stuck


def get_unstuck_direction(maze: list, player=None) -> dict:
    """Return a direction dict {x, y} to escape when stuck."""
    directions = [
        {'x': 1, 'y': 0}, {'x': -1, 'y': 0},
        {'x': 0, 'y': 1}, {'x': 0, 'y': -1},
        {'x': 1, 'y': 1}, {'x': -1, 'y': 1},
        {'x': 1, 'y': -1}, {'x': -1, 'y': -1},
    ]

    if player is None:
        random.shuffle(directions)
        return directions[0]

    check_dist = 3
    size = getattr(player, 'size', 2.0)
    cx = player.x + size / 2
    cy = player.y + size / 2

    valid = []
    for d in directions:
        check_x = cx + d['x'] * check_dist
        check_y = cy + d['y'] * check_dist
        if not is_wall(maze, check_x, check_y):
            valid.append(d)

    if not valid:
        return directions[random.randint(0, len(directions) - 1)]

    last_dir = getattr(player, 'last_dir', None) or {'x': 0, 'y': 0}
    ldx = last_dir.get('x', 0)
    ldy = last_dir.get('y', 0)

    if ldx != 0 or ldy != 0:
        last_dx = 1 if ldx > 0 else (-1 if ldx < 0 else 0)
        last_dy = 1 if ldy > 0 else (-1 if ldy < 0 else 0)

        scored = []
        for d in valid:
            score = 0
            if d['x'] == -last_dx and last_dx != 0:
                score += 2
            if d['y'] == -last_dy and last_dy != 0:
                score += 2
            if d['x'] != 0 and last_dx == 0:
                score += 1
            if d['y'] != 0 and last_dy == 0:
                score += 1
            score += random.random() * 0.5
            scored.append((score, d))
        scored.sort(key=lambda t: t[0], reverse=True)
        return scored[0][1]

    return valid[random.randint(0, len(valid) - 1)]
