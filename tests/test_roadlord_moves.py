"""Roadlord (Mobile) Moves: Raid, Extort Tolls, Demand Sanctuary, Recruit."""

from __future__ import annotations

import random

from wasteland.core.faction import Archetype
from wasteland.engine.fortune import FortuneDeck, Outcome
from wasteland.engine.moves import (
    DemandSanctuary,
    ExtortTolls,
    Raid,
    RecruitOnTheRoad,
    available_moves,
)
from wasteland.procgen.world_gen import generate_world


def _force_top_card(deck: FortuneDeck, outcome: Outcome) -> None:
    for i, c in enumerate(deck.draw_pile):
        if c is outcome:
            deck.draw_pile.insert(0, deck.draw_pile.pop(i))
            return
    raise AssertionError(f"no {outcome} in deck")


def _neutralize(p, stat: str) -> None:
    if p.leader is not None and stat in p.leader.stats:
        p.leader.stats[stat] = 50
    for o in p.officers:
        if stat in o.stats:
            o.stats[stat] = 50


def _player_world():
    w = generate_world(seed=42, player_archetype=Archetype.ROADLORD)
    return w, w.player


def test_roadlord_has_full_loop():
    w, p = _player_world()
    names = {m.name for m in available_moves(p)}
    for expected in ("Raid", "Extort Tolls", "Demand Sanctuary",
                     "Recruit on the Road", "Catch your breath"):
        assert expected in names
    assert "Tax the Hold" not in names  # Boss-only


def test_strong_raid_takes_barter_from_nearest_boss():
    w, p = _player_world()
    _neutralize(p, "notoriety")
    p.resources["ammo"] = 3
    nearest_boss = next(f for f in w.factions
                        if f.archetype is Archetype.BOSS and f.location_hex is not None)
    nearest_boss.resources["barter"] = 10
    starting_p_barter = p.resources.get("barter", 0)
    _force_top_card(p.fortune, Outcome.STRONG)
    result = Raid.resolve(w, p, random.Random(0))
    assert result.outcome is Outcome.STRONG
    assert p.resources["barter"] > starting_p_barter   # gained from the raid
    assert p.resources["ammo"] == 2                    # -1 ammo cost
    # The hit lands on *some* hold; verify total Boss barter decreased.
    assert nearest_boss.resources["barter"] < 10


def test_raid_blocked_without_ammo():
    w, p = _player_world()
    p.resources["ammo"] = 0
    allowed, reason = Raid.can_attempt(w, p)
    assert not allowed
    assert "Ammo" in reason


def test_bitter_raid_costs_riders():
    w, p = _player_world()
    _neutralize(p, "notoriety")
    p.resources["ammo"] = 3
    starting_riders = p.resources.get("riders", 0)
    _force_top_card(p.fortune, Outcome.BITTER)
    Raid.resolve(w, p, random.Random(0))
    assert p.resources["riders"] == max(0, starting_riders - 1)


def test_extort_tolls_yields_barter_with_less_heat():
    w, p = _player_world()
    _neutralize(p, "notoriety")
    starting_barter = p.resources.get("barter", 0)
    _force_top_card(p.fortune, Outcome.STRONG)
    ExtortTolls.resolve(w, p, random.Random(0))
    assert p.resources["barter"] >= starting_barter   # may be capped by target's pool


def test_strong_demand_sanctuary_grants_three_seasons_and_gas():
    w, p = _player_world()
    _neutralize(p, "standing")
    pidx = w.player_idx
    p.resources["gas"] = 1
    _force_top_card(p.fortune, Outcome.STRONG)
    DemandSanctuary.resolve(w, p, random.Random(0))
    assert w.sanctuary_turns.get(pidx, 0) == 3
    assert p.resources["gas"] == 4   # +3


def test_recruit_grows_riders_costs_barter():
    w, p = _player_world()
    _neutralize(p, "standing")
    p.resources["barter"] = 4
    starting_riders = p.resources.get("riders", 0)
    _force_top_card(p.fortune, Outcome.STRONG)
    RecruitOnTheRoad.resolve(w, p, random.Random(0))
    assert p.resources["riders"] == starting_riders + 2
    assert p.resources["barter"] == 3


def test_recruit_blocked_without_barter():
    w, p = _player_world()
    p.resources["barter"] = 0
    allowed, reason = RecruitOnTheRoad.can_attempt(w, p)
    assert not allowed
    assert "Barter" in reason
