"""Catch your breath - the meta-Move that reshuffles your Fortune Deck.

Per docs/MECHANICS.md: any archetype, 1 action, costs 2 Juice. The only way
to refresh a depleted deck.
"""

from __future__ import annotations

import random

from ...core.faction import Faction
from ...core.world import World
from ..fortune import DECK_SIZE, Outcome
from ..log import LogEntry, LogKind
from .base import Move, MoveResult, register


class _CatchYourBreath(Move):
    name = "Catch your breath"
    stat = None  # meta-Move: doesn't draw, doesn't key off any stat
    action_cost = 1
    archetypes = ()  # all archetypes

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        # Only useful if some cards have been drawn AND you can pay 2 Juice.
        if faction.resources.get("juice", 0) < 2:
            return False, "not enough Juice (costs 2)"
        if faction.fortune.remaining >= DECK_SIZE:
            return False, "deck already full"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        faction.resources["juice"] = faction.resources.get("juice", 0) - 2
        faction.fortune.reshuffle(rng)
        # No card draw, no outcome - meta-Move. We return STRONG as a sentinel
        # but the UI treats this as a flat success.
        entries = [
            LogEntry(turn=world.turn, kind=LogKind.MOVE,
                     text=f"{faction.name} catches their breath. Juice -2."),
            LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                     text="The Fortune Deck is gathered, shuffled, ready again."),
        ]
        return MoveResult(outcome=Outcome.STRONG, entries=entries)


CatchYourBreath = _CatchYourBreath()
register(CatchYourBreath)
