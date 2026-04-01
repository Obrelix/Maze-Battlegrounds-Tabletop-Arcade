# pi/ai/pathfinding.py
# A* pathfinding for AI, ported from docs/js/ai/pathfinding.js

import math
import random

from config import COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, BASE_SPEED
from grid import grid_index, is_wall

# Pre-defined directions: (dc, dr, wall_index)
_DIRECTIONS = [(0, -1, 0), (1, 0, 1), (0, 1, 2), (-1, 0, 3)]


# ---------------------------------------------------------------------------
# MinHeap — binary heap priority queue (used by A*)
# ---------------------------------------------------------------------------

class MinHeap:
    """
    Binary min-heap.  push(priority, item) / pop() → (priority, item).
    Mirrors the JS MinHeap but uses (priority, item) tuples.
    """

    def __init__(self):
        self._heap = []  # list of [priority, item]

    def push(self, priority, item):
        self._heap.append([priority, item])
        self._bubble_up(len(self._heap) - 1)

    def pop(self):
        if not self._heap:
            return None
        # Swap root with last element, remove last, then sift down
        min_item = self._heap[0]
        last = self._heap.pop()
        if self._heap:
            self._heap[0] = last
            self._bubble_down(0)
        return (min_item[0], min_item[1])

    def is_empty(self):
        return len(self._heap) == 0

    def _bubble_up(self, i):
        while i > 0:
            parent = (i - 1) // 2
            if self._heap[parent][0] <= self._heap[i][0]:
                break
            self._heap[parent], self._heap[i] = self._heap[i], self._heap[parent]
            i = parent

    def _bubble_down(self, i):
        n = len(self._heap)
        while True:
            left = 2 * i + 1
            right = 2 * i + 2
            smallest = i
            if left < n and self._heap[left][0] < self._heap[smallest][0]:
                smallest = left
            if right < n and self._heap[right][0] < self._heap[smallest][0]:
                smallest = right
            if smallest == i:
                break
            self._heap[smallest], self._heap[i] = self._heap[i], self._heap[smallest]
            i = smallest


# ---------------------------------------------------------------------------
# A* path-finding
# ---------------------------------------------------------------------------

def find_path_to_target(maze: list, from_x: float, from_y: float,
                         to_x: float, to_y: float) -> list:
    """
    Find a path through the maze using A* with Manhattan heuristic.

    Parameters
    ----------
    maze   : flat Cell list from init_maze()
    from_x, from_y : start pixel coords
    to_x, to_y     : target pixel coords

    Returns
    -------
    List of Cell objects forming the path (including start), or [] if no path.
    Mirrors JS findPathToTarget().
    """
    if not maze:
        return []

    start_c = int((from_x - MAZE_OFFSET_X) // CELL_SIZE)
    start_r = int(from_y // CELL_SIZE)
    end_c = int((to_x - MAZE_OFFSET_X) // CELL_SIZE)
    end_r = int(to_y // CELL_SIZE)

    start_c = max(0, min(start_c, COLS - 1))
    start_r = max(0, min(start_r, ROWS - 1))
    end_c = max(0, min(end_c, COLS - 1))
    end_r = max(0, min(end_r, ROWS - 1))

    start = grid_index(maze, start_c, start_r)
    end = grid_index(maze, end_c, end_r)

    if start is None or end is None:
        return []

    # Reset A* state on every cell
    for cell in maze:
        cell.gCost = float('inf')
        cell.parent = None

    def heuristic(c, r):
        return abs(c - end_c) + abs(r - end_r)

    heap = MinHeap()
    start.gCost = 0
    heap.push(heuristic(start_c, start_r), start)

    while not heap.is_empty():
        _, curr = heap.pop()

        if curr is end:
            break

        if curr.gCost == float('inf'):
            continue

        for dc, dr, wall_idx in _DIRECTIONS:
            nc = curr.c + dc
            nr = curr.r + dr
            neighbor = grid_index(maze, nc, nr)

            # Skip if wall blocks passage
            if neighbor is None:
                continue
            if curr.walls[wall_idx]:
                continue
            opposite_wall = (wall_idx + 2) % 4
            if neighbor.walls[opposite_wall]:
                continue

            new_g = curr.gCost + 1
            if new_g < neighbor.gCost:
                neighbor.gCost = new_g
                neighbor.parent = curr
                f = new_g + heuristic(nc, nr)
                heap.push(f, neighbor)

    if end.gCost == float('inf'):
        return []

    # Reconstruct path
    path = []
    temp = end
    while temp is not None:
        path.append(temp)
        temp = temp.parent
    path.reverse()
    return path


# ---------------------------------------------------------------------------
# Stuck detection
# ---------------------------------------------------------------------------

def is_player_stuck(player) -> bool:
    """
    Return True if player hasn't moved more than 0.3 px since last_pos.
    Also updates last_pos to the current position for the next call.
    Mirrors JS isPlayerStuck() — note that in the original JS, last_pos is
    updated at the end of getCpuInput; here we do it in the check so the
    standalone function is self-contained for tests.
    """
    last = getattr(player, 'last_pos', None)
    if last is None:
        player.last_pos = {'x': player.x, 'y': player.y}
        return False
    dx = abs(player.x - last.get('x', player.x))
    dy = abs(player.y - last.get('y', player.y))
    stuck = dx < 0.3 and dy < 0.3
    # Update last_pos so subsequent calls reflect the latest position
    player.last_pos = {'x': player.x, 'y': player.y}
    return stuck


def get_unstuck_direction(maze: list, player=None) -> dict:
    """
    Return a direction dict {x, y} to escape when stuck.
    Prefers wall-free directions and the opposite of last movement.
    Mirrors JS getUnstuckDirection().
    """
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

    # Prefer opposite of last direction
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
