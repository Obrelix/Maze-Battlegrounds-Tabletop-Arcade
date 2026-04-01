# pi/tests/test_grid.py
from grid import init_maze, is_wall, grid_index, has_line_of_sight, create_ammo_crate
from config import COLS, ROWS, MAZE_OFFSET_X, CELL_SIZE


def test_maze_size():
    maze, portals, gt, mgt = init_maze(seed=42)
    assert len(maze) == COLS * ROWS


def test_all_cells_visited():
    maze, _, _, _ = init_maze(seed=42)
    for cell in maze:
        assert cell.visited, f"Cell ({cell.c}, {cell.r}) not visited"


def test_perfect_maze():
    maze, _, _, _ = init_maze(seed=42)
    total_cells = COLS * ROWS
    passages = 0
    for cell in maze:
        if not cell.walls[1]: passages += 1
        if not cell.walls[2]: passages += 1
    assert passages >= total_cells - 1


def test_deterministic():
    m1, p1, gt1, _ = init_maze(seed=123)
    m2, p2, gt2, _ = init_maze(seed=123)
    for i in range(len(m1)):
        assert m1[i].walls == m2[i].walls
    assert gt1 == gt2


def test_different_seeds():
    m1, _, _, _ = init_maze(seed=1)
    m2, _, _, _ = init_maze(seed=2)
    differs = any(m1[i].walls != m2[i].walls for i in range(len(m1)))
    assert differs


def test_portals_spawned():
    _, portals, _, _ = init_maze(seed=42)
    assert len(portals) == 2
    for p in portals:
        assert 'x' in p and 'y' in p and 'c' in p and 'r' in p


def test_game_time_positive():
    _, _, gt, mgt = init_maze(seed=42)
    assert gt > 0
    assert mgt > 0


def test_is_wall_boundaries():
    maze, _, _, _ = init_maze(seed=42)
    assert is_wall(maze, MAZE_OFFSET_X - 1, 10)
    assert is_wall(maze, 128 - MAZE_OFFSET_X, 10)
    assert is_wall(maze, 64, -1)


def test_is_wall_cell_interior():
    maze, _, _, _ = init_maze(seed=42)
    px = MAZE_OFFSET_X + 1 * CELL_SIZE + 1
    py = 1 * CELL_SIZE + 1
    assert not is_wall(maze, px, py)


def test_grid_index():
    maze, _, _, _ = init_maze(seed=42)
    cell = grid_index(maze, 0, 0)
    assert cell is not None
    assert cell.c == 0 and cell.r == 0
    assert grid_index(maze, -1, 0) is None
    assert grid_index(maze, COLS, 0) is None


def test_ammo_crate():
    maze, _, _, _ = init_maze(seed=42)
    crate = create_ammo_crate(maze)
    assert 'x' in crate and 'y' in crate
    assert 1 <= crate['c'] <= COLS - 3
    assert 1 <= crate['r'] <= ROWS - 3
