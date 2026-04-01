# pi/tests/test_config.py
from config import (
    LOGICAL_W, LOGICAL_H, CELL_SIZE, COLS, ROWS, MAZE_OFFSET_X,
    MAX_ENERGY, COLORS, BITMAP_FONT, DIGIT_MAP, hex_to_rgb, hsl_to_rgb,
    TIMING, ENERGY_COSTS, COLLISION
)


def test_display_dimensions():
    assert LOGICAL_W == 128
    assert LOGICAL_H == 64
    assert CELL_SIZE == 3
    assert COLS == 37
    assert ROWS == 21


def test_maze_fits_display():
    maze_width = COLS * CELL_SIZE + MAZE_OFFSET_X * 2
    maze_height = ROWS * CELL_SIZE
    assert maze_width <= LOGICAL_W + MAZE_OFFSET_X
    assert maze_height <= LOGICAL_H


def test_colors_have_rgb():
    for c in COLORS:
        assert len(c.rgb) == 3
        assert all(0 <= v <= 255 for v in c.rgb)


def test_bitmap_font_dimensions():
    for char, bits in BITMAP_FONT.items():
        assert len(bits) == 15, f"Char '{char}' has {len(bits)} bits, expected 15"
        assert all(b in (0, 1) for b in bits)


def test_digit_map_dimensions():
    for digit, bits in DIGIT_MAP.items():
        assert len(bits) == 15
        assert all(b in (0, 1) for b in bits)


def test_hex_to_rgb():
    assert hex_to_rgb('#ff0000') == (255, 0, 0)
    assert hex_to_rgb('#00ff00') == (0, 255, 0)
    assert hex_to_rgb('#0000ff') == (0, 0, 255)
    assert hex_to_rgb('#ff0000ff') == (255, 0, 0)


def test_hsl_to_rgb():
    r, g, b = hsl_to_rgb(0, 100, 50)
    assert r == 255 and g == 0 and b == 0


def test_timing_values():
    assert TIMING.CHARGE_DURATION == 180
    assert TIMING.STUN_DURATION == 90
    assert TIMING.MINE_ARM_TIME == 60


def test_energy_costs():
    assert ENERGY_COSTS.BEAM == 30
    assert ENERGY_COSTS.CHARGED_BEAM == 65


def test_collision_constants():
    assert COLLISION.HITBOX_SIZE == 0.8
    assert COLLISION.DEATH_TIMER_FRAMES == 50
