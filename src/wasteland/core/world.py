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
    from .locations import LocationState


@dataclass
class World:
    seed: int
    hex_map: "HexMap"
    factions: list[Faction] = field(default_factory=list)
    relationships: "RelationshipGraph | None" = None
    threats: "ThreatRegistry | None" = None
    turn: int = 1
    maelstrom: int = 15  # 0..100; rises with violence and death

    # Hex-bound LocationState by axial (q, r). One per Boss-owned hex. Mobile
    # camps live on the Faction; Embedded factions' buildings live in the
    # host's LocationState.hosted_buildings list.
    locations: dict[tuple[int, int], "LocationState"] = field(default_factory=dict)

    # Player-turn state.
    actions_left: int = 0
    event_log: list["LogEntry"] = field(default_factory=list)

    @property
    def player(self) -> Faction | None:
        for f in self.factions:
            if f.is_player:
                return f
        return None
