"""Pointy-top hex grid math.

Axial coordinates (q, r). Conversion to screen pixels assumes pointy-top
hexes - the flat sides are top/bottom, the points are left/right.

References:
    https://www.redblobgames.com/grids/hexagons/
"""

from __future__ import annotations

import math
from dataclasses import dataclass

SQRT3 = math.sqrt(3)


@dataclass(frozen=True)
class Hex:
    q: int
    r: int

    def __add__(self, other: "Hex") -> "Hex":
        return Hex(self.q + other.q, self.r + other.r)

    def __sub__(self, other: "Hex") -> "Hex":
        return Hex(self.q - other.q, self.r - other.r)


# The six axial neighbor offsets for pointy-top hexes.
HEX_DIRS = (
    Hex(+1, 0), Hex(+1, -1), Hex(0, -1),
    Hex(-1, 0), Hex(-1, +1), Hex(0, +1),
)


def neighbors(h: Hex) -> tuple[Hex, ...]:
    return tuple(h + d for d in HEX_DIRS)


def distance(a: Hex, b: Hex) -> int:
    """Axial hex distance."""
    return (abs(a.q - b.q) + abs(a.r - b.r) + abs(a.q + a.r - b.q - b.r)) // 2


def to_pixel(h: Hex, size: float, origin: tuple[float, float] = (0.0, 0.0)) -> tuple[float, float]:
    """Pointy-top hex center in pixels."""
    ox, oy = origin
    x = size * SQRT3 * (h.q + h.r / 2)
    y = size * 1.5 * h.r
    return (ox + x, oy + y)


def corners(center: tuple[float, float], size: float) -> list[tuple[float, float]]:
    """Six corner points of a pointy-top hex, suitable for pygame.draw.polygon."""
    cx, cy = center
    pts = []
    for i in range(6):
        # Pointy-top: first corner at +30 degrees offset from horizontal.
        angle = math.pi / 180 * (60 * i - 30)
        pts.append((cx + size * math.cos(angle), cy + size * math.sin(angle)))
    return pts
