"""Faction archetypes and the Faction dataclass.

Asymmetry lives here. Every archetype belongs to one of three classes - Territorial,
Mobile, or Embedded - and a faction's class determines what kind of game it plays:
who it can target, what resources it spends, what defeats it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

from .hex import Hex

if TYPE_CHECKING:
    from ..engine.fortune import FortuneDeck


class ArchetypeClass(str, Enum):
    """Three structural relationships to geography."""
    TERRITORIAL = "territorial"  # owns hexes
    MOBILE = "mobile"            # moves between hexes, owns none
    EMBEDDED = "embedded"        # lives inside a host hardhold


class Archetype(str, Enum):
    """The eight playable archetypes. All eight are also possible AI factions."""
    # Territorial
    BOSS = "boss"
    # Mobile
    ROADLORD = "roadlord"
    WARHOUND = "warhound"
    # Embedded
    PROPHET = "prophet"
    TINKER = "tinker"
    WHISPER = "whisper"
    FIXER = "fixer"
    HOSTKEEPER = "hostkeeper"


ARCHETYPE_CLASS: dict[Archetype, ArchetypeClass] = {
    Archetype.BOSS: ArchetypeClass.TERRITORIAL,
    Archetype.ROADLORD: ArchetypeClass.MOBILE,
    Archetype.WARHOUND: ArchetypeClass.MOBILE,
    Archetype.PROPHET: ArchetypeClass.EMBEDDED,
    Archetype.TINKER: ArchetypeClass.EMBEDDED,
    Archetype.WHISPER: ArchetypeClass.EMBEDDED,
    Archetype.FIXER: ArchetypeClass.EMBEDDED,
    Archetype.HOSTKEEPER: ArchetypeClass.EMBEDDED,
}


# One-line pitches shown at archetype select. Kept here (not in a JSON file) so
# adding an archetype is a single-file change.
ARCHETYPE_PITCH: dict[Archetype, str] = {
    Archetype.BOSS:       "You hold the gate. The hungry sleep behind your walls.",
    Archetype.ROADLORD:   "The road is yours. You sleep where you stop.",
    Archetype.WARHOUND:   "You sell violence by the squad-week.",
    Archetype.PROPHET:    "The Maelstrom whispers, and your flock obeys.",
    Archetype.TINKER:     "You make miracles from scrap. The hold needs you more than it knows.",
    Archetype.WHISPER:    "You hear thoughts. You leave suggestions. Nobody remembers you.",
    Archetype.FIXER:      "Every hold has a back door. You know them all.",
    Archetype.HOSTKEEPER: "The bar belongs to you. So do its secrets.",
}


@dataclass
class FactionStats:
    """The five faction-scale stats. Reflavored from AW's Cool/Hard/Hot/Sharp/Weird."""
    grit: int = 0       # endurance under pressure
    menace: int = 0     # capacity for violence
    charm: int = 0      # ability to bargain
    insight: int = 0    # information and foresight
    weird: int = 0      # connection to the Maelstrom


@dataclass
class Faction:
    """A faction is its leader plus its standing. Resource bag is class-dependent."""
    archetype: Archetype
    name: str
    leader_name: str
    stats: FactionStats
    # Resource values keyed by Resource.value. Not strongly typed here because
    # different archetypes hold different keys.
    resources: dict[str, int] = field(default_factory=dict)

    # Geographic state - asymmetric by class:
    #   Territorial: location_hex is the hold's hex; host_holds is empty.
    #   Mobile:      location_hex is the hex it's in this turn; host_holds is empty.
    #   Embedded:    location_hex is None; host_holds is the list of hold names
    #                this faction lives inside (one for most, 1+ for Fixers).
    location_hex: Hex | None = None
    host_holds: list[str] = field(default_factory=list)

    # Human-readable location description for rosters / UI. Filled by procgen.
    location_label: str | None = None

    # True for the faction the player controls. Procgen sets exactly one.
    is_player: bool = False

    # Resolution state. Initialized to a fresh deck by procgen; left as None on
    # demo factions that never enter the engine.
    fortune: "FortuneDeck" = field(default=None)  # type: ignore[assignment]

    @property
    def archetype_class(self) -> ArchetypeClass:
        return ARCHETYPE_CLASS[self.archetype]
