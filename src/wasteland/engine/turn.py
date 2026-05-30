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

    Order:
        1. Bump the turn counter and emit the Season header.
        2. Run Upkeep (character drift, building yields, Heat decay, economy,
           the Maelstrom timer).
        3. Advance threat clocks; fire any that fill.
        4. Check endgame; if the run is over, record the outcome and stop -
           no action refill for a finished game.
        5. Otherwise, refill the player's action budget.

    Rival AI actions land in Phase 5; until then the pre-seeded fronts (step 3)
    are how the world acts.
    """
    from .endgame import check_endgame
    from .threats import advance_threats
    from .upkeep import run_upkeep

    if world.is_over:
        return []

    world.turn += 1
    player = world.player
    entries: list[LogEntry] = [
        LogEntry(turn=world.turn, kind=LogKind.SYSTEM, text=f"--- Season {world.turn} ---"),
    ]
    entries.extend(run_upkeep(world, rng))
    entries.extend(advance_threats(world, rng))

    outcome = check_endgame(world)
    if outcome is not None:
        world.outcome = outcome
        entries.append(LogEntry(
            turn=world.turn, kind=LogKind.SNAG,
            text=f"It ends. {outcome.reason} (Legacy {outcome.legacy}.)",
        ))
        world.actions_left = 0
        return entries

    if player is not None:
        world.actions_left = action_budget(player)
    return entries
