"""Upkeep: per-turn dynamics for characters, buildings, locations, resources.

Runs at the top of end_turn, before the player's actions refill. Order
matters: pending XP from Moves resolved during the just-ended turn must be
applied BEFORE the idle-drift step, otherwise the drift would partly cancel
gains. The order is:

    1. Characters: apply pending XP, then drift unused stats toward 50, age++.
    2. Buildings: maintenance (assigned keeper present => +1 condition, else
       -1), then accrue scaled yield into the owner's resources.
    3. Heat decay: every faction with Heat > 0 loses 1 (universal pressure release).
    4. Locations: discontent drifts based on Stock + authority + Bailiff presence.

This step is intentionally bounded - small per-turn deltas so the game's
strategic levers are slow-moving compared to the Move-driven sharp shifts.
"""

from __future__ import annotations

import random

from ..core.buildings import Building
from ..core.characters import Character
from ..core.faction import ARCHETYPE_CLASS, ArchetypeClass, Faction
from ..core.locations import LocationState
from ..core.world import World
from .log import LogEntry, LogKind


def _all_characters(f: Faction) -> list[Character]:
    chars: list[Character] = []
    if f.leader is not None:
        chars.append(f.leader)
    chars.extend(f.officers)
    return chars


def _tick_character(c: Character) -> None:
    # 1a. Apply pending XP.
    for stat, xp in c.pending_xp.items():
        if stat in c.stats and xp != 0:
            c.stats[stat] = max(0, min(100, c.stats[stat] + xp))
    c.pending_xp.clear()
    # 1b. Idle drift toward 50 - one point per turn. Stats earned by use
    # outpace decay if they're being exercised (Strong gives +2, drift -1 = +1 net).
    for stat, value in list(c.stats.items()):
        if value > 50:
            c.stats[stat] = max(50, value - 1)
        elif value < 50:
            c.stats[stat] = min(50, value + 1)
    # 1c. Age.
    c.age += 1


def _keeper_alive(b: Building, owner: Faction) -> bool:
    """True if the building's assigned officer is alive on the owner roster."""
    if b.assigned_officer is None:
        return False
    for c in _all_characters(owner):
        if c.name == b.assigned_officer and c.alive:
            return True
    return False


def _tick_building(b: Building, owner: Faction) -> dict[str, int]:
    """Maintain + accrue. Returns the yield to deposit into owner.resources."""
    delta = +1 if _keeper_alive(b, owner) else -1
    b.condition = max(0, min(100, b.condition + delta))
    return b.yield_now()


def _deposit(f: Faction, yields: dict[str, int]) -> None:
    for resource, amount in yields.items():
        if amount > 0:
            f.resources[resource] = f.resources.get(resource, 0) + amount


def _has_role(f: Faction, role_value: str) -> bool:
    """Cheap lookup: is there an alive officer with the given role.value string?"""
    for o in f.officers:
        if o.alive and o.role.value == role_value:
            return True
    return False


def _tick_location(loc: LocationState, owner: Faction) -> None:
    stock = owner.resources.get("stock", 0)
    bailiff = _has_role(owner, "bailiff")
    # Rises with scarcity or low authority; eased by an active Bailiff.
    if stock <= 1 or loc.authority < 30:
        loc.discontent = min(100, loc.discontent + 1)
    elif loc.discontent > 0:
        loc.discontent = max(0, loc.discontent - (2 if bailiff else 1))


def run_upkeep(world: World, rng: random.Random) -> list[LogEntry]:
    entries: list[LogEntry] = []

    # 1. Characters.
    for f in world.factions:
        for c in _all_characters(f):
            _tick_character(c)

    # 2. Buildings + 3. Heat decay (interleaved per faction is fine).
    # Hex-bound locations - Boss-owned buildings + Embedded hosted buildings.
    for loc in world.locations.values():
        owner = world.factions[loc.owner_faction_idx]
        for b in loc.buildings:
            _deposit(owner, _tick_building(b, owner))
        for b in loc.hosted_buildings:
            host_owner = world.factions[b.owner_faction_idx]
            _deposit(host_owner, _tick_building(b, host_owner))

    # Mobile camps.
    for f in world.factions:
        if f.camp is not None:
            for b in f.camp.buildings:
                _deposit(f, _tick_building(b, f))

    # 3. Heat decay (universal pressure release).
    for f in world.factions:
        heat = f.resources.get("heat", 0)
        if heat > 0:
            f.resources["heat"] = max(0, heat - 1)

    # 4. Locations: discontent drift.
    for loc in world.locations.values():
        owner = world.factions[loc.owner_faction_idx]
        _tick_location(loc, owner)

    entries.append(LogEntry(
        turn=world.turn,
        kind=LogKind.SYSTEM,
        text="Upkeep: yields collected, condition ticked, stats drift.",
    ))
    return entries
