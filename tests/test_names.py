"""Determinism contract: same seed -> same roster, byte for byte.

This is the load-bearing test for the procgen layer. If it breaks, the
'seed-driven worlds' pillar is broken.
"""

from wasteland.procgen.faction_gen import format_roster, generate_demo_roster
from wasteland.procgen.names import (
    cult_name,
    gang_name,
    hold_name,
    leader_name,
    outfit_name,
)
from wasteland.rng import make_rng


def test_hold_name_deterministic_per_seed():
    a = make_rng(42)
    b = make_rng(42)
    assert [hold_name(a) for _ in range(20)] == [hold_name(b) for _ in range(20)]


def test_leader_name_deterministic_per_seed():
    a = make_rng(7)
    b = make_rng(7)
    assert [leader_name(a) for _ in range(20)] == [leader_name(b) for _ in range(20)]


def test_gang_and_cult_and_outfit_deterministic():
    a, b = make_rng(99), make_rng(99)
    assert [gang_name(a) for _ in range(10)] == [gang_name(b) for _ in range(10)]
    a, b = make_rng(99), make_rng(99)
    assert [cult_name(a) for _ in range(10)] == [cult_name(b) for _ in range(10)]
    a, b = make_rng(99), make_rng(99)
    assert [outfit_name(a, "Krin") for _ in range(10)] == [outfit_name(b, "Krin") for _ in range(10)]


def test_different_seeds_produce_different_names():
    # Not a strict guarantee, but with these generators a 50-name sample should
    # always diverge between seeds.
    a = [hold_name(make_rng(1)) for _ in range(50)]
    b = [hold_name(make_rng(2)) for _ in range(50)]
    assert a != b


def test_demo_roster_is_deterministic():
    r1 = generate_demo_roster(seed=12345)
    r2 = generate_demo_roster(seed=12345)
    assert format_roster(r1) == format_roster(r2)


def test_demo_roster_changes_with_seed():
    r1 = generate_demo_roster(seed=12345)
    r2 = generate_demo_roster(seed=67890)
    assert format_roster(r1) != format_roster(r2)


def test_demo_roster_contains_all_eight_archetypes():
    roster = generate_demo_roster(seed=1)
    archetypes = {entry.faction.archetype for entry in roster}
    # All eight archetypes appear; "every faction type playable" at the data layer.
    assert len(archetypes) == 8
