"""Tax the Hold - the Boss's primary Barter generator.

Per docs/MECHANICS.md:
    Stat: Charm. Strong: +3 Barter. Mixed: +2 Barter, +1 Heat. Bitter: +1
    Barter, -1 People, +2 Heat, plus a Snag.
"""

from __future__ import annotations

import random

from ...core.faction import Archetype, Faction
from ...core.world import World
from ..fortune import Outcome
from ..log import LogEntry, LogKind
from ..snags import roll_snag
from .base import Move, MoveResult, register


class _TaxTheHold(Move):
    name = "Tax the Hold"
    stat = "charm"
    action_cost = 1
    archetypes = (Archetype.BOSS,)

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if faction.resources.get("people", 0) <= 0:
            return False, "no People left to tax"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        outcome = faction.fortune.draw(rng, faction.stats.charm)
        entries: list[LogEntry] = [
            LogEntry(
                turn=world.turn,
                kind=LogKind.MOVE,
                text=f"{faction.name} taxes the hold (Charm {faction.stats.charm:+d}).",
            ),
        ]

        if outcome is Outcome.STRONG:
            faction.resources["barter"] = faction.resources.get("barter", 0) + 3
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: the gates are quiet; you take what you need. Barter +3.",
            ))
        elif outcome is Outcome.MIXED:
            faction.resources["barter"] = faction.resources.get("barter", 0) + 2
            faction.resources["heat"] = faction.resources.get("heat", 0) + 1
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: muttering in the streets. Barter +2, Heat +1.",
            ))
        else:  # BITTER
            faction.resources["barter"] = faction.resources.get("barter", 0) + 1
            faction.resources["people"] = max(0, faction.resources.get("people", 0) - 1)
            faction.resources["heat"] = faction.resources.get("heat", 0) + 2
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
