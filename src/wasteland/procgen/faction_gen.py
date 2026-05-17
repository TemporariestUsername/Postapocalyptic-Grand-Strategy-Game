"""Faction roster generation.

Phase 1 implements the *demo* roster used by `python -m wasteland --roster`:
one named faction per archetype, with a procedural leader and a single starting
grudge. This is enough to prove the asymmetric data model and the determinism
contract end-to-end.

Phase 2 will extend this into the full generator described in docs/PROCGEN.md:
- Place 4-7 hardholds on the generated map.
- Place 1-3 mobile factions in road/wasteland hexes.
- For each hold, roll 0-3 embedded factions hosted inside it.
- Build a starting relationship graph weighted by archetype proximity rules.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from ..core.faction import (
    ARCHETYPE_CLASS,
    Archetype,
    ArchetypeClass,
    Faction,
    FactionStats,
)
from ..core.resources import (
    EMBEDDED_RESOURCES,
    MOBILE_RESOURCES,
    TERRITORIAL_RESOURCES,
    UNIVERSAL_RESOURCES,
    Resource,
)
from ..rng import derive
from . import names


# Per-archetype stat weighting. Means are skewed; sum stays roughly constant so
# no archetype gets a flat advantage.
_STAT_WEIGHTS: dict[Archetype, dict[str, int]] = {
    Archetype.BOSS:       {"grit": 3, "menace": 2, "charm": 2, "insight": 1, "weird": 0},
    Archetype.ROADLORD:   {"grit": 2, "menace": 3, "charm": 1, "insight": 1, "weird": 1},
    Archetype.WARHOUND:   {"grit": 2, "menace": 3, "charm": 0, "insight": 2, "weird": 1},
    Archetype.PROPHET:    {"grit": 1, "menace": 0, "charm": 3, "insight": 1, "weird": 3},
    Archetype.TINKER:     {"grit": 1, "menace": 0, "charm": 1, "insight": 3, "weird": 3},
    Archetype.WHISPER:    {"grit": 0, "menace": 1, "charm": 1, "insight": 3, "weird": 3},
    Archetype.FIXER:      {"grit": 1, "menace": 1, "charm": 3, "insight": 3, "weird": 0},
    Archetype.HOSTKEEPER: {"grit": 1, "menace": 1, "charm": 3, "insight": 2, "weird": 1},
}


def _roll_stats(rng: random.Random, archetype: Archetype) -> FactionStats:
    weights = _STAT_WEIGHTS[archetype]
    jitter = lambda key: weights[key] + rng.randint(-1, 1)  # noqa: E731
    return FactionStats(
        grit=jitter("grit"),
        menace=jitter("menace"),
        charm=jitter("charm"),
        insight=jitter("insight"),
        weird=jitter("weird"),
    )


def _starting_resources(rng: random.Random, archetype: Archetype) -> dict[str, int]:
    cls = ARCHETYPE_CLASS[archetype]
    bag: dict[str, int] = {r.value: rng.randint(1, 4) for r in UNIVERSAL_RESOURCES}
    if cls is ArchetypeClass.TERRITORIAL:
        for r in TERRITORIAL_RESOURCES:
            bag[r.value] = rng.randint(2, 6)
    elif cls is ArchetypeClass.MOBILE:
        for r in MOBILE_RESOURCES:
            bag[r.value] = rng.randint(2, 6)
    else:  # EMBEDDED
        for r in EMBEDDED_RESOURCES:
            bag[r.value] = rng.randint(2, 5)
    return bag


def _name_for(rng: random.Random, archetype: Archetype, leader: str) -> str:
    cls = ARCHETYPE_CLASS[archetype]
    if cls is ArchetypeClass.TERRITORIAL:
        return names.hold_name(rng)
    if cls is ArchetypeClass.MOBILE:
        return names.gang_name(rng)
    # EMBEDDED: Prophets get cult names, the rest get outfit names.
    if archetype is Archetype.PROPHET:
        return names.cult_name(rng)
    return names.outfit_name(rng, leader_first_name=leader)


def _location_hint(rng: random.Random, archetype: Archetype, holds: list[str]) -> str | None:
    """Phase 1 location is a string hint, not a hex coord."""
    cls = ARCHETYPE_CLASS[archetype]
    if cls is ArchetypeClass.TERRITORIAL:
        # The hold IS the faction's location; for the demo we just echo it.
        return "their own gates"
    if cls is ArchetypeClass.MOBILE:
        return rng.choice(("the long road", "the wastes", "the road between holds"))
    # EMBEDDED: pick a host hold.
    if holds:
        return f"hosted in {rng.choice(holds)}"
    return "hosted somewhere"


@dataclass
class DemoFaction:
    """Phase 1 demo wrapper - Faction plus a printable starting grudge line."""
    faction: Faction
    grudge: str


def generate_demo_roster(seed: int) -> list[DemoFaction]:
    """Generate one faction per archetype, with a starting grudge. Deterministic for `seed`.

    Returns factions in a stable order (territorial first, then mobile, then embedded)
    so the printout reads like a wasteland gazetteer.
    """
    root = random.Random(seed)
    rng_names = derive(root, "names")
    rng_stats = derive(root, "stats")
    rng_resources = derive(root, "resources")
    rng_grudges = derive(root, "grudges")

    ordered = [
        Archetype.BOSS,
        Archetype.ROADLORD,
        Archetype.WARHOUND,
        Archetype.PROPHET,
        Archetype.TINKER,
        Archetype.WHISPER,
        Archetype.FIXER,
        Archetype.HOSTKEEPER,
    ]

    # Generate leaders first so embedded outfit names can reference them.
    leaders = {a: names.leader_name(rng_names) for a in ordered}
    # Generate names in archetype order.
    faction_names = {a: _name_for(rng_names, a, leaders[a]) for a in ordered}

    # Holds for embedded factions to live in.
    hold_names = [faction_names[Archetype.BOSS]]  # demo only has one Boss

    factions: list[Faction] = []
    for a in ordered:
        factions.append(
            Faction(
                archetype=a,
                name=faction_names[a],
                leader_name=leaders[a],
                stats=_roll_stats(rng_stats, a),
                resources=_starting_resources(rng_resources, a),
                location=_location_hint(rng_names, a, hold_names),
            )
        )

    # Pair each faction with a grudge against a different faction.
    grudges: list[str] = []
    for f in factions:
        target = rng_grudges.choice([x for x in factions if x is not f])
        verb = rng_grudges.choice(
            ("blames", "owes blood to", "has unfinished business with",
             "swore an oath against", "is hunted by", "covets the territory of")
        )
        grudges.append(f"{f.name} {verb} {target.name}.")

    return [DemoFaction(faction=f, grudge=g) for f, g in zip(factions, grudges)]


def format_roster(roster: list[DemoFaction]) -> str:
    """Pretty-print a roster for the CLI."""
    lines: list[str] = []
    lines.append("=" * 72)
    lines.append("WASTELAND ROSTER")
    lines.append("=" * 72)
    last_class: ArchetypeClass | None = None
    for entry in roster:
        f = entry.faction
        cls = f.archetype_class
        if cls is not last_class:
            lines.append("")
            lines.append(f"--- {cls.value.upper()} ---")
            last_class = cls
        lines.append(
            f"  {f.archetype.value:11s}  {f.name}"
        )
        lines.append(
            f"               led by {f.leader_name}, {f.location}"
        )
        lines.append(
            f"               stats: grit {f.stats.grit:+d} menace {f.stats.menace:+d} "
            f"charm {f.stats.charm:+d} insight {f.stats.insight:+d} weird {f.stats.weird:+d}"
        )
        lines.append(f"               grudge: {entry.grudge}")
    lines.append("")
    lines.append("=" * 72)
    return "\n".join(lines)
