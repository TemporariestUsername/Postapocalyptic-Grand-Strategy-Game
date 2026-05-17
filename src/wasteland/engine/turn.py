"""Turn advancement: action budgets, end-turn step.

Phase 3 advances turns for the *player only*. AI factions and threat-clock
ticking land in Phase 5.
"""

from __future__ import annotations

import random

from ..core.faction import Archetype, Faction
from ..core.world import World
from .log import LogEntry, LogKind


# Per-archetype standard action budget per turn. From docs/MECHANICS.md.
_BUDGETS: dict[Archetype, int] = {
    Archetype.BOSS: 3,
    Archetype.ROADLORD: 2,
    Archetype.WARHOUND: 2,
    Archetype.PROPHET: 2,
    Archetype.TINKER: 2,
    Archetype.WHISPER: 2,
    Archetype.FIXER: 2,
    Archetype.HOSTKEEPER: 2,
}


def action_budget(faction: Faction) -> int:
    return _BUDGETS[faction.archetype]


def end_turn(world: World, rng: random.Random) -> list[LogEntry]:
    """Advance to the next turn. Returns the entries to append to the log.

    Phase 3: just refill the player's actions and tick the turn counter.
    Phase 4+ will run rival AI actions and tick threat clocks here.
    """
    world.turn += 1
    player = world.player
    entries: list[LogEntry] = [
        LogEntry(turn=world.turn, kind=LogKind.SYSTEM, text=f"--- Season {world.turn} ---"),
    ]
    if player is not None:
        world.actions_left = action_budget(player)
    return entries
