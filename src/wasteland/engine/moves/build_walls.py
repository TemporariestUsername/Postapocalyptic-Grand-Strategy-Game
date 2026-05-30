"""Build Walls - the Boss's defense against martial fronts.

Stat: Industry. Acting officer: Steward. Walls soak raids and marches at the
moment a front fires (see engine/threats.py), so banking Walls ahead of an
incoming clock is how a Boss survives a neighbor's army. Costs Stock as
materials.
    Strong: +2 Walls, -1 Stock, Steward +1 Industry XP.
    Mixed:  +1 Walls, -1 Stock.
    Bitter:  0 Walls, -1 Stock, plus a Snag.
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


class _BuildWalls(Move):
    name = "Build Walls"
    stat = "industry"
    action_cost = 1
    archetypes = (Archetype.BOSS,)
    acting_role = CharacterRole.STEWARD

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        if faction.resources.get("stock", 0) <= 0:
            return False, "no Stock for materials"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        faction.resources["stock"] = max(0, faction.resources.get("stock", 0) - 1)
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} builds the walls - {actor_label}, "
                 f"Industry {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            faction.resources["walls"] = faction.resources.get("walls", 0) + 2
            if actor is not None:
                actor.pending_xp["industry"] = actor.pending_xp.get("industry", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: the courses go up straight and fast. Walls +2, Stock -1."))
        elif outcome is Outcome.MIXED:
            faction.resources["walls"] = faction.resources.get("walls", 0) + 1
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: slow going, but it holds. Walls +1, Stock -1."))
        else:  # BITTER
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: a section sloughs off in the night. Stock -1, no Walls."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


BuildWalls = _BuildWalls()
register(BuildWalls)
