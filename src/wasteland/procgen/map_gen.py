"""Hex map generation.

Algorithm (deterministic given an explicit Random):
    1. Seed K fertile pockets at minimum spacing; BFS them outward 2 rings.
    2. Seed L irradiated zones; BFS them outward 1-2 rings.
    3. Fill remaining hexes via distance-from-fertile: close -> ruins, mid ->
       wastes, far -> deep_wilds. Edges always go to deep_wilds.
    4. Trace roads between each pair of nearest fertile-pocket centers using
       Dijkstra over terrain-traversal costs.
    5. Tag scarcity per hex based on terrain, road-adjacency, and irradiation.
"""

from __future__ import annotations

import heapq
import random
from collections import deque
from dataclasses import dataclass, field

from ..core.hex import Hex, distance, neighbors


# Terrain types - keep these stable strings; tests and rendering key off them.
TERRAIN_WASTES = "wastes"
TERRAIN_RUINS = "ruins"
TERRAIN_FERTILE = "fertile"
TERRAIN_IRRADIATED = "irradiated"
TERRAIN_DEEP_WILDS = "deep_wilds"

# Scarcity tags.
SCARCITY_BARREN = "barren"
SCARCITY_PICKED_OVER = "picked-over"
SCARCITY_FERTILE_BUT_CLAIMED = "fertile-but-claimed"
SCARCITY_RICH = "rich"
SCARCITY_IRRADIATED = "irradiated"


# Movement cost per terrain - drives road tracing.
_TRAVERSE_COST = {
    TERRAIN_FERTILE: 1,
    TERRAIN_RUINS: 2,
    TERRAIN_WASTES: 3,
    TERRAIN_IRRADIATED: 10,  # roads will route around if at all possible
    TERRAIN_DEEP_WILDS: 6,
}


@dataclass
class HexTile:
    q: int
    r: int
    terrain: str
    scarcity: str
    maelstrom_bias: int = 0  # passive Maelstrom contribution per turn

    @property
    def hex(self) -> Hex:
        return Hex(self.q, self.r)


@dataclass
class HexMap:
    width: int
    height: int
    tiles: dict[tuple[int, int], HexTile]
    fertile_pockets: list[Hex] = field(default_factory=list)
    roads: list[list[Hex]] = field(default_factory=list)

    # Convenience accessor; the dict-of-tuple key matches axial coords (q, r).
    def get(self, h: Hex) -> HexTile | None:
        return self.tiles.get((h.q, h.r))

    def all_hexes(self) -> list[Hex]:
        return [t.hex for t in self.tiles.values()]

    def in_bounds(self, h: Hex) -> bool:
        return (h.q, h.r) in self.tiles


def _all_hex_coords(width: int, height: int) -> list[tuple[int, int]]:
    """Axial coords for a rhombus shape - simple and bounds-checkable."""
    return [(q, r) for r in range(height) for q in range(width)]


def _bfs_paint(
    centers: list[Hex],
    rings: int,
    width: int,
    height: int,
) -> set[tuple[int, int]]:
    """Return the set of axial coords within `rings` of any center, bounded by the map."""
    out: set[tuple[int, int]] = set()
    for center in centers:
        seen: set[tuple[int, int]] = {(center.q, center.r)}
        frontier: deque[tuple[Hex, int]] = deque([(center, 0)])
        while frontier:
            cur, depth = frontier.popleft()
            if 0 <= cur.q < width and 0 <= cur.r < height:
                out.add((cur.q, cur.r))
            if depth >= rings:
                continue
            for n in neighbors(cur):
                if (n.q, n.r) in seen:
                    continue
                if 0 <= n.q < width and 0 <= n.r < height:
                    seen.add((n.q, n.r))
                    frontier.append((n, depth + 1))
    return out


def _pick_spaced(
    rng: random.Random,
    width: int,
    height: int,
    n: int,
    min_distance: int,
    margin: int = 1,
) -> list[Hex]:
    """Pick `n` hexes inside the map with at least min_distance between them.

    Best-effort: tries random samples up to a bounded count, then returns what
    it has (deterministic given the rng).
    """
    chosen: list[Hex] = []
    attempts = 0
    max_attempts = n * 80
    while len(chosen) < n and attempts < max_attempts:
        attempts += 1
        q = rng.randint(margin, width - 1 - margin)
        r = rng.randint(margin, height - 1 - margin)
        candidate = Hex(q, r)
        if all(distance(candidate, c) >= min_distance for c in chosen):
            chosen.append(candidate)
    return chosen


def _dijkstra_path(
    tiles: dict[tuple[int, int], HexTile],
    start: Hex,
    goal: Hex,
) -> list[Hex]:
    """Shortest path by traversal cost. Used to trace roads.

    Returns the path including start and goal. Empty if no path (shouldn't
    happen on a connected grid).
    """
    if start == goal:
        return [start]
    came_from: dict[tuple[int, int], tuple[int, int]] = {}
    cost_so_far: dict[tuple[int, int], int] = {(start.q, start.r): 0}
    # Heap entries include a tiebreaker counter so we never compare Hex values
    # (Hex is frozen but not ordered).
    counter = 0
    frontier: list[tuple[int, int, Hex]] = [(0, counter, start)]
    while frontier:
        _, _, cur = heapq.heappop(frontier)
        if cur == goal:
            break
        for n in neighbors(cur):
            tile = tiles.get((n.q, n.r))
            if tile is None:
                continue
            new_cost = cost_so_far[(cur.q, cur.r)] + _TRAVERSE_COST[tile.terrain]
            key = (n.q, n.r)
            if key not in cost_so_far or new_cost < cost_so_far[key]:
                cost_so_far[key] = new_cost
                came_from[key] = (cur.q, cur.r)
                counter += 1
                heapq.heappush(frontier, (new_cost, counter, n))

    # Reconstruct.
    if (goal.q, goal.r) not in came_from and start != goal:
        return []
    path: list[Hex] = [goal]
    key = (goal.q, goal.r)
    while key != (start.q, start.r):
        prev = came_from.get(key)
        if prev is None:
            return []
        path.append(Hex(*prev))
        key = prev
    path.reverse()
    return path


def _classify_scarcity(terrain: str, on_road: bool) -> str:
    if terrain == TERRAIN_IRRADIATED:
        return SCARCITY_IRRADIATED
    if terrain == TERRAIN_FERTILE:
        return SCARCITY_RICH if not on_road else SCARCITY_FERTILE_BUT_CLAIMED
    if terrain == TERRAIN_RUINS:
        return SCARCITY_PICKED_OVER
    if terrain == TERRAIN_WASTES:
        return SCARCITY_PICKED_OVER if on_road else SCARCITY_BARREN
    return SCARCITY_BARREN  # deep_wilds


def generate_map(
    rng: random.Random,
    width: int = 24,
    height: int = 16,
    n_fertile_pockets: int | None = None,
    n_irradiated_zones: int | None = None,
) -> HexMap:
    """Generate a procedural hex map deterministically from `rng`."""
    if n_fertile_pockets is None:
        n_fertile_pockets = rng.randint(4, 7)
    if n_irradiated_zones is None:
        n_irradiated_zones = rng.randint(1, 3)

    # 1. Pick fertile-pocket centers with spacing >= 5 hexes.
    fertile_centers = _pick_spaced(rng, width, height, n_fertile_pockets, min_distance=5, margin=2)
    # 2. Pick irradiated centers - allowed to be closer to map edges.
    irradiated_centers = _pick_spaced(rng, width, height, n_irradiated_zones, min_distance=4, margin=1)

    fertile_tiles = _bfs_paint(fertile_centers, rings=2, width=width, height=height)
    # Irradiated zones override fertile if they overlap (the wasteland is
    # cruel; today's farm is tomorrow's hot zone).
    irradiated_tiles = _bfs_paint(irradiated_centers, rings=rng.randint(1, 2), width=width, height=height)
    fertile_tiles -= irradiated_tiles

    # 3. Build tiles. Default to wastes; promote to ruins near fertile; demote
    #    to deep_wilds far from fertile or at the map edge.
    tiles: dict[tuple[int, int], HexTile] = {}
    for (q, r) in _all_hex_coords(width, height):
        h = Hex(q, r)
        if (q, r) in irradiated_tiles:
            terrain = TERRAIN_IRRADIATED
        elif (q, r) in fertile_tiles:
            terrain = TERRAIN_FERTILE
        else:
            # Edge -> deep_wilds.
            is_edge = q == 0 or r == 0 or q == width - 1 or r == height - 1
            if is_edge:
                terrain = TERRAIN_DEEP_WILDS
            else:
                # Mid-distance to nearest fertile pocket decides ruins vs wastes
                # vs deep_wilds. Mixed in some rng to keep maps textured.
                if fertile_centers:
                    d = min(distance(h, fc) for fc in fertile_centers)
                else:
                    d = 99
                roll = rng.random()
                if d <= 3 and roll < 0.55:
                    terrain = TERRAIN_RUINS
                elif d <= 6:
                    terrain = TERRAIN_WASTES if roll < 0.75 else TERRAIN_RUINS
                else:
                    terrain = TERRAIN_DEEP_WILDS if roll < 0.4 else TERRAIN_WASTES
        tiles[(q, r)] = HexTile(q=q, r=r, terrain=terrain, scarcity=SCARCITY_BARREN)

    # 4. Trace roads: connect each fertile center to its single nearest other
    #    fertile center. This produces a sparse graph (not fully connected) so
    #    the wasteland still feels broken up.
    roads: list[list[Hex]] = []
    on_road: set[tuple[int, int]] = set()
    for i, a in enumerate(fertile_centers):
        if not fertile_centers[i + 1 :]:
            # The last one may already be connected from another's perspective.
            continue
        # Connect each fertile center to its nearest neighbor center (and don't
        # double-trace - dedup by sorted pair).
        others = sorted(
            (oc for oc in fertile_centers if oc != a),
            key=lambda oc: distance(a, oc),
        )
        if not others:
            continue
        b = others[0]
        path = _dijkstra_path(tiles, a, b)
        if path:
            roads.append(path)
            for step in path:
                on_road.add((step.q, step.r))

    # 5. Scarcity tags + Maelstrom bias.
    for key, tile in tiles.items():
        tile.scarcity = _classify_scarcity(tile.terrain, key in on_road)
        if tile.terrain == TERRAIN_IRRADIATED:
            tile.maelstrom_bias = 1

    return HexMap(
        width=width,
        height=height,
        tiles=tiles,
        fertile_pockets=fertile_centers,
        roads=roads,
    )
