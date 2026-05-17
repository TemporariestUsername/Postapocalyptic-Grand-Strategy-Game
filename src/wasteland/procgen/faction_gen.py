"""Faction roster generation.

Two entry points:

- generate_demo_roster(seed): one named faction per archetype with a starting
  grudge. Used by `python -m wasteland --roster` to demo the procgen layer
  without needing the full world. (Same behavior as Phase 1.)

- generate_factions(map, rng, player_archetype): the Phase 2 entry point that
  places Bosses on fertile hexes, Mobiles in the wasteland, and Embedded
  factions inside Boss-hold interiors per docs/PROCGEN.md.
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
from ..core.hex import Hex, distance
from ..core.resources import (
    EMBEDDED_RESOURCES,
    MOBILE_RESOURCES,
    TERRITORIAL_RESOURCES,
    UNIVERSAL_RESOURCES,
)
from ..rng import derive
from . import names
from .map_gen import HexMap, TERRAIN_FERTILE, TERRAIN_RUINS, TERRAIN_WASTES


# Per-archetype stat weighting. Means are skewed; sum stays roughly constant.
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
    if archetype is Archetype.PROPHET:
        return names.cult_name(rng)
    return names.outfit_name(rng, leader_first_name=leader)


# ---------------------------------------------------------------------------
# Phase 1 demo roster - one named faction per archetype with a grudge string.
# Kept for the --roster CLI; it doesn't require a map.
# ---------------------------------------------------------------------------


@dataclass
class DemoFaction:
    faction: Faction
    grudge: str


def generate_demo_roster(seed: int) -> list[DemoFaction]:
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

    leaders = {a: names.leader_name(rng_names) for a in ordered}
    faction_names = {a: _name_for(rng_names, a, leaders[a]) for a in ordered}

    hold_names = [faction_names[Archetype.BOSS]]

    factions: list[Faction] = []
    for a in ordered:
        host_for_demo: list[str] = []
        label = "their own gates"
        if ARCHETYPE_CLASS[a] is ArchetypeClass.MOBILE:
            label = rng_names.choice(("the long road", "the wastes", "the road between holds"))
        elif ARCHETYPE_CLASS[a] is ArchetypeClass.EMBEDDED:
            host = rng_names.choice(hold_names) if hold_names else "somewhere"
            host_for_demo = [host]
            label = f"hosted in {host}"
        factions.append(
            Faction(
                archetype=a,
                name=faction_names[a],
                leader_name=leaders[a],
                stats=_roll_stats(rng_stats, a),
                resources=_starting_resources(rng_resources, a),
                host_holds=host_for_demo,
                location_label=label,
            )
        )

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
        lines.append(f"  {f.archetype.value:11s}  {f.name}")
        lines.append(f"               led by {f.leader_name}, {f.location_label}")
        lines.append(
            f"               stats: grit {f.stats.grit:+d} menace {f.stats.menace:+d} "
            f"charm {f.stats.charm:+d} insight {f.stats.insight:+d} weird {f.stats.weird:+d}"
        )
        lines.append(f"               grudge: {entry.grudge}")
    lines.append("")
    lines.append("=" * 72)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Phase 2 - real world placement.
# ---------------------------------------------------------------------------


# Embedded archetypes that can spawn inside a host hold. Fixer is included but
# treated specially below (multi-hold presence).
_EMBEDDED_POOL = (
    Archetype.PROPHET, Archetype.TINKER, Archetype.WHISPER,
    Archetype.FIXER, Archetype.HOSTKEEPER,
)
_MOBILE_POOL = (Archetype.ROADLORD, Archetype.WARHOUND)


def _build_faction(
    rng_stats: random.Random,
    rng_res: random.Random,
    archetype: Archetype,
    name: str,
    leader: str,
) -> Faction:
    return Faction(
        archetype=archetype,
        name=name,
        leader_name=leader,
        stats=_roll_stats(rng_stats, archetype),
        resources=_starting_resources(rng_res, archetype),
    )


def generate_factions(
    hex_map: HexMap,
    rng: random.Random,
    player_archetype: Archetype,
) -> list[Faction]:
    """Place a full roster of factions on the map. Marks exactly one as is_player.

    Order in the returned list is canonical: Bosses, then Mobiles, then Embedded.
    """
    rng_names = derive(rng, "names")
    rng_stats = derive(rng, "stats")
    rng_res = derive(rng, "resources")
    rng_place = derive(rng, "place")

    factions: list[Faction] = []

    # --- BOSSES ---------------------------------------------------------------
    # One Boss per fertile pocket center, capped at 7. If the player chose Boss,
    # one is flagged as theirs.
    boss_hexes = list(hex_map.fertile_pockets)[: max(4, min(7, len(hex_map.fertile_pockets)))]
    for i, hex_pos in enumerate(boss_hexes):
        leader = names.leader_name(rng_names)
        name = names.hold_name(rng_names)
        boss = _build_faction(rng_stats, rng_res, Archetype.BOSS, name, leader)
        boss.location_hex = hex_pos
        boss.location_label = "their own gates"
        factions.append(boss)
    boss_indices = list(range(len(factions)))
    hold_names = [factions[i].name for i in boss_indices]

    # --- MOBILES --------------------------------------------------------------
    # 1-3 mobiles, placed in wastes/ruins hexes well away from holds.
    n_mobile = rng_place.randint(1, 3)
    placed_mobile = 0
    eligible_mobile_tiles = [
        tile.hex for tile in hex_map.tiles.values()
        if tile.terrain in (TERRAIN_WASTES, TERRAIN_RUINS)
        and all(distance(tile.hex, b) >= 3 for b in boss_hexes)
    ]
    rng_place.shuffle(eligible_mobile_tiles)
    for hex_pos in eligible_mobile_tiles:
        if placed_mobile >= n_mobile:
            break
        archetype = rng_place.choice(_MOBILE_POOL)
        leader = names.leader_name(rng_names)
        name = names.gang_name(rng_names)
        mob = _build_faction(rng_stats, rng_res, archetype, name, leader)
        mob.location_hex = hex_pos
        mob.location_label = "the long road"
        factions.append(mob)
        placed_mobile += 1

    # --- EMBEDDED -------------------------------------------------------------
    # For each hold, 0-3 embedded factions. Each rolled independently.
    for hold_name in hold_names:
        n_embedded = rng_place.choices((0, 1, 2, 3), weights=(15, 35, 35, 15))[0]
        archetypes_in_hold: list[Archetype] = []
        for _ in range(n_embedded):
            # Avoid two of the same embedded archetype in one hold - feels
            # crowded and reduces variety.
            available = [a for a in _EMBEDDED_POOL if a not in archetypes_in_hold]
            if not available:
                break
            archetype = rng_place.choice(available)
            archetypes_in_hold.append(archetype)
            leader = names.leader_name(rng_names)
            name = names.cult_name(rng_names) if archetype is Archetype.PROPHET else \
                names.outfit_name(rng_names, leader_first_name=leader)
            emb = _build_faction(rng_stats, rng_res, archetype, name, leader)
            emb.host_holds = [hold_name]
            emb.location_label = f"hosted in {hold_name}"
            factions.append(emb)

    # --- FIXER MULTI-HOST -----------------------------------------------------
    # Any Fixer rolls 0-2 additional hold branches. Determines breadth of network.
    for f in factions:
        if f.archetype is not Archetype.FIXER:
            continue
        extra = rng_place.randint(0, 2)
        if extra == 0:
            continue
        others = [h for h in hold_names if h not in f.host_holds]
        rng_place.shuffle(others)
        for h in others[:extra]:
            f.host_holds.append(h)
        f.location_label = "hosted in " + ", ".join(f.host_holds)

    # --- PLAYER PLACEMENT -----------------------------------------------------
    # Flag exactly one faction of the player's archetype. If none of that
    # archetype was generated (possible for embeddeds), create one and place it
    # in a random hold (or wasteland hex for mobiles, or a fresh hex for Boss).
    candidates = [i for i, f in enumerate(factions) if f.archetype is player_archetype]
    if candidates:
        # Pick the one with the highest stats sum - feels fair to the player.
        def stat_sum(idx: int) -> int:
            s = factions[idx].stats
            return s.grit + s.menace + s.charm + s.insight + s.weird
        player_idx = max(candidates, key=stat_sum)
        factions[player_idx].is_player = True
    else:
        # Construct a new player faction.
        leader = names.leader_name(rng_names)
        cls = ARCHETYPE_CLASS[player_archetype]
        if cls is ArchetypeClass.TERRITORIAL:
            # Steal an existing Boss slot - guarantees the player has a real hold.
            target = boss_indices[0] if boss_indices else None
            if target is not None:
                factions[target].is_player = True
            else:
                # Fallback (no boss spawned at all) - place on first fertile tile.
                fertile = next(
                    (t.hex for t in hex_map.tiles.values() if t.terrain == TERRAIN_FERTILE),
                    Hex(hex_map.width // 2, hex_map.height // 2),
                )
                name = names.hold_name(rng_names)
                player = _build_faction(rng_stats, rng_res, Archetype.BOSS, name, leader)
                player.location_hex = fertile
                player.location_label = "their own gates"
                player.is_player = True
                factions.append(player)
        elif cls is ArchetypeClass.MOBILE:
            name = names.gang_name(rng_names)
            player = _build_faction(rng_stats, rng_res, player_archetype, name, leader)
            # Drop them onto an eligible wasteland tile.
            tile_choice = (
                eligible_mobile_tiles[-1]
                if eligible_mobile_tiles
                else Hex(hex_map.width // 2, hex_map.height // 2)
            )
            player.location_hex = tile_choice
            player.location_label = "the long road"
            player.is_player = True
            factions.append(player)
        else:  # EMBEDDED
            host = hold_names[0] if hold_names else "the wastes"
            name = (
                names.cult_name(rng_names)
                if player_archetype is Archetype.PROPHET
                else names.outfit_name(rng_names, leader_first_name=leader)
            )
            player = _build_faction(rng_stats, rng_res, player_archetype, name, leader)
            player.host_holds = [host]
            player.location_label = f"hosted in {host}"
            player.is_player = True
            factions.append(player)

    return factions
