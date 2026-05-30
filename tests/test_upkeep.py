"""Upkeep mechanics: stat drift, XP application, building yields, Heat decay."""

from __future__ import annotations

import random

from wasteland.core.characters import CharacterRole
from wasteland.core.faction import Archetype
from wasteland.engine.upkeep import run_upkeep
from wasteland.procgen.world_gen import generate_world


def test_upkeep_applies_pending_xp_before_drift():
    """A stat at 50 with +3 pending XP should land at 52 net (50 + 3 = 53, drift -1)."""
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    steward = next(o for o in p.officers if o.role is CharacterRole.STEWARD)
    steward.stats["authority"] = 50
    steward.pending_xp["authority"] = 3
    run_upkeep(w, random.Random(0))
    # 50 + 3 = 53 -> drift toward 50 by 1 -> 52
    assert steward.stats["authority"] == 52
    assert steward.pending_xp == {}


def test_upkeep_drifts_idle_stat_toward_fifty():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    steward = next(o for o in p.officers if o.role is CharacterRole.STEWARD)
    steward.stats["authority"] = 70
    run_upkeep(w, random.Random(0))
    assert steward.stats["authority"] == 69
    # Below-50 drifts up.
    steward.stats["authority"] = 30
    run_upkeep(w, random.Random(0))
    assert steward.stats["authority"] == 31


def test_upkeep_ages_characters():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    initial_age = p.leader.age
    run_upkeep(w, random.Random(0))
    assert p.leader.age == initial_age + 1


def test_upkeep_deposits_granary_yield_when_keeper_alive():
    """A Boss's Granary with Steward assigned deposits +2 Stock per turn at condition 100.

    People are set to 0 to isolate the building yield from the feeding step
    (People eat Stock; that interaction is covered separately below).
    """
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    p.resources["people"] = 0
    starting_stock = p.resources.get("stock", 0)
    run_upkeep(w, random.Random(0))
    assert p.resources["stock"] == starting_stock + 2


def test_upkeep_decays_heat():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    p.resources["heat"] = 5
    run_upkeep(w, random.Random(0))
    assert p.resources["heat"] == 4


def test_upkeep_floors_heat_at_zero():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    p.resources["heat"] = 0
    run_upkeep(w, random.Random(0))
    assert p.resources["heat"] == 0


def test_upkeep_building_condition_holds_with_keeper():
    """An assigned-officer building ticks +1 condition per turn (against -1 base decay)."""
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    loc_key = (p.location_hex.q, p.location_hex.r)
    granary = w.locations[loc_key].buildings[0]
    granary.condition = 80
    run_upkeep(w, random.Random(0))
    assert granary.condition == 81  # keeper alive => +1 maintenance


def test_upkeep_building_decays_without_keeper():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    loc_key = (p.location_hex.q, p.location_hex.r)
    granary = w.locations[loc_key].buildings[0]
    granary.condition = 80
    granary.assigned_officer = None
    run_upkeep(w, random.Random(0))
    assert granary.condition == 79


def test_upkeep_runs_for_mobile_camp_buildings():
    w = generate_world(seed=42, player_archetype=Archetype.ROADLORD)
    p = w.player
    starting_gas = p.resources.get("gas", 0)
    run_upkeep(w, random.Random(0))
    # Garage yields +2 Gas at condition 100.
    assert p.resources["gas"] == starting_gas + 2


def test_upkeep_runs_for_hosted_embedded_buildings():
    """An embedded Tinker inside a Boss's hold yields Barter from its Workshop."""
    w = generate_world(seed=12345, player_archetype=Archetype.TINKER)
    p = w.player
    starting_barter = p.resources.get("barter", 0)
    run_upkeep(w, random.Random(0))
    assert p.resources["barter"] >= starting_barter + 1


def test_upkeep_emits_a_log_entry():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    entries = run_upkeep(w, random.Random(0))
    assert any("Upkeep" in e.text for e in entries)


# --- territorial economy --------------------------------------------------

def _boss_at(seed: int):
    w = generate_world(seed=seed, player_archetype=Archetype.BOSS)
    p = w.player
    loc = w.location_for(p)
    return w, p, loc


def test_people_consume_stock_each_season():
    """People eat ceil(People/2) Stock. Granary off and surplus kept below the
    growth threshold so we measure pure consumption."""
    w, p, loc = _boss_at(42)
    loc.buildings[0].assigned_officer = None
    loc.buildings[0].condition = 0     # silence the Granary
    p.resources["people"] = 4          # eats ceil(4/2) = 2
    p.resources["stock"] = 5           # leftover 3 < growth threshold (4): no growth
    run_upkeep(w, random.Random(0))
    assert p.resources["stock"] == 3   # 5 - 2


def test_starvation_costs_people_and_spikes_discontent():
    w, p, loc = _boss_at(42)
    loc.buildings[0].condition = 0     # no granary yield
    loc.buildings[0].assigned_officer = None
    p.resources["people"] = 6          # needs 3 Stock
    p.resources["stock"] = 0           # has none
    loc.discontent = 0
    before_people = p.resources["people"]
    run_upkeep(w, random.Random(0))
    assert p.resources["people"] == before_people - 1
    assert loc.discontent >= 12
    assert p.resources["stock"] == 0


def test_surplus_grows_population_when_calm():
    w, p, loc = _boss_at(42)
    p.resources["people"] = 2          # eats 1
    p.resources["stock"] = 20          # big surplus after feeding
    loc.discontent = 0
    before = p.resources["people"]
    run_upkeep(w, random.Random(0))
    assert p.resources["people"] == before + 1


def test_no_growth_when_discontented():
    w, p, loc = _boss_at(42)
    p.resources["people"] = 2
    p.resources["stock"] = 20
    loc.discontent = 50                # above the growth ceiling
    before = p.resources["people"]
    run_upkeep(w, random.Random(0))
    assert p.resources["people"] == before  # fed, but nobody comes to a tense hold


def test_high_discontent_bleeds_people_and_authority():
    w, p, loc = _boss_at(42)
    p.resources["people"] = 5
    p.resources["stock"] = 20          # fed, so the loss is unrest, not starvation
    loc.discontent = 70                # above the unrest threshold
    loc.authority = 50
    before_people = p.resources["people"]
    run_upkeep(w, random.Random(0))
    assert p.resources["people"] <= before_people  # may grow then lose 1, net <= start
    assert loc.authority < 50


def test_maelstrom_rises_every_third_season():
    w, p, loc = _boss_at(42)
    w.turn = 3                         # divisible by 3
    before = w.maelstrom
    run_upkeep(w, random.Random(0))
    assert w.maelstrom == min(100, before + 1)
    w.turn = 4                         # not divisible by 3
    before = w.maelstrom
    run_upkeep(w, random.Random(0))
    assert w.maelstrom == before
