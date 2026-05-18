"""Character generation: schema correctness, stat ranges, role rosters."""

from __future__ import annotations

import random

from wasteland.core.characters import (
    LEADER_PRIMARY_STAT,
    LEADER_ROLE,
    LEADER_ROLES,
    ROSTER,
    STAT_SCHEMA,
    Character,
    CharacterRole,
    roll_character,
)
from wasteland.core.faction import ARCHETYPE_CLASS, Archetype


def test_stat_schema_has_five_stats_per_class():
    for cls, schema in STAT_SCHEMA.items():
        assert len(schema) == 5, f"{cls.value} has {len(schema)} stats, expected 5"
        assert len(set(schema)) == 5, f"{cls.value} has duplicate stats"


def test_every_archetype_has_three_officer_roles():
    for archetype, roster in ROSTER.items():
        assert len(roster) == 3, f"{archetype.value} has {len(roster)} officer roles"


def test_every_officer_primary_stat_is_in_class_schema():
    for archetype, roster in ROSTER.items():
        cls_schema = STAT_SCHEMA[ARCHETYPE_CLASS[archetype]]
        for role, primary in roster:
            assert primary in cls_schema, (
                f"{archetype.value}'s {role.value} primary {primary!r} not in {cls_schema}"
            )


def test_every_archetype_has_a_leader_role():
    for archetype in Archetype:
        assert archetype in LEADER_ROLE
        assert LEADER_ROLE[archetype] in LEADER_ROLES


def test_leader_primary_stat_is_in_class_schema():
    for archetype, primary in LEADER_PRIMARY_STAT.items():
        cls_schema = STAT_SCHEMA[ARCHETYPE_CLASS[archetype]]
        assert primary in cls_schema


def test_rolled_character_stats_clamp_to_range():
    rng = random.Random(0)
    for archetype in Archetype:
        for _ in range(20):
            c = roll_character(rng, archetype, LEADER_ROLE[archetype], "Test")
            for stat, value in c.stats.items():
                assert 10 <= value <= 95, f"{stat}={value} out of [10, 95]"


def test_rolled_character_has_class_schema_keys():
    rng = random.Random(1)
    for archetype in Archetype:
        schema = STAT_SCHEMA[ARCHETYPE_CLASS[archetype]]
        c = roll_character(rng, archetype, LEADER_ROLE[archetype], "Test")
        assert tuple(c.stats.keys()) == schema


def test_leader_skews_high_in_flagship_stat():
    """Over many rolls, leader's flagship-stat mean clears 60 (the design target is ~75)."""
    rng = random.Random(2)
    samples = []
    for _ in range(200):
        c = roll_character(rng, Archetype.BOSS, CharacterRole.BOSS, "Test")
        samples.append(c.stats["authority"])
    mean = sum(samples) / len(samples)
    assert mean >= 60, f"Boss leader Authority mean {mean:.1f} below 60"


def test_officer_primary_stat_skews_higher_than_other_stats():
    """A Steward should be stronger in Industry than in, say, Standing on average."""
    rng = random.Random(3)
    primary_samples = []
    secondary_samples = []
    for _ in range(200):
        c = roll_character(rng, Archetype.BOSS, CharacterRole.STEWARD, "Test")
        primary_samples.append(c.stats["industry"])
        secondary_samples.append(c.stats["standing"])
    p_mean = sum(primary_samples) / len(primary_samples)
    s_mean = sum(secondary_samples) / len(secondary_samples)
    assert p_mean > s_mean + 5, (
        f"Steward Industry mean {p_mean:.1f} not meaningfully > Standing mean {s_mean:.1f}"
    )


def test_character_is_leader_property():
    leader = Character(name="L", role=CharacterRole.BOSS, stats={})
    officer = Character(name="O", role=CharacterRole.STEWARD, stats={})
    assert leader.is_leader is True
    assert officer.is_leader is False
