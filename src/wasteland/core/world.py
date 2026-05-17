"""World state container - the root of all game state.

Phase 1 keeps this skeletal: a seed, a turn counter, a list of factions, and a
Maelstrom level. Phase 2 will add the hex map, threat clocks, and the
relationship graph.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .faction import Faction


@dataclass
class World:
    seed: int
    turn: int = 0
    maelstrom: int = 15  # 0..100; rises with violence and death
    factions: list[Faction] = field(default_factory=list)
