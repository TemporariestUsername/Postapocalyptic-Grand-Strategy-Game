"""Prophet Moves.

A Prophet lives inside someone else's hold and turns its People into Followers.
Their power is the Maelstrom - the Moves that grow the flock fastest also push
the global Maelstrom meter closer to the cliff.

    - Preach                 (Chosen · Conviction)   - safe Followers growth
    - Convert                (Doomsayer · Influence) - take from host's People (Heat)
    - Open to the Maelstrom  (Chosen · Conviction)   - Secrets + Maelstrom +1
    - Schism a Rival         (Inquisitor · Cunning)  - cut another embedded's Followers
"""

from __future__ import annotations

import random

from ...core.characters import CharacterRole
from ...core.faction import ARCHETYPE_CLASS, Archetype, ArchetypeClass, Faction
from ...core.world import World
from ..fortune import Outcome
from ..log import LogEntry, LogKind
from ..snags import roll_snag
from .base import Move, MoveResult, register


def _host_boss(world: World, faction: Faction) -> tuple[int, Faction] | None:
    """Return (idx, faction) of the Boss whose hold hosts the embedded faction."""
    if not faction.host_holds:
        return None
    primary = faction.host_holds[0]
    for i, f in enumerate(world.factions):
        if f.archetype is Archetype.BOSS and f.name == primary:
            return (i, f)
    return None


def _rival_embeds(world: World, faction: Faction) -> list[tuple[int, Faction]]:
    """Other embedded factions in the same host hold."""
    if not faction.host_holds:
        return []
    primary = faction.host_holds[0]
    out: list[tuple[int, Faction]] = []
    for i, f in enumerate(world.factions):
        if f is faction:
            continue
        if ARCHETYPE_CLASS[f.archetype] is not ArchetypeClass.EMBEDDED:
            continue
        if primary in f.host_holds:
            out.append((i, f))
    return out


class _Preach(Move):
    name = "Preach"
    stat = "conviction"
    action_cost = 1
    archetypes = (Archetype.PROPHET,)
    acting_role = CharacterRole.CHOSEN

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if not faction.host_holds:
            return False, "no host to preach in"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} preach in {faction.host_holds[0]} - {actor_label}, "
                 f"Conviction {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            faction.resources["followers"] = faction.resources.get("followers", 0) + 2
            if actor is not None:
                actor.pending_xp["conviction"] = actor.pending_xp.get("conviction", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: the sermon catches. Followers +2."))
        elif outcome is Outcome.MIXED:
            faction.resources["followers"] = faction.resources.get("followers", 0) + 1
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: a few new mouths chant along. Followers +1, Heat +1."))
        else:  # BITTER
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: a heckler turns the room. Heat +2, no Followers."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


class _Convert(Move):
    name = "Convert"
    stat = "influence"
    action_cost = 1
    archetypes = (Archetype.PROPHET,)
    acting_role = CharacterRole.DOOMSAYER

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        host = _host_boss(world, faction)
        if host is None:
            return False, "no host to convert from"
        _, h = host
        if h.resources.get("people", 0) <= 0:
            return False, "the host has no one left to take"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        host = _host_boss(world, faction)
        assert host is not None
        _, h = host
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} draw converts from {h.name} - {actor_label}, "
                 f"Influence {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            h.resources["people"] = max(0, h.resources.get("people", 0) - 1)
            faction.resources["followers"] = faction.resources.get("followers", 0) + 2
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            if actor is not None:
                actor.pending_xp["influence"] = actor.pending_xp.get("influence", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Strong: one of theirs becomes one of yours. Followers +2, Heat +1, {h.name} loses 1 People."))
        elif outcome is Outcome.MIXED:
            faction.resources["followers"] = faction.resources.get("followers", 0) + 1
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: a soul wavers and slides over. Followers +1, Heat +2."))
        else:  # BITTER
            faction.resources["heat"] = faction.resources.get("heat", 0) + 3
            faction.resources["cover"] = max(0, faction.resources.get("cover", 0) - 1)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: they say no, and they tell someone. Heat +3, Cover -1."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


class _OpenToTheMaelstrom(Move):
    name = "Open to the Maelstrom"
    stat = "conviction"
    action_cost = 1
    archetypes = (Archetype.PROPHET,)
    acting_role = CharacterRole.CHOSEN

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} open to the Maelstrom - {actor_label}, "
                 f"Conviction {self.stat_value(faction)}.",
        )]
        # The Maelstrom always answers, win or lose - that's the whole point.
        world.maelstrom = min(100, world.maelstrom + 1)

        if outcome is Outcome.STRONG:
            faction.resources["secrets"] = faction.resources.get("secrets", 0) + 2
            if actor is not None:
                actor.pending_xp["conviction"] = actor.pending_xp.get("conviction", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: the static parts; the Static speaks. Secrets +2, Maelstrom +1."))
        elif outcome is Outcome.MIXED:
            faction.resources["secrets"] = faction.resources.get("secrets", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: half a vision, half a headache. Secrets +1, Maelstrom +1."))
        else:  # BITTER
            faction.resources["cover"] = max(0, faction.resources.get("cover", 0) - 1)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: it sees you back. Cover -1, Maelstrom +1."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


class _SchismARival(Move):
    name = "Schism a Rival"
    stat = "cunning"
    action_cost = 1
    archetypes = (Archetype.PROPHET,)
    acting_role = CharacterRole.INQUISITOR

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if not _rival_embeds(world, faction):
            return False, "no rival embedded faction in this hold"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        rivals = _rival_embeds(world, faction)
        # Pick the rival with the most Followers - hurts the leader.
        rivals.sort(key=lambda p: p[1].resources.get("followers", 0), reverse=True)
        _, rival = rivals[0]
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} schism {rival.name} - {actor_label}, "
                 f"Cunning {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            taken = min(2, rival.resources.get("followers", 0))
            rival.resources["followers"] = max(0, rival.resources.get("followers", 0) - taken)
            faction.resources["followers"] = faction.resources.get("followers", 0) + taken
            if actor is not None:
                actor.pending_xp["cunning"] = actor.pending_xp.get("cunning", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Strong: their flock splits and walks to your altar. Followers +{taken} (they lose {taken})."))
        elif outcome is Outcome.MIXED:
            taken = min(1, rival.resources.get("followers", 0))
            rival.resources["followers"] = max(0, rival.resources.get("followers", 0) - taken)
            faction.resources["followers"] = faction.resources.get("followers", 0) + taken
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Mixed: a defector or two. Followers +{taken}, Heat +1."))
        else:  # BITTER
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            faction.resources["cover"] = max(0, faction.resources.get("cover", 0) - 1)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: they know it was you. Heat +2, Cover -1."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


Preach = _Preach()
Convert = _Convert()
OpenToTheMaelstrom = _OpenToTheMaelstrom()
SchismARival = _SchismARival()
register(Preach)
register(Convert)
register(OpenToTheMaelstrom)
register(SchismARival)
