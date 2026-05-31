"""Roadlord Moves.

A Roadlord is mobile and parasitic on holds. Their game is to take from the
sedentary, refuel before the road kills them, and keep the gang together.

    - Raid              (Lieutenant · Notoriety) - take from the nearest Boss
    - Extort Tolls      (Bag-man · Notoriety)    - lighter take, less Heat
    - Demand Sanctuary  (Bag-man · Standing)     - host you, refill Gas
    - Recruit on the Road (Bag-man · Standing)   - +Riders for Barter
"""

from __future__ import annotations

import random

from ...core.characters import CharacterRole
from ...core.faction import Archetype, Faction
from ...core.hex import distance
from ...core.world import World
from ..fortune import Outcome
from ..log import LogEntry, LogKind
from ..snags import roll_snag
from .base import Move, MoveResult, register


def _nearest_boss(world: World, faction: Faction) -> tuple[int, Faction] | None:
    """Return (idx, faction) of the nearest Boss with a hex, or None."""
    if faction.location_hex is None:
        return None
    bosses = [
        (i, f) for i, f in enumerate(world.factions)
        if f.archetype is Archetype.BOSS and f.location_hex is not None
    ]
    if not bosses:
        return None
    bosses.sort(key=lambda p: distance(faction.location_hex, p[1].location_hex))
    return bosses[0]


def _spend(f: Faction, key: str, amount: int) -> int:
    have = f.resources.get(key, 0)
    taken = min(have, amount)
    f.resources[key] = have - taken
    return taken


class _Raid(Move):
    name = "Raid"
    stat = "notoriety"
    action_cost = 1
    archetypes = (Archetype.ROADLORD, Archetype.WARHOUND)
    acting_role = CharacterRole.LIEUTENANT

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if faction.resources.get("ammo", 0) <= 0:
            return False, "no Ammo to ride out with"
        if _nearest_boss(world, faction) is None:
            return False, "no hold within reach"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        target_pair = _nearest_boss(world, faction)
        assert target_pair is not None  # can_attempt guarded
        _, target = target_pair
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        faction.resources["ammo"] = max(0, faction.resources.get("ammo", 0) - 1)
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} raid {target.name} - {actor_label}, "
                 f"Notoriety {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            barter_taken = _spend(target, "barter", 3)
            stock_taken = _spend(target, "stock", 2)
            faction.resources["barter"] = faction.resources.get("barter", 0) + barter_taken
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            if actor is not None:
                actor.pending_xp["notoriety"] = actor.pending_xp.get("notoriety", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Strong: you take what you want. Barter +{barter_taken} (they lose Stock {stock_taken}). Heat +1."))
        elif outcome is Outcome.MIXED:
            barter_taken = _spend(target, "barter", 2)
            faction.resources["barter"] = faction.resources.get("barter", 0) + barter_taken
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            if actor is not None:
                actor.pending_xp["notoriety"] = actor.pending_xp.get("notoriety", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Mixed: a hard ride, a small purse. Barter +{barter_taken}, Heat +2."))
        else:  # BITTER
            faction.resources["riders"] = max(0, faction.resources.get("riders", 0) - 1)
            faction.resources["heat"] = faction.resources.get("heat", 0) + 3
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: the gate held; one of yours doesn't come back. Riders -1, Heat +3."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


class _ExtortTolls(Move):
    name = "Extort Tolls"
    stat = "notoriety"
    action_cost = 1
    archetypes = (Archetype.ROADLORD,)
    acting_role = CharacterRole.BAGMAN

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if _nearest_boss(world, faction) is None:
            return False, "no road traffic to tax"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        target_pair = _nearest_boss(world, faction)
        assert target_pair is not None
        _, target = target_pair
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} extort tolls outside {target.name} - {actor_label}, "
                 f"Notoriety {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            barter_taken = _spend(target, "barter", 2)
            faction.resources["barter"] = faction.resources.get("barter", 0) + barter_taken
            if actor is not None:
                actor.pending_xp["notoriety"] = actor.pending_xp.get("notoriety", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Strong: nobody passes without paying. Barter +{barter_taken}."))
        elif outcome is Outcome.MIXED:
            barter_taken = _spend(target, "barter", 1)
            faction.resources["barter"] = faction.resources.get("barter", 0) + barter_taken
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Mixed: a thin trickle. Barter +{barter_taken}, Heat +1."))
        else:  # BITTER
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: a caravan turns out to be guarded. Heat +2, no Barter."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


class _DemandSanctuary(Move):
    name = "Demand Sanctuary"
    stat = "standing"
    action_cost = 1
    archetypes = (Archetype.ROADLORD, Archetype.WARHOUND)
    acting_role = CharacterRole.BAGMAN

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if _nearest_boss(world, faction) is None:
            return False, "no hold to ask"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        target_pair = _nearest_boss(world, faction)
        assert target_pair is not None
        target_idx, target = target_pair
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        my_idx = next(i for i, f in enumerate(world.factions) if f is faction)
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} demand sanctuary in {target.name} - {actor_label}, "
                 f"Standing {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            world.sanctuary_turns[my_idx] = world.sanctuary_turns.get(my_idx, 0) + 3
            faction.resources["gas"] = faction.resources.get("gas", 0) + 3
            if actor is not None:
                actor.pending_xp["standing"] = actor.pending_xp.get("standing", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Strong: {target.name} opens the gate. Sanctuary 3 seasons, Gas +3."))
        elif outcome is Outcome.MIXED:
            world.sanctuary_turns[my_idx] = world.sanctuary_turns.get(my_idx, 0) + 1
            faction.resources["gas"] = faction.resources.get("gas", 0) + 1
            faction.resources["juice"] = max(0, faction.resources.get("juice", 0) - 1)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: they let you in, for a price. Sanctuary 1 season, Gas +1, Juice -1."))
        else:  # BITTER
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: the gate stays shut. Heat +2."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


class _RecruitOnTheRoad(Move):
    name = "Recruit on the Road"
    stat = "standing"
    action_cost = 1
    archetypes = (Archetype.ROADLORD,)
    acting_role = CharacterRole.BAGMAN

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if faction.resources.get("barter", 0) < 1:
            return False, "no Barter to bind a new rider"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        faction.resources["barter"] = max(0, faction.resources.get("barter", 0) - 1)
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} recruit on the road - {actor_label}, "
                 f"Standing {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            faction.resources["riders"] = faction.resources.get("riders", 0) + 2
            if actor is not None:
                actor.pending_xp["standing"] = actor.pending_xp.get("standing", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: hungry men want a story. Riders +2, Barter -1."))
        elif outcome is Outcome.MIXED:
            faction.resources["riders"] = faction.resources.get("riders", 0) + 1
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: one new rider, and word travels. Riders +1, Barter -1, Heat +1."))
        else:  # BITTER
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: the man you spoke to was someone's spy. Heat +2, Barter -1."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


Raid = _Raid()
ExtortTolls = _ExtortTolls()
DemandSanctuary = _DemandSanctuary()
RecruitOnTheRoad = _RecruitOnTheRoad()
register(Raid)
register(ExtortTolls)
register(DemandSanctuary)
register(RecruitOnTheRoad)
