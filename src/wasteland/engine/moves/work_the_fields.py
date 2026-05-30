"""Work the Fields - the Boss's Stock engine and the answer to starvation.

Stat: Industry. Acting officer: Steward. Stock feeds People at Upkeep; without
it the hold starves. A surplus draws new arrivals. This is the food lever
opposite Tax the Hold's money lever.
    Strong: +3 Stock, Steward +2 Industry XP.
    Mixed:  +2 Stock, Steward +1 Industry XP.
    Bitter: +1 Stock, plus a Snag.
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


class _WorkTheFields(Move):
    name = "Work the Fields"
    stat = "industry"
    action_cost = 1
    archetypes = (Archetype.BOSS,)
    acting_role = CharacterRole.STEWARD

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if faction.resources.get("people", 0) <= 0:
            return False, "no People to work the fields"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} works the fields - {actor_label}, "
                 f"Industry {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            faction.resources["stock"] = faction.resources.get("stock", 0) + 3
            if actor is not None:
                actor.pending_xp["industry"] = actor.pending_xp.get("industry", 0) + 2
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: a good harvest off thin dirt. Stock +3."))
        elif outcome is Outcome.MIXED:
            faction.resources["stock"] = faction.resources.get("stock", 0) + 2
            if actor is not None:
                actor.pending_xp["industry"] = actor.pending_xp.get("industry", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: enough, for now. Stock +2."))
        else:  # BITTER
            faction.resources["stock"] = faction.resources.get("stock", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: blight in the rows. Stock +1."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


WorkTheFields = _WorkTheFields()
register(WorkTheFields)
