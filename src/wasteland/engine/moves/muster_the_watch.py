"""Muster the Watch - the Boss's direct answer to an incoming front.

Stat: Vigilance. Acting officer: Marshal. Stockpiles Ammo and, more
importantly, stalls the most-advanced front aimed at you - buying seasons to
raise Walls or break the rhythm of a raider's clock. This is the Move that
lets a player act *on* the threat system rather than only absorb it.
    Strong: Ammo +2, stall the worst incoming front by 2 segments.
    Mixed:  Ammo +1, stall by 1.
    Bitter: Ammo +0, no stall, plus a Snag.
"""

from __future__ import annotations

import random

from ...core.characters import CharacterRole
from ...core.faction import Archetype, Faction
from ...core.world import World
from ..fortune import Outcome
from ..log import LogEntry, LogKind
from ..snags import roll_snag
from ..threats import player_threats
from .base import Move, MoveResult, register


def _stall_worst_front(world: World, segments: int) -> str | None:
    """Reduce the most-advanced player-targeted front. Returns its label if any."""
    fronts = player_threats(world)
    fronts = [t for t in fronts if not t.clock.is_full and t.clock.filled > 0]
    if not fronts:
        return None
    worst = fronts[0]  # player_threats() sorts most-advanced first
    worst.clock.filled = max(0, worst.clock.filled - segments)
    return worst.clock.label


class _MusterTheWatch(Move):
    name = "Muster the Watch"
    stat = "vigilance"
    action_cost = 1
    archetypes = (Archetype.BOSS,)
    acting_role = CharacterRole.MARSHAL

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} musters the watch - {actor_label}, "
                 f"Vigilance {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            faction.resources["ammo"] = faction.resources.get("ammo", 0) + 2
            if actor is not None:
                actor.pending_xp["vigilance"] = actor.pending_xp.get("vigilance", 0) + 2
            stalled = _stall_worst_front(world, 2)
            tail = f" You blunt the threat: {stalled} loses ground." if stalled else ""
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Strong: the gate bristles. Ammo +2.{tail}"))
        elif outcome is Outcome.MIXED:
            faction.resources["ammo"] = faction.resources.get("ammo", 0) + 1
            if actor is not None:
                actor.pending_xp["vigilance"] = actor.pending_xp.get("vigilance", 0) + 1
            stalled = _stall_worst_front(world, 1)
            tail = f" {stalled} slows." if stalled else ""
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text=f"Mixed: the watch stands ready. Ammo +1.{tail}"))
        else:  # BITTER
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: half the watch is drunk or gone. Nothing gained."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


MusterTheWatch = _MusterTheWatch()
register(MusterTheWatch)
