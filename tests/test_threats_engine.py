"""Threat advancement + firing consequences."""

from __future__ import annotations

import random

from wasteland.core.clock import Clock
from wasteland.core.faction import Archetype
from wasteland.engine.threats import advance_threats, player_threats
from wasteland.procgen.threats import Threat, ThreatKind
from wasteland.procgen.world_gen import generate_world


def _world_with_threat(kind: ThreatKind, segments: int, filled: int, target_is_player=True):
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    pidx = w.player_idx
    # Use a rival as the source; the player as the target (or vice versa).
    other = next(i for i in range(len(w.factions)) if i != pidx)
    src, tgt = (other, pidx) if target_is_player else (pidx, other)
    w.threats.threats = [
        Threat(source_idx=src, target_idx=tgt,
               clock=Clock(label="test front", segments=segments, filled=filled), kind=kind)
    ]
    return w


def test_advance_ticks_clock_without_firing():
    w = _world_with_threat(ThreatKind.RAID, segments=4, filled=0)
    entries = advance_threats(w, random.Random(0))
    assert w.threats.threats[0].clock.filled == 1
    assert entries == []  # nothing fired


def test_advance_fires_and_resets_on_fill():
    w = _world_with_threat(ThreatKind.RAID, segments=4, filled=3)
    entries = advance_threats(w, random.Random(0))
    # Filled to 4 -> fires -> resets to 0.
    assert w.threats.threats[0].clock.filled == 0
    assert any("test front" in e.text for e in entries)


def test_raid_takes_walls_first_then_stock():
    w = _world_with_threat(ThreatKind.RAID, segments=4, filled=3)
    p = w.player
    p.resources["walls"] = 3
    p.resources["stock"] = 5
    advance_threats(w, random.Random(0))
    # Walls present: lose 1 Wall + 1 Stock, not the deeper hit.
    assert p.resources["walls"] == 2
    assert p.resources["stock"] == 4


def test_raid_without_walls_burns_stock_and_barter():
    w = _world_with_threat(ThreatKind.RAID, segments=4, filled=3)
    p = w.player
    p.resources["walls"] = 0
    p.resources["stock"] = 5
    p.resources["barter"] = 5
    advance_threats(w, random.Random(0))
    assert p.resources["stock"] == 3   # -2
    assert p.resources["barter"] == 4  # -1


def test_march_grinds_walls_then_people():
    w = _world_with_threat(ThreatKind.MARCH, segments=4, filled=3)
    p = w.player
    p.resources["walls"] = 1
    p.resources["people"] = 5
    advance_threats(w, random.Random(0))
    # Walls present -> -2 Walls (floored at 0), People untouched this time.
    assert p.resources["walls"] == 0
    assert p.resources["people"] == 5


def test_extort_bleeds_barter():
    w = _world_with_threat(ThreatKind.EXTORT, segments=6, filled=5)
    p = w.player
    p.resources["barter"] = 5
    advance_threats(w, random.Random(0))
    assert p.resources["barter"] == 3  # -2


def test_player_threats_sorted_most_advanced_first():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    pidx = w.player_idx
    other = next(i for i in range(len(w.factions)) if i != pidx)
    w.threats.threats = [
        Threat(other, pidx, Clock("slow", 8, 1), ThreatKind.MARCH),
        Threat(other, pidx, Clock("urgent", 4, 3), ThreatKind.RAID),
    ]
    fronts = player_threats(w)
    assert fronts[0].clock.label == "urgent"  # remaining 1 < remaining 7


def test_resource_floors_at_zero_on_fire():
    w = _world_with_threat(ThreatKind.EXTORT, segments=4, filled=3)
    p = w.player
    p.resources["barter"] = 1   # less than the 2 the front wants
    advance_threats(w, random.Random(0))
    assert p.resources["barter"] == 0  # floored, not negative
