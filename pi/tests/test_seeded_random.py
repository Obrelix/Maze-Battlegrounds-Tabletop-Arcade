# pi/tests/test_seeded_random.py
from seeded_random import set_seed, seeded_random


def test_deterministic():
    set_seed(42)
    vals1 = [seeded_random() for _ in range(10)]
    set_seed(42)
    vals2 = [seeded_random() for _ in range(10)]
    assert vals1 == vals2


def test_range():
    set_seed(12345)
    for _ in range(100):
        v = seeded_random()
        assert 0.0 <= v < 1.0


def test_different_seeds_differ():
    set_seed(1)
    a = seeded_random()
    set_seed(2)
    b = seeded_random()
    assert a != b
