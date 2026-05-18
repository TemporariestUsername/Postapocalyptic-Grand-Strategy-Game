"""Building yields + condition behavior."""

from __future__ import annotations

from wasteland.core.buildings import Building, BuildingType


def test_yield_at_full_condition_matches_base():
    b = Building(type=BuildingType.GRANARY, owner_faction_idx=0)
    assert b.yield_now() == {"stock": 2}


def test_yield_scales_with_condition():
    b = Building(type=BuildingType.GRANARY, owner_faction_idx=0, condition=50)
    # 2 * 1 * 50 / 100 = 1.0 -> 1
    assert b.yield_now() == {"stock": 1}


def test_yield_zero_below_threshold():
    b = Building(type=BuildingType.GRANARY, owner_faction_idx=0, condition=40)
    # 2 * 1 * 40 / 100 = 0.8 -> 0 (integer floor)
    assert b.yield_now() == {"stock": 0}


def test_yield_scales_with_level():
    b = Building(type=BuildingType.SHRINE, owner_faction_idx=0, level=2)
    # 1 * 2 * 100 / 100 = 2
    assert b.yield_now() == {"followers": 2}


def test_tavern_yields_juice_and_secrets():
    b = Building(type=BuildingType.TAVERN, owner_faction_idx=0)
    assert b.yield_now() == {"juice": 1, "secrets": 1}
