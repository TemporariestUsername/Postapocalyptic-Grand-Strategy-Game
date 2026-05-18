"""Tax the Hold - the Boss's primary Barter generator.

Stat: Authority. Acting officer: Steward (falls back to the Leader).
    Strong: +3 Barter, Steward +2 Authority XP.
    Mixed:  +2 Barter, +1 Heat, Steward +1 Authority XP.
    Bitter: +1 Barter, -1 People, +2 Heat, Steward -3 Authority, plus a Snag.
"""

from __future__ import annotations

import random

from ...core.characters import CharacterRole
from ...core.faction import Archetype, Faction
from ...core.world import World
from ..fortune import Outcome
from ..log import LogEntry, LogKind
from ..snags import roll_snag
from .base import Move, MoveResult, register


class _TaxTheHold(Move):
    name = "Tax the Hold"
    stat = "authority"
    action_cost = 1
    archetypes = (Archetype.BOSS,)
    acting_role = CharacterRole.STEWARD

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if faction.resources.get("people", 0) <= 0:
            return False, "no People left to tax"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        # Defensive: a Boss without a leader should never happen, but if both
        # the Steward and the Leader are gone the Move silently uses a flat draw.
        stat_value = self.stat_value(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = (
            f"{actor.name} ({actor.role.value})" if actor is not None else "(no officer)"
        )
        entries: list[LogEntry] = [
            LogEntry(
                turn=world.turn,
                kind=LogKind.MOVE,
                text=(
                    f"{faction.name} taxes the hold - {actor_label}, "
                    f"Authority {stat_value}."
                ),
            ),
        ]

        if outcome is Outcome.STRONG:
            faction.resources["barter"] = faction.resources.get("barter", 0) + 3
            if actor is not None:
                actor.pending_xp["authority"] = actor.pending_xp.get("authority", 0) + 2
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: the gates are quiet; you take what you need. Barter +3.",
            ))
        elif outcome is Outcome.MIXED:
            faction.resources["barter"] = faction.resources.get("barter", 0) + 2
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            if actor is not None:
                actor.pending_xp["authority"] = actor.pending_xp.get("authority", 0) + 1
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: muttering in the streets. Barter +2, Heat +1.",
            ))
        else:  # BITTER
            faction.resources["barter"] = faction.resources.get("barter", 0) + 1
            faction.resources["people"] = max(0, faction.resources.get("people", 0) - 1)
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
            if actor is not None:
                actor.stats["authority"] = max(0, actor.stats.get("authority", 0) - 3)
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: someone refuses; an example must be made. "
                     "Barter +1, People -1, Heat +2.",
            ))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}.",
            ))
        return MoveResult(outcome=outcome, entries=entries)


TaxTheHold = _TaxTheHold()
register(TaxTheHold)
