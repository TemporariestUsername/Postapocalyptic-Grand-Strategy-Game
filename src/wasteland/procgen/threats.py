"""Starting threat clocks.

Each non-player faction rolls 1-2 starting threats, each targeting another
faction. The threat is just a labeled Clock plus the source/target indices;
the engine (Phase 3+) implements what happens when the clock fires.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum

from ..core.clock import Clock
from ..core.faction import ARCHETYPE_CLASS, Archetype, ArchetypeClass, Faction


class ThreatKind(str, Enum):
    """What a front does to its target when its clock fills. The engine
    (engine/threats.py) maps each kind to a concrete consequence."""
    RAID = "raid"            # burn Stock/Barter, knock Walls
    EXTORT = "extort"        # bleed Barter
    MARCH = "march"          # grind Walls, then People
    HUNT = "hunt"            # cut a Mobile's Riders/Gas
    SCHISM = "schism"        # split an Embedded's Followers
    UNDERMINE = "undermine"  # sap a hold's Authority and People
    EXPOSE = "expose"        # strip an Embedded's Cover
    DEBTS = "debts"          # collect Barter/Juice


# Templates: (source-class-filter, target-class-filter, label-pattern, segments, kind)
# label-pattern uses {source} and {target} for substitution.
_TEMPLATES: list[tuple[ArchetypeClass | None, ArchetypeClass | None, str, int, ThreatKind]] = [
    (ArchetypeClass.MOBILE, ArchetypeClass.TERRITORIAL,
     "{source} raid {target}", 4, ThreatKind.RAID),
    (ArchetypeClass.MOBILE, ArchetypeClass.TERRITORIAL,
     "{source} extort tolls outside {target}", 6, ThreatKind.EXTORT),
    (ArchetypeClass.TERRITORIAL, ArchetypeClass.TERRITORIAL,
     "{source} march on {target}", 8, ThreatKind.MARCH),
    (ArchetypeClass.TERRITORIAL, ArchetypeClass.MOBILE,
     "{source} hunt {target}", 6, ThreatKind.HUNT),
    (ArchetypeClass.EMBEDDED, None,
     "{source} schism the flock against {target}", 6, ThreatKind.SCHISM),
    (ArchetypeClass.EMBEDDED, ArchetypeClass.TERRITORIAL,
     "{source} undermine {target} from within", 8, ThreatKind.UNDERMINE),
    (ArchetypeClass.EMBEDDED, ArchetypeClass.EMBEDDED,
     "{source} expose {target} to the host", 4, ThreatKind.EXPOSE),
    (None, None,
     "{source} call in old debts on {target}", 4, ThreatKind.DEBTS),
]


@dataclass
class Threat:
    source_idx: int   # index into the world's faction list
    target_idx: int
    clock: Clock
    kind: ThreatKind = ThreatKind.DEBTS
    # Visible to the player only when their faction's Cunning is high enough on
    # the source. Phase 2 records this flag at generation time; Phase 4+ recomputes.
    visible_to_player: bool = False


@dataclass
class ThreatRegistry:
    threats: list[Threat] = field(default_factory=list)


def _eligible_templates(
    src: Faction, tgt: Faction
) -> list[tuple[str, int, ThreatKind]]:
    """Return templates eligible for this src/tgt pair, preferring specific over generic.

    A "specific" template names both src and tgt class filters. We return those
    if any exist; only if none match do we fall back to half-generic or fully-
    generic templates. This keeps the generic "call in old debts" template
    from drowning out the flavored ones.
    """
    src_cls = ARCHETYPE_CLASS[src.archetype]
    tgt_cls = ARCHETYPE_CLASS[tgt.archetype]
    specific: list[tuple[str, int, ThreatKind]] = []
    half: list[tuple[str, int, ThreatKind]] = []
    generic: list[tuple[str, int, ThreatKind]] = []
    for src_filter, tgt_filter, pattern, segs, kind in _TEMPLATES:
        if src_filter is not None and src_filter is not src_cls:
            continue
        if tgt_filter is not None and tgt_filter is not tgt_cls:
            continue
        if src_filter is not None and tgt_filter is not None:
            specific.append((pattern, segs, kind))
        elif src_filter is None and tgt_filter is None:
            generic.append((pattern, segs, kind))
        else:
            half.append((pattern, segs, kind))
    return specific or half or generic


def seed_threats(factions: list[Faction], rng: random.Random) -> ThreatRegistry:
    """Generate 1-2 starting threats per non-player faction.

    Players don't get auto-generated threats *against* their own factions yet;
    Phase 3 will introduce reactive threat generation based on player Heat.
    """
    registry = ThreatRegistry()
    n = len(factions)
    if n < 2:
        return registry

    for i, src in enumerate(factions):
        if src.is_player:
            continue
        n_threats = rng.choices((1, 2), weights=(60, 40))[0]
        # Pick distinct targets, prefer different-archetype factions for variety.
        candidate_indices = [j for j in range(n) if j != i]
        rng.shuffle(candidate_indices)
        used: set[int] = set()
        for j in candidate_indices:
            if len(used) >= n_threats:
                break
            tgt = factions[j]
            templates = _eligible_templates(src, tgt)
            if not templates:
                continue
            pattern, segs, kind = rng.choice(templates)
            label = pattern.format(source=src.name, target=tgt.name)
            registry.threats.append(
                Threat(
                    source_idx=i,
                    target_idx=j,
                    clock=Clock(label=label, segments=segs, filled=rng.randint(0, segs // 2)),
                    kind=kind,
                )
            )
            used.add(j)

    return registry
