"""Hex map generation - stub for Phase 1.

The full pipeline is documented in docs/PROCGEN.md. Phase 1 defines the
interface and returns a tiny placeholder map so downstream code can be wired
up. Phase 2 implements terrain bands, road tracing, and scarcity tags.
"""

from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass
class HexTile:
    q: int
    r: int
    terrain: str  # one of: wastes, ruins, fertile, irradiated, deep_wilds
    scarcity: str  # one of: barren, picked-over, fertile-but-claimed, rich, irradiated


@dataclass
class HexMap:
    width: int
    height: int
    tiles: list[HexTile]


def generate_map(rng: random.Random, width: int = 24, height: int = 16) -> HexMap:
    """Phase 1: returns a flat map of 'wastes' tiles. Phase 2 will implement the real generator.

    Kept here as a contract: any caller can already write code against HexMap
    and HexTile, and the swap to a real generator is a single-file change.
    """
    tiles = [
        HexTile(q=q, r=r, terrain="wastes", scarcity="picked-over")
        for r in range(height)
        for q in range(width)
    ]
    return HexMap(width=width, height=height, tiles=tiles)
