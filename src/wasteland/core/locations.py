"""LocationState: the structural state attached to a settled place.

Bosses own a hex-bound LocationState (stored in world.locations). Mobile
factions carry a LocationState on the Faction itself as `camp` - it moves
with them and doesn't appear in world.locations. Embedded factions don't
own a LocationState; instead, their buildings live in the
`hosted_buildings` list of the host hold's LocationState.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .buildings import Building
from .hex import Hex


@dataclass
class LocationState:
    owner_faction_idx: int                  # the faction that owns this place
    hex: Hex | None = None                  # None for Mobile camps
    population: int = 60                    # structural 0..100 (distinct from `People` resource)
    discontent: int = 0                     # 0..100; rises with scarcity, low authority
    authority: int = 50                     # 0..100; baseline grip on the place
    buildings: list[Building] = field(default_factory=list)
    hosted_buildings: list[Building] = field(default_factory=list)
