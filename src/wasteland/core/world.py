"""World state container - the root of all game state."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

from .faction import Faction

if TYPE_CHECKING:
    from ..engine.log import LogEntry
    from ..procgen.map_gen import HexMap
    from ..procgen.relationships import RelationshipGraph
    from ..procgen.threats import ThreatRegistry
    from .locations import LocationState


class GameOutcomeKind(str, Enum):
    DEFEAT = "defeat"      # the player's faction is finished
    SURVIVED = "survived"  # the player walked away (reserved: voluntary end)


@dataclass
class GameOutcome:
    """Set once when the game ends. While None, the game is live."""
    kind: GameOutcomeKind
    reason: str        # one-line, player-facing ("Your hold revolts and throws open the gates.")
    legacy: int        # the score the run is remembered by
    turn: int          # the season it ended


@dataclass
class World:
    seed: int
    hex_map: "HexMap"
    factions: list[Faction] = field(default_factory=list)
    relationships: "RelationshipGraph | None" = None
    threats: "ThreatRegistry | None" = None
    turn: int = 1
    maelstrom: int = 15  # 0..100; rises with violence, irradiation, and time

    # Hex-bound LocationState by axial (q, r). One per Boss-owned hex. Mobile
    # camps live on the Faction; Embedded factions' buildings live in the
    # host's LocationState.hosted_buildings list.
    locations: dict[tuple[int, int], "LocationState"] = field(default_factory=dict)

    # Player-turn state.
    actions_left: int = 0
    event_log: list["LogEntry"] = field(default_factory=list)

    # None while the game is live; a GameOutcome once it ends.
    outcome: GameOutcome | None = None

    @property
    def player(self) -> Faction | None:
        for f in self.factions:
            if f.is_player:
                return f
        return None

    @property
    def player_idx(self) -> int | None:
        for i, f in enumerate(self.factions):
            if f.is_player:
                return i
        return None

    @property
    def is_over(self) -> bool:
        return self.outcome is not None

    def location_for(self, faction: Faction) -> "LocationState | None":
        """The LocationState a faction owns, or None.

        Territorial: the hex-bound location. Mobile: the camp on the faction.
        Embedded: None (they own Buildings inside a host, not a location).
        """
        if faction.camp is not None:
            return faction.camp
        if faction.location_hex is not None:
            return self.locations.get((faction.location_hex.q, faction.location_hex.r))
        return None
