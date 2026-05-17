"""World state container - the root of all game state."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .faction import Faction

if TYPE_CHECKING:
    from ..engine.log import LogEntry
    from ..procgen.map_gen import HexMap
    from ..procgen.relationships import RelationshipGraph
    from ..procgen.threats import ThreatRegistry


@dataclass
class World:
    seed: int
    hex_map: "HexMap"
    factions: list[Faction] = field(default_factory=list)
    relationships: "RelationshipGraph | None" = None
    threats: "ThreatRegistry | None" = None
    turn: int = 1
    maelstrom: int = 15  # 0..100; rises with violence and death

    # Player-turn state.
    actions_left: int = 0
    event_log: list["LogEntry"] = field(default_factory=list)

    @property
    def player(self) -> Faction | None:
        for f in self.factions:
            if f.is_player:
                return f
        return None
