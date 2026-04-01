# pi/grid.py
# Maze generation and wall queries — ported faithfully from docs/js/grid.js
# Source of truth: docs/js/grid.js

import math
from config import (
    COLS, ROWS, CELL_SIZE, MAZE_OFFSET_X, LOGICAL_W, LOGICAL_H, BASE_SPEED
)
from classes import Cell
from seeded_random import set_seed, seeded_random

# ---------------------------------------------------------------------------
# Line-of-sight cache (per-frame)
# ---------------------------------------------------------------------------
_los_cache: dict = {}
_los_cache_frame: int = -1


def clear_los_cache(frame_count: int) -> None:
    """Clear the LoS cache when the frame changes (call once per frame)."""
    global _los_cache, _los_cache_frame
    if _los_cache_frame != frame_count:
        _los_cache = {}
        _los_cache_frame = frame_count


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def grid_index(maze: list, c: int, r: int):
    """Return the Cell at (c, r), or None if out of bounds."""
    if c < 0 or r < 0 or c >= COLS or r >= ROWS:
        return None
    return maze[c + r * COLS]


def is_wall(maze: list, pixel_x: float, pixel_y: float) -> bool:
    """Return True if the given pixel coordinate is inside a wall."""
    if pixel_x < MAZE_OFFSET_X or pixel_x >= LOGICAL_W - MAZE_OFFSET_X:
        return True
    if pixel_y < 0 or pixel_y >= LOGICAL_H:
        return True

    mx = pixel_x - MAZE_OFFSET_X
    cell = grid_index(maze, int(mx) // CELL_SIZE, int(pixel_y) // CELL_SIZE)

    if cell is None:
        return True

    lx = int(mx) % CELL_SIZE
    ly = int(pixel_y) % CELL_SIZE

    if lx == 0 and ly == 0:
        return True
    if ly == 0 and cell.walls[0]:
        return True
    if lx == 0 and cell.walls[3]:
        return True
    return False


def has_line_of_sight(
    maze: list,
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    frame_count: int,
) -> bool:
    """
    Ray-cast line-of-sight check with per-frame cache.
    Returns True if the path between the two points is clear (no walls).
    """
    global _los_cache, _los_cache_frame

    # Refresh cache if on a new frame
    if _los_cache_frame != frame_count:
        _los_cache = {}
        _los_cache_frame = frame_count

    fx = round(from_x)
    fy = round(from_y)
    tx = round(to_x)
    ty = round(to_y)

    cache_key = (fx, fy, tx, ty)
    if cache_key in _los_cache:
        return _los_cache[cache_key]

    dx = to_x - from_x
    dy = to_y - from_y
    dist = math.hypot(dx, dy)

    if dist < 0.5:
        _los_cache[cache_key] = True
        return True

    steps = math.ceil(dist / 2.0)
    step_x = dx / steps
    step_y = dy / steps

    for i in range(1, steps):
        check_x = from_x + step_x * i
        check_y = from_y + step_y * i
        if is_wall(maze, check_x, check_y):
            _los_cache[cache_key] = False
            return False

    _los_cache[cache_key] = True
    return True


def destroy_wall_at(maze: list, c: int, r: int) -> None:
    """Destroy all walls of a cell and update neighbors (mutates maze in place)."""
    cell_idx = c + r * COLS
    if cell_idx < 0 or cell_idx >= len(maze):
        return

    target = maze[cell_idx]

    # Remove all walls from the target cell (only interior ones — skip map edges)
    if r > 0:
        target.walls[0] = False
    if c < COLS - 1:
        target.walls[1] = False
    if r < ROWS - 1:
        target.walls[2] = False
    if c > 0:
        target.walls[3] = False

    # Update neighbor walls
    if r > 0:
        n = maze[c + (r - 1) * COLS]
        n.walls[2] = False  # top neighbor's south wall
    if c < COLS - 1:
        n = maze[(c + 1) + r * COLS]
        n.walls[3] = False  # right neighbor's west wall
    if r < ROWS - 1:
        n = maze[c + (r + 1) * COLS]
        n.walls[0] = False  # bottom neighbor's north wall
    if c > 0:
        n = maze[(c - 1) + r * COLS]
        n.walls[1] = False  # left neighbor's east wall


def create_ammo_crate(maze: list) -> dict:
    """Return a random ammo crate position within the inner grid area."""
    c = int(seeded_random() * (COLS - 2)) + 1
    r = int(seeded_random() * (ROWS - 2)) + 1
    return {
        'x': MAZE_OFFSET_X + c * CELL_SIZE + 0.5,
        'y': r * CELL_SIZE + 0.5,
        'c': c,
        'r': r,
    }


def init_maze(seed=None):
    """
    Generate a maze using recursive backtracking.

    Returns (maze, portals, game_time, max_game_time).
    """
    if seed is not None:
        set_seed(seed)
    else:
        import random as _random
        set_seed(_random.randint(0, 0xFFFFFFFF))

    # Build grid
    maze = []
    for r in range(ROWS):
        for c in range(COLS):
            maze.append(Cell(c, r))

    # ---------------------------------------------------------------------------
    # Recursive backtracking maze generation
    # ---------------------------------------------------------------------------
    def _local_grid_index(c, r):
        if c < 0 or r < 0 or c >= COLS or r >= ROWS:
            return None
        return maze[c + r * COLS]

    def _remove_walls(a: Cell, b: Cell) -> None:
        x = a.c - b.c
        if x == 1:
            a.walls[3] = False
            b.walls[1] = False
        if x == -1:
            a.walls[1] = False
            b.walls[3] = False
        y = a.r - b.r
        if y == 1:
            a.walls[0] = False
            b.walls[2] = False
        if y == -1:
            a.walls[2] = False
            b.walls[0] = False

    stack = []
    current = maze[0]
    current.visited = True

    while True:
        neighbors = []
        top    = _local_grid_index(current.c, current.r - 1)
        right  = _local_grid_index(current.c + 1, current.r)
        bottom = _local_grid_index(current.c, current.r + 1)
        left   = _local_grid_index(current.c - 1, current.r)

        if top    and not top.visited:    neighbors.append(top)
        if right  and not right.visited:  neighbors.append(right)
        if bottom and not bottom.visited: neighbors.append(bottom)
        if left   and not left.visited:   neighbors.append(left)

        if neighbors:
            nxt = neighbors[int(seeded_random() * len(neighbors))]
            nxt.visited = True
            stack.append(current)
            _remove_walls(current, nxt)
            current = nxt
        elif stack:
            current = stack.pop()
        else:
            break

    # Spawn portals and clear walls around them
    maze, portals = _spawn_portals(maze)

    # Calculate round duration via BFS shortest path
    game_time, max_game_time = _calculate_game_time(maze)

    return maze, portals, game_time, max_game_time


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _remove_wall_in_maze(maze: list, c: int, r: int, wall_idx: int) -> None:
    """Remove a wall from cell (c, r) and update the neighbor's opposite wall."""
    def _gi(cc, rr):
        if cc < 0 or rr < 0 or cc >= COLS or rr >= ROWS:
            return None
        return maze[cc + rr * COLS]

    cell = _gi(c, r)
    if cell is None:
        return
    cell.walls[wall_idx] = False

    if wall_idx == 0:
        n = _gi(c, r - 1)
        if n:
            n.walls[2] = False
    elif wall_idx == 1:
        n = _gi(c + 1, r)
        if n:
            n.walls[3] = False
    elif wall_idx == 2:
        n = _gi(c, r + 1)
        if n:
            n.walls[0] = False
    elif wall_idx == 3:
        n = _gi(c - 1, r)
        if n:
            n.walls[1] = False


def _spawn_portals(maze: list):
    """
    Spawn two portals and clear 3x3 walls around each.
    Returns (new_maze, portals).
    """
    portals = []
    MIN_DIST = 8
    MAX_DIST = 18

    # Portal 1 — upper-left quadrant
    p1 = {'c': COLS // 4, 'r': ROWS // 4}
    attempts = 0
    while attempts < 1000:
        attempts += 1
        c = int(4 + seeded_random() * ((COLS - 4) / 2))
        r = int(4 + seeded_random() * ((ROWS - 4) / 2))
        dist = math.hypot(c, r)
        if MIN_DIST <= dist <= MAX_DIST:
            p1 = {'c': c, 'r': r}
            break

    # Portal 2 — lower-right quadrant
    p2 = {'c': (COLS * 3) // 4, 'r': (ROWS * 3) // 4}
    attempts = 0
    while attempts < 1000:
        attempts += 1
        c = int(seeded_random() * (COLS / 2)) + COLS // 2
        r = int(seeded_random() * (ROWS / 2)) + ROWS // 2
        if c >= COLS or r >= ROWS:
            continue
        dist = math.hypot(c - (COLS - 1), r - (ROWS - 1))
        if MIN_DIST <= dist <= MAX_DIST:
            p2 = {'c': c, 'r': r}
            break

    portals.append({
        'c': p1['c'], 'r': p1['r'],
        'x': MAZE_OFFSET_X + p1['c'] * CELL_SIZE + 1.5,
        'y': p1['r'] * CELL_SIZE + 1.5,
    })
    portals.append({
        'c': p2['c'], 'r': p2['r'],
        'x': MAZE_OFFSET_X + p2['c'] * CELL_SIZE + 1.5,
        'y': p2['r'] * CELL_SIZE + 1.5,
    })

    # Clear 3x3 area around each portal
    for p in portals:
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                for wall_idx in range(4):
                    _remove_wall_in_maze(maze, p['c'] + dx, p['r'] + dy, wall_idx)

    return maze, portals


def _calculate_game_time(maze: list):
    """
    BFS from (0,0) to (COLS-1, ROWS-1) to get shortest path length.
    Returns (game_time, max_game_time) as frame counts.
    """
    def _gi(c, r):
        if c < 0 or r < 0 or c >= COLS or r >= ROWS:
            return None
        return maze[c + r * COLS]

    start = _gi(0, 0)
    end   = _gi(COLS - 1, ROWS - 1)

    # Reset BFS state
    for cell in maze:
        cell.bfs_visited = False
        cell.parent = None

    q = [start]
    head = 0
    start.bfs_visited = True
    path_len = 0

    while head < len(q):
        curr = q[head]
        head += 1
        if curr is end:
            # Trace back to count path length
            tmp = curr
            while tmp.parent is not None:
                path_len += 1
                tmp = tmp.parent
            break

        # Directions: [dc, dr, wall_idx]
        for dc, dr, wall_idx in ((0, -1, 0), (1, 0, 1), (0, 1, 2), (-1, 0, 3)):
            n = _gi(curr.c + dc, curr.r + dr)
            if n and not n.bfs_visited and not curr.walls[wall_idx]:
                n.bfs_visited = True
                n.parent = curr
                q.append(n)

    game_time = int((path_len * CELL_SIZE / (BASE_SPEED * 1.2)) * 6)
    return game_time, game_time
