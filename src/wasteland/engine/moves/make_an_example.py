"""Make an Example - the Boss's lever against Heat and discontent.

Stat: Vigilance. Acting officer: Bailiff. A public reckoning cools the world's
attention (Heat) and cows a restless hold (discontent), holding off the revolt
spiral the economy can spin up. It is ugly: a Bitter outcome costs a life and
breeds the very resentment it meant to crush.
    Strong: Heat -3, discontent -20.
    Mixed:  Heat -2, discontent -10.
    Bitter: Heat -1, discontent -5, People -1, plus a Snag.
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


def _cool(faction: Faction, heat_drop: int) -> None:
    faction.resources["heat"] = max(0, faction.resources.get("heat", 0) - heat_drop)


class _MakeAnExample(Move):
    name = "Make an Example"
    stat = "vigilance"
    action_cost = 1
    archetypes = (Archetype.BOSS,)
    acting_role = CharacterRole.BAILIFF

    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        loc = world.location_for(faction)
        if loc is None:
            return False, "no hold to discipline"
        if faction.resources.get("heat", 0) <= 0 and loc.discontent <= 0:
            return False, "the hold is calm"
        return True, ""

    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult:
        actor = self.acting_character(faction)
        loc = world.location_for(faction)
        outcome = faction.fortune.draw(rng, self.draw_modifier(faction))
        actor_label = f"{actor.name} ({actor.role.value})" if actor else "(no officer)"
        entries: list[LogEntry] = [LogEntry(
            turn=world.turn, kind=LogKind.MOVE,
            text=f"{faction.name} makes an example - {actor_label}, "
                 f"Vigilance {self.stat_value(faction)}.",
        )]

        if outcome is Outcome.STRONG:
            _cool(faction, 3)
            if loc is not None:
                loc.discontent = max(0, loc.discontent - 20)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Strong: the gallows do their quiet work. Heat -3, the hold goes still."))
        elif outcome is Outcome.MIXED:
            _cool(faction, 2)
            if loc is not None:
                loc.discontent = max(0, loc.discontent - 10)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Mixed: they get the message, mostly. Heat -2, discontent eases."))
        else:  # BITTER
            _cool(faction, 1)
            if loc is not None:
                loc.discontent = max(0, loc.discontent - 5)
            faction.resources["people"] = max(0, faction.resources.get("people", 0) - 1)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.OUTCOME,
                text="Bitter: you make a martyr, not an example. Heat -1, People -1."))
            snag = roll_snag(world, faction, rng)
            entries.append(LogEntry(turn=world.turn, kind=LogKind.SNAG, text=f"Snag: {snag}."))
        return MoveResult(outcome=outcome, entries=entries)


MakeAnExample = _MakeAnExample()
register(MakeAnExample)
