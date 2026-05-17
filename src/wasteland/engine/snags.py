"""Snag table - the complications attached to Bitter outcomes.

A Snag is a procedurally-chosen small bad thing. The table is filtered by
archetype class so Mobiles don't draw "Stock drops by 1."
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable

from ..core.faction import ARCHETYPE_CLASS, ArchetypeClass, Faction
from ..core.world import World


@dataclass(frozen=True)
class Snag:
    text: str
    apply: Callable[[World, Faction], str]
    # Class filter. None = any archetype.
    cls: ArchetypeClass | None = None


def _adjust(faction: Faction, key: str, delta: int, floor: int = 0) -> None:
    faction.resources[key] = max(floor, faction.resources.get(key, 0) + delta)


# ----- universal snags ------------------------------------------------------

def _snag_heat_up(world: World, f: Faction) -> str:
    _adjust(f, "heat", +1)
    return "the world is paying attention; Heat +1"


def _snag_maelstrom_up(world: World, f: Faction) -> str:
    world.maelstrom = min(100, world.maelstrom + 1)
    return "the Maelstrom hears; +1 to the global meter"


def _snag_juice_down(world: World, f: Faction) -> str:
    _adjust(f, "juice", -1)
    return "word gets around badly; Juice -1"


# ----- class-specific snags -------------------------------------------------

def _snag_stock_down(world: World, f: Faction) -> str:
    _adjust(f, "stock", -1)
    return "the granary takes a hit; Stock -1"


def _snag_people_down(world: World, f: Faction) -> str:
    _adjust(f, "people", -1)
    return "someone you needed leaves the hold; People -1"


def _snag_gas_down(world: World, f: Faction) -> str:
    _adjust(f, "gas", -1)
    return "a bike runs dry; Gas -1"


def _snag_rider_deserts(world: World, f: Faction) -> str:
    _adjust(f, "riders", -1)
    return "a Rider deserts in the night"


def _snag_cover_down(world: World, f: Faction) -> str:
    _adjust(f, "cover", -1)
    return "someone noticed; Cover -1"


SNAGS: tuple[Snag, ...] = (
    Snag("Heat rises", _snag_heat_up, cls=None),
    Snag("Maelstrom stirs", _snag_maelstrom_up, cls=None),
    Snag("reputation slips", _snag_juice_down, cls=None),
    Snag("granary takes a hit", _snag_stock_down, cls=ArchetypeClass.TERRITORIAL),
    Snag("someone leaves the hold", _snag_people_down, cls=ArchetypeClass.TERRITORIAL),
    Snag("gas tank dry", _snag_gas_down, cls=ArchetypeClass.MOBILE),
    Snag("rider deserts", _snag_rider_deserts, cls=ArchetypeClass.MOBILE),
    Snag("cover slips", _snag_cover_down, cls=ArchetypeClass.EMBEDDED),
)


def roll_snag(world: World, faction: Faction, rng: random.Random) -> str:
    """Pick an eligible Snag for `faction`, apply it, return a one-line description."""
    cls = ARCHETYPE_CLASS[faction.archetype]
    eligible = [s for s in SNAGS if s.cls is None or s.cls is cls]
    chosen = rng.choice(eligible)
    return chosen.apply(world, faction)
