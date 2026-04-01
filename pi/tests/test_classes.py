# pi/tests/test_classes.py
from classes import Cell, Camera, Player
from config import MAX_MINES, MAX_ENERGY, TIMING


def test_cell_init():
    c = Cell(3, 5)
    assert c.c == 3
    assert c.r == 5
    assert c.walls == [True, True, True, True]
    assert c.visited is False


def test_camera_shake():
    cam = Camera()
    cam.shake(10.0)
    assert cam.shake_strength == 10.0
    cam.update()
    assert cam.shake_strength < 10.0
    for _ in range(100):
        cam.update()
    assert cam.shake_strength == 0.0
    assert cam.x == 0.0 and cam.y == 0.0


def test_player_init():
    p = Player(0, 'TST')
    assert p.id == 0
    assert p.name == 'TST'
    assert p.mines_left == MAX_MINES
    assert p.boost_energy == MAX_ENERGY
    assert p.is_dead is False


def test_player_reset():
    p = Player(0)
    p.score = 3
    p.mines_left = 0
    p.is_dead = True
    p.reset_state()
    assert p.mines_left == MAX_MINES
    assert p.is_dead is False
    assert p.score == 3  # score NOT reset


def test_player_stun():
    p = Player(0)
    p.stun_start_time = 100
    assert p.stun_is_active(150)
    assert not p.stun_is_active(200)


def test_player_glitch():
    p = Player(0)
    p.glitch_start_time = 100
    assert p.glitch_is_active(200)
    assert not p.glitch_is_active(300)


def test_player_charge_ready():
    p = Player(0)
    p.charge_start_time = 0
    assert not p.charge_is_ready(100)
    assert p.charge_is_ready(180)
    assert p.charge_is_ready(200)
