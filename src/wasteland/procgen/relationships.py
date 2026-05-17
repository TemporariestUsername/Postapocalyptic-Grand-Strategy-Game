"""Starting relationship graph between factions.

For each ordered pair (a, b) we generate:
    - sentiment ∈ [-100, +100] — a's feelings about b
    - a list of grudge tags drawn from a small vocabulary, used as flavor text

Sentiment is asymmetric (a may hate b more than b hates a) so we store
directed edges keyed by (a_index, b_index).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from ..core.faction import ARCHETYPE_CLASS, Archetype, ArchetypeClass, Faction
from ..core.hex import distance


# Archetype-pair sentiment baselines (mean, jitter). Symmetric for now;
# asymmetry comes from grudges layered on top.
_PAIR_BASELINES: dict[tuple[ArchetypeClass, ArchetypeClass], tuple[int, int]] = {
    (ArchetypeClass.TERRITORIAL, ArchetypeClass.TERRITORIAL): (-10, 25),
    (ArchetypeClass.TERRITORIAL, ArchetypeClass.MOBILE): (-25, 20),
    (ArchetypeClass.MOBILE, ArchetypeClass.MOBILE): (-15, 25),
    (ArchetypeClass.TERRITORIAL, ArchetypeClass.EMBEDDED): (0, 30),
    (ArchetypeClass.MOBILE, ArchetypeClass.EMBEDDED): (-10, 20),
    (ArchetypeClass.EMBEDDED, ArchetypeClass.EMBEDDED): (-5, 30),
}


def _baseline(a: ArchetypeClass, b: ArchetypeClass) -> tuple[int, int]:
    if (a, b) in _PAIR_BASELINES:
        return _PAIR_BASELINES[(a, b)]
    return _PAIR_BASELINES[(b, a)]


_GRUDGE_VERBS = (
    "blames", "owes blood to", "has unfinished business with",
    "swore an oath against", "is hunted by", "covets the territory of",
    "stole from", "betrayed", "left for dead", "outbid",
)


@dataclass
class RelationshipGraph:
    # (a_index, b_index) -> sentiment in [-100, +100]
    sentiments: dict[tuple[int, int], int] = field(default_factory=dict)
    # (a_index, b_index) -> short grudge string, one-line flavor.
    grudges: dict[tuple[int, int], str] = field(default_factory=dict)

    def sentiment(self, a_idx: int, b_idx: int) -> int:
        return self.sentiments.get((a_idx, b_idx), 0)

    def grudge(self, a_idx: int, b_idx: int) -> str | None:
        return self.grudges.get((a_idx, b_idx))


def _adjacency_bonus(a: Faction, b: Faction) -> int:
    """Two Bosses with adjacent holds skew more hostile."""
    if a.archetype is not Archetype.BOSS or b.archetype is not Archetype.BOSS:
        return 0
    if a.location_hex is None or b.location_hex is None:
        return 0
    d = distance(a.location_hex, b.location_hex)
    if d <= 3:
        return -25
    if d <= 6:
        return -10
    return 0


def _embedded_host_bonus(a: Faction, b: Faction) -> int:
    """A Boss whose hold hosts an Embedded faction has a complicated baseline.
    Currently a no-op: the wide jitter in the Boss/Embedded baseline carries
    enough variance. Reserved as a hook for later asymmetric weighting.
    """
    return 0


def build_relationships(factions: list[Faction], rng: random.Random) -> RelationshipGraph:
    """Pairwise sentiment + a sparse layer of grudges. Deterministic given rng."""
    graph = RelationshipGraph()

    n = len(factions)
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            a, b = factions[i], factions[j]
            mean, jitter = _baseline(ARCHETYPE_CLASS[a.archetype], ARCHETYPE_CLASS[b.archetype])
            value = mean + rng.randint(-jitter, jitter)
            value += _adjacency_bonus(a, b)
            value += _embedded_host_bonus(a, b)
            value = max(-100, min(100, value))
            graph.sentiments[(i, j)] = value

    # Sparse grudges: each faction gets one named grudge against a strongly-
    # negative target. This is the layer that produces the gazetteer flavor.
    for i, a in enumerate(factions):
        ranked = sorted(
            ((j, graph.sentiment(i, j)) for j in range(n) if j != i),
            key=lambda kv: kv[1],
        )
        if not ranked:
            continue
        target_idx, _ = ranked[0]
        verb = rng.choice(_GRUDGE_VERBS)
        graph.grudges[(i, target_idx)] = (
            f"{a.name} {verb} {factions[target_idx].name}."
        )

    return graph
