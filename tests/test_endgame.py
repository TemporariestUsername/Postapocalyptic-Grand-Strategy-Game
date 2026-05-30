"""Endgame: defeat conditions, legacy score, and the end-to-end turn loop."""

from __future__ import annotations

import random

from wasteland.core.faction import Archetype
from wasteland.core.world import GameOutcomeKind
from wasteland.engine.endgame import check_endgame, legacy_score
from wasteland.engine.turn import end_turn
from wasteland.procgen.world_gen import generate_world


def test_no_defeat_at_game_start():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    assert check_endgame(w) is None
    assert not w.is_over


def test_boss_defeated_when_people_hit_zero():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    w.player.resources["people"] = 0
    outcome = check_endgame(w)
    assert outcome is not None
    assert outcome.kind is GameOutcomeKind.DEFEAT
    assert "hold empties" in outcome.reason.lower()


def test_boss_defeated_when_hold_revolts():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    w.player.resources["people"] = 3
    loc = w.location_for(w.player)
    loc.discontent = 100
    outcome = check_endgame(w)
    assert outcome is not None
    assert "revolt" in outcome.reason.lower()


def test_maelstrom_cap_is_universal_defeat():
    w = generate_world(seed=42, player_archetype=Archetype.ROADLORD)
    w.maelstrom = 100
    outcome = check_endgame(w)
    assert outcome is not None
    assert outcome.kind is GameOutcomeKind.DEFEAT
    assert "maelstrom" in outcome.reason.lower()


def test_mobile_defeated_when_no_riders():
    w = generate_world(seed=42, player_archetype=Archetype.ROADLORD)
    w.player.resources["riders"] = 0
    outcome = check_endgame(w)
    assert outcome is not None
    assert "gang scatters" in outcome.reason.lower()


def test_legacy_score_rewards_longer_runs():
    early = generate_world(seed=42, player_archetype=Archetype.BOSS)
    early.turn = 2
    late = generate_world(seed=42, player_archetype=Archetype.BOSS)
    late.turn = 40
    assert legacy_score(late) > legacy_score(early)


def test_legacy_score_rewards_holdings():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    base = legacy_score(w)
    w.player.resources["people"] += 5
    assert legacy_score(w) > base


def test_end_turn_records_outcome_and_stops_refill():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    # Force a defeat next upkeep: no people, no stock, no granary.
    w.player.resources["people"] = 0
    entries = end_turn(w, random.Random(0))
    assert w.is_over
    assert w.actions_left == 0
    assert any("It ends" in e.text for e in entries)


def test_end_turn_is_noop_once_game_is_over():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    w.player.resources["people"] = 0
    end_turn(w, random.Random(0))
    assert w.is_over
    turn_when_over = w.turn
    second = end_turn(w, random.Random(0))
    assert second == []
    assert w.turn == turn_when_over  # no further advancement
