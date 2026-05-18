"""Buildings: structures that produce resources and live inside LocationState.

Each archetype has exactly one signature starting building in Phase 3.5.
Bosses build on the hex they own; Mobile factions build inside their camp
(which moves with them); Embedded factions build inside their host's
LocationState (in the hosted_buildings list).

Buildings have a condition (0-100) that degrades each turn without an
assigned officer keeping it up. Yields scale linearly with condition.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .faction import Archetype


class BuildingType(str, Enum):
    GRANARY     = "granary"
    GARAGE      = "garage"
    DRILL_YARD  = "drill-yard"
    SHRINE      = "shrine"
    WORKSHOP    = "workshop"
    HIDDEN_CELL = "hidden-cell"
    BACKROOM    = "backroom"
    TAVERN      = "tavern"


# One signature building per archetype - what a faction starts the game with.
STARTING_BUILDING: dict[Archetype, BuildingType] = {
    Archetype.BOSS:       BuildingType.GRANARY,
    Archetype.ROADLORD:   BuildingType.GARAGE,
    Archetype.WARHOUND:   BuildingType.DRILL_YARD,
    Archetype.PROPHET:    BuildingType.SHRINE,
    Archetype.TINKER:     BuildingType.WORKSHOP,
    Archetype.WHISPER:    BuildingType.HIDDEN_CELL,
    Archetype.FIXER:      BuildingType.BACKROOM,
    Archetype.HOSTKEEPER: BuildingType.TAVERN,
}


# Per-turn yield at level 1 / condition 100. Actual yield is
# floor(base * level * condition / 100).
BUILDING_YIELDS: dict[BuildingType, dict[str, int]] = {
    BuildingType.GRANARY:     {"stock":     2},
    BuildingType.GARAGE:      {"gas":       2},
    BuildingType.DRILL_YARD:  {"riders":    1},
    BuildingType.SHRINE:      {"followers": 1},
    BuildingType.WORKSHOP:    {"barter":    1},
    BuildingType.HIDDEN_CELL: {"secrets":   1},
    BuildingType.BACKROOM:    {"barter":    1},
    BuildingType.TAVERN:      {"juice":     1, "secrets": 1},
}


# Which officer role maintains each archetype's signature building. The
# matched officer (by role) on the owning faction gets auto-assigned at
# procgen time. If they die or are reassigned the building decays.
BUILDING_KEEPER_ROLE: dict[tuple[Archetype, BuildingType], str] = {
    (Archetype.BOSS,       BuildingType.GRANARY):     "steward",
    (Archetype.ROADLORD,   BuildingType.GARAGE):      "outrider",
    (Archetype.WARHOUND,   BuildingType.DRILL_YARD):  "sergeant",
    (Archetype.PROPHET,    BuildingType.SHRINE):      "chosen",
    (Archetype.TINKER,     BuildingType.WORKSHOP):    "apprentice",
    (Archetype.WHISPER,    BuildingType.HIDDEN_CELL): "sleeper",
    (Archetype.FIXER,      BuildingType.BACKROOM):    "smuggler",
    (Archetype.HOSTKEEPER, BuildingType.TAVERN):      "bartender",
}


@dataclass
class Building:
    type: BuildingType
    owner_faction_idx: int          # index into world.factions
    level: int = 1                  # 1..3 in design; only L1 in this phase
    condition: int = 100            # 0..100; degrades without keeper
    assigned_officer: str | None = None  # officer's name; None = unassigned

    def yield_now(self) -> dict[str, int]:
        """Floor-scaled per-turn yield. Condition 100 produces base * level."""
        out: dict[str, int] = {}
        base = BUILDING_YIELDS.get(self.type, {})
        for resource, amount in base.items():
            out[resource] = (amount * self.level * self.condition) // 100
        return out
