from ai.pathfinding import MinHeap, find_path_to_target, is_player_stuck
from grid import init_maze
from config import MAZE_OFFSET_X, CELL_SIZE, COLS, ROWS
from classes import Player

def test_min_heap():
    h = MinHeap()
    h.push(5, 'a')
    h.push(1, 'b')
    h.push(3, 'c')
    assert h.pop() == (1, 'b')
    assert h.pop() == (3, 'c')
    assert h.pop() == (5, 'a')

def test_find_path_adjacent():
    maze, _, _, _ = init_maze(seed=42)
    sx = MAZE_OFFSET_X + 1 * CELL_SIZE + 1
    sy = 1 * CELL_SIZE + 1
    tx = MAZE_OFFSET_X + 2 * CELL_SIZE + 1
    ty = 1 * CELL_SIZE + 1
    path = find_path_to_target(maze, sx, sy, tx, ty)
    assert len(path) > 0

def test_find_path_across_maze():
    maze, _, _, _ = init_maze(seed=42)
    sx = MAZE_OFFSET_X + 0 * CELL_SIZE + 1
    sy = 0 * CELL_SIZE + 1
    tx = MAZE_OFFSET_X + (COLS - 1) * CELL_SIZE + 1
    ty = (ROWS - 1) * CELL_SIZE + 1
    path = find_path_to_target(maze, sx, sy, tx, ty)
    assert len(path) > 0

def test_is_player_stuck():
    p = Player(0)
    p.x, p.y = 10, 20
    assert not is_player_stuck(p)
    p.x, p.y = 10, 20
    assert is_player_stuck(p)
    p.x, p.y = 15, 20
    assert not is_player_stuck(p)
