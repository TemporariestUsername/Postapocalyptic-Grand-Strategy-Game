"""Upkeep: per-turn dynamics for characters, buildings, locations, resources.

Runs at the top of end_turn, before threats advance. Order matters - XP from
the just-ended turn's Moves must apply before idle drift, and building yields
must land before the hold feeds itself. The sequence is:

    1. Characters: apply pending XP, drift idle stats toward 50, age++.
    2. Buildings: maintenance (keeper present => +1 condition, else -1), then
       deposit condition-scaled yield into the owner's resources.
    3. Heat decay: every faction with Heat > 0 loses 1.
    4. Territorial economy: the hold feeds on Stock, starves if it can't, grows
       on a surplus, and simmers (discontent) under scarcity, Heat, and weak
       Authority. A hold at max discontent is about to revolt (endgame checks
       that). This is the strategic core - the loop the player manages.
    5. Maelstrom: rises one notch every third season (a slow doom timer).

Steps 1-3 are archetype-general. Step 4 is Territorial-only for now; Mobile and
Embedded economies arrive with their full Move sets.
"""

from __future__ import annotations

import random

from ..core.buildings import Building
from ..core.characters import Character
from ..core.faction import ARCHETYPE_CLASS, ArchetypeClass, Faction
from ..core.locations import LocationState
from ..core.world import World
from .log import LogEntry, LogKind


# --- economy tuning ---------------------------------------------------------
_FEED_PER_TWO_PEOPLE = 2     # People eat ceil(People / 2) Stock each season
_STARVE_PEOPLE_LOSS = 1
_STARVE_DISCONTENT = 12
_GROWTH_SURPLUS = 4          # Stock left after feeding that lets People grow
_GROWTH_SETTLING_COST = 2    # Stock the new arrivals consume settling in
_GROWTH_DISCONTENT_MAX = 40
_HEAT_PRESSURE_AT = 6        # Heat at or above this feeds discontent
_UNREST_AT = 60             # discontent at or above this bleeds People + Authority
_UNREST_PEOPLE_LOSS = 1
_UNREST_AUTHORITY_LOSS = 4
_MAELSTROM_EVERY = 3         # seasons between Maelstrom notches


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
    # 1b. Idle drift toward 50 - one point per turn. Move XP outpaces decay if
    # the stat is being exercised (Strong gives +2, drift -1 = +1 net).
    for stat, value in list(c.stats.items()):
        if value > 50:
            c.stats[stat] = max(50, value - 1)
        elif value < 50:
            c.stats[stat] = min(50, value + 1)
    # 1c. Age.
    c.age += 1


def _keeper_alive(b: Building, owner: Faction) -> bool:
    if b.assigned_officer is None:
        return False
    for c in _all_characters(owner):
        if c.name == b.assigned_officer and c.alive:
            return True
    return False


def _tick_building(b: Building, owner: Faction) -> dict[str, int]:
    delta = +1 if _keeper_alive(b, owner) else -1
    b.condition = max(0, min(100, b.condition + delta))
    return b.yield_now()


def _deposit(f: Faction, yields: dict[str, int]) -> None:
    for resource, amount in yields.items():
        if amount > 0:
            f.resources[resource] = f.resources.get(resource, 0) + amount


def _has_role(f: Faction, role_value: str) -> bool:
    for o in f.officers:
        if o.alive and o.role.value == role_value:
            return True
    return False


def _territorial_economy(
    world: World, f: Faction, loc: LocationState, is_player: bool
) -> list[LogEntry]:
    """Feed, starve, grow, and simmer. Mutates f.resources and loc in place.

    Returns player-facing log entries (only for the player, to keep the log
    readable; rival holds churn silently).
    """
    entries: list[LogEntry] = []

    def log(text: str, kind: LogKind = LogKind.OUTCOME) -> None:
        if is_player:
            entries.append(LogEntry(turn=world.turn, kind=kind, text=text))

    r = f.resources
    people = r.get("people", 0)
    consumption = (people + 1) // 2  # ceil(people / 2)

    if people <= 0:
        return entries  # an empty hold has nothing left to simmer

    stock = r.get("stock", 0)
    if stock >= consumption:
        r["stock"] = stock - consumption
        # Surplus may draw new arrivals if the hold is calm.
        if r["stock"] >= _GROWTH_SURPLUS and loc.discontent < _GROWTH_DISCONTENT_MAX:
            r["people"] = people + 1
            r["stock"] = max(0, r["stock"] - _GROWTH_SETTLING_COST)
            log("Word of full granaries spreads; new hands arrive. People +1.")
        # Calm holds settle if there's no other pressure this season.
        if r.get("heat", 0) < _HEAT_PRESSURE_AT and loc.discontent > 0:
            ease = 2 if _has_role(f, "bailiff") else 1
            loc.discontent = max(0, loc.discontent - ease)
    else:
        # Not enough to go around. Eat what there is; the rest is hunger.
        r["stock"] = 0
        r["people"] = max(0, people - _STARVE_PEOPLE_LOSS)
        loc.discontent = min(100, loc.discontent + _STARVE_DISCONTENT)
        log("The granaries run dry. Someone starves. People -1, the streets turn.",
            LogKind.SNAG)

    # Heat the world can see makes the hold restless.
    if r.get("heat", 0) >= _HEAT_PRESSURE_AT:
        loc.discontent = min(100, loc.discontent + 2)
    # A weak grip on the hold festers.
    if loc.authority < 30:
        loc.discontent = min(100, loc.discontent + 1)

    # Unrest: a discontented hold bleeds people and the leader's grip.
    if loc.discontent >= _UNREST_AT:
        r["people"] = max(0, r.get("people", 0) - _UNREST_PEOPLE_LOSS)
        loc.authority = max(0, loc.authority - _UNREST_AUTHORITY_LOSS)
        log(f"Unrest in the streets (discontent {loc.discontent}). "
            f"People -1, your authority slips.", LogKind.SNAG)

    # Structural population follows the People resource, gently.
    target_pop = max(0, min(100, r.get("people", 0) * 12))
    if loc.population < target_pop:
        loc.population += 1
    elif loc.population > target_pop:
        loc.population -= 1

    return entries


def run_upkeep(world: World, rng: random.Random) -> list[LogEntry]:
    entries: list[LogEntry] = []

    # 1. Characters.
    for f in world.factions:
        for c in _all_characters(f):
            _tick_character(c)

    # 2. Buildings (Boss locations + Embedded hosted buildings).
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

    # 3. Heat decay.
    for f in world.factions:
        heat = f.resources.get("heat", 0)
        if heat > 0:
            f.resources["heat"] = max(0, heat - 1)

    # 4. Territorial economy.
    for idx, loc in world.locations.items():
        owner = world.factions[loc.owner_faction_idx]
        if ARCHETYPE_CLASS[owner.archetype] is ArchetypeClass.TERRITORIAL:
            entries.extend(_territorial_economy(world, owner, loc, owner.is_player))

    # 5. Maelstrom doom timer.
    if world.turn % _MAELSTROM_EVERY == 0:
        world.maelstrom = min(100, world.maelstrom + 1)

    entries.append(LogEntry(
        turn=world.turn,
        kind=LogKind.SYSTEM,
        text="Upkeep: yields collected, the hold fed, stats drift.",
    ))
    return entries
