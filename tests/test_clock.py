import pytest

from wasteland.core.clock import Clock


def test_clock_starts_empty():
    c = Clock("raid", segments=4)
    assert c.filled == 0
    assert c.remaining == 4
    assert not c.is_full


def test_advance_returns_true_only_on_the_tick_that_fills():
    c = Clock("raid", segments=4)
    assert c.advance(1) is False
    assert c.advance(1) is False
    assert c.advance(2) is True   # this tick filled it
    assert c.advance(1) is False  # already full
    assert c.is_full


def test_advance_clamps_to_segments():
    c = Clock("schism", segments=6)
    c.advance(100)
    assert c.filled == 6
    assert c.is_full


def test_reset_clears_progress():
    c = Clock("eviction", segments=8, filled=5)
    c.reset()
    assert c.filled == 0
    assert not c.is_full


def test_invalid_construction_rejected():
    with pytest.raises(ValueError):
        Clock("bad", segments=0)
    with pytest.raises(ValueError):
        Clock("bad", segments=4, filled=-1)


def test_negative_advance_rejected():
    c = Clock("raid", segments=4)
    with pytest.raises(ValueError):
        c.advance(-1)
