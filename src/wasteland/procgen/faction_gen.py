"""Faction roster generation.

Two entry points:

- generate_demo_roster(seed): one named faction per archetype with a starting
  grudge. Used by `python -m wasteland --roster` to demo the procgen layer
  without needing the full world.

- generate_factions(map, rng, player_archetype): the world-building entry
  point that places Bosses on fertile hexes, Mobiles in the wasteland, and
  Embedded factions inside Boss-hold interiors per docs/PROCGEN.md.

Each faction is built with its Leader + 3 Officers (see core/characters.py).
Building/LocationState construction happens in procgen/world_gen.py once the
full faction list is known (cross-faction linking for Embedded hosting).
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from ..core.characters import (
    LEADER_ROLE,
    ROSTER,
    Character,
    CharacterRole,
    roll_character,
)
from ..core.faction import (
    ARCHETYPE_CLASS,
    Archetype,
    ArchetypeClass,
    Faction,
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


def _build_roster(
    rng_chars: random.Random,
    rng_names: random.Random,
    archetype: Archetype,
) -> tuple[Character, list[Character]]:
    """Roll the Leader + 3 Officers for a faction of this archetype."""
    leader = roll_character(
        rng_chars,
        archetype,
        LEADER_ROLE[archetype],
        names.leader_name(rng_names),
    )
    officers: list[Character] = []
    for role, _primary in ROSTER[archetype]:
        officers.append(
            roll_character(rng_chars, archetype, role, names.officer_name(rng_names))
        )
    return leader, officers


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
# Demo roster - one named faction per archetype with a grudge string.
# Used by the --roster CLI; it doesn't require a map.
# ---------------------------------------------------------------------------


@dataclass
class DemoFaction:
    faction: Faction
    grudge: str


def generate_demo_roster(seed: int) -> list[DemoFaction]:
    root = random.Random(seed)
    rng_names = derive(root, "names")
    rng_chars = derive(root, "chars")
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

    # Build all rosters first so we can use leader names in faction-name patterns.
    rosters: dict[Archetype, tuple[Character, list[Character]]] = {}
    for a in ordered:
        rosters[a] = _build_roster(rng_chars, rng_names, a)

    faction_names = {a: _name_for(rng_names, a, rosters[a][0].name) for a in ordered}

    hold_names = [faction_names[Archetype.BOSS]]

    factions: list[Faction] = []
    for a in ordered:
        leader, officers = rosters[a]
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
                leader=leader,
                officers=officers,
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


def _format_stats(c: Character) -> str:
    """Compact stat line, e.g. 'authority 78  industry 52  ...'."""
    return "  ".join(f"{stat} {val}" for stat, val in c.stats.items())


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
        if f.leader is not None:
            lines.append(f"               led by {f.leader.name}, {f.location_label}")
            lines.append(f"               {_format_stats(f.leader)}")
        else:
            lines.append(f"               (no leader), {f.location_label}")
        for o in f.officers:
            lines.append(f"               · {o.role.value:13s} {o.name}")
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
    rng_chars: random.Random,
    rng_names: random.Random,
    rng_res: random.Random,
    archetype: Archetype,
    name: str,
) -> Faction:
    leader, officers = _build_roster(rng_chars, rng_names, archetype)
    return Faction(
        archetype=archetype,
        name=name,
        leader=leader,
        officers=officers,
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
    rng_chars = derive(rng, "chars")
    rng_res = derive(rng, "resources")
    rng_place = derive(rng, "place")

    factions: list[Faction] = []

    # --- BOSSES ---------------------------------------------------------------
    boss_hexes = list(hex_map.fertile_pockets)[: max(4, min(7, len(hex_map.fertile_pockets)))]
    for hex_pos in boss_hexes:
        name = names.hold_name(rng_names)
        boss = _build_faction(rng_chars, rng_names, rng_res, Archetype.BOSS, name)
        boss.location_hex = hex_pos
        boss.location_label = "their own gates"
        factions.append(boss)
    boss_indices = list(range(len(factions)))
    hold_names = [factions[i].name for i in boss_indices]

    # --- MOBILES --------------------------------------------------------------
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
        name = names.gang_name(rng_names)
        mob = _build_faction(rng_chars, rng_names, rng_res, archetype, name)
        mob.location_hex = hex_pos
        mob.location_label = "the long road"
        factions.append(mob)
        placed_mobile += 1

    # --- EMBEDDED -------------------------------------------------------------
    for hold_name in hold_names:
        n_embedded = rng_place.choices((0, 1, 2, 3), weights=(15, 35, 35, 15))[0]
        archetypes_in_hold: list[Archetype] = []
        for _ in range(n_embedded):
            available = [a for a in _EMBEDDED_POOL if a not in archetypes_in_hold]
            if not available:
                break
            archetype = rng_place.choice(available)
            archetypes_in_hold.append(archetype)
            # Build a temporary faction so we have a leader name for outfit-name patterns.
            leader, officers = _build_roster(rng_chars, rng_names, archetype)
            name = (
                names.cult_name(rng_names)
                if archetype is Archetype.PROPHET
                else names.outfit_name(rng_names, leader_first_name=leader.name)
            )
            emb = Faction(
                archetype=archetype,
                name=name,
                leader=leader,
                officers=officers,
                resources=_starting_resources(rng_res, archetype),
                host_holds=[hold_name],
                location_label=f"hosted in {hold_name}",
            )
            factions.append(emb)

    # --- FIXER MULTI-HOST -----------------------------------------------------
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
    candidates = [i for i, f in enumerate(factions) if f.archetype is player_archetype]
    if candidates:
        # Pick the one with the highest leader-stats sum - feels fair to the player.
        def stat_sum(idx: int) -> int:
            leader = factions[idx].leader
            return sum(leader.stats.values()) if leader is not None else 0
        player_idx = max(candidates, key=stat_sum)
        factions[player_idx].is_player = True
    else:
        cls = ARCHETYPE_CLASS[player_archetype]
        if cls is ArchetypeClass.TERRITORIAL:
            target = boss_indices[0] if boss_indices else None
            if target is not None:
                factions[target].is_player = True
            else:
                fertile = next(
                    (t.hex for t in hex_map.tiles.values() if t.terrain == TERRAIN_FERTILE),
                    Hex(hex_map.width // 2, hex_map.height // 2),
                )
                name = names.hold_name(rng_names)
                player = _build_faction(rng_chars, rng_names, rng_res, Archetype.BOSS, name)
                player.location_hex = fertile
                player.location_label = "their own gates"
                player.is_player = True
                factions.append(player)
        elif cls is ArchetypeClass.MOBILE:
            name = names.gang_name(rng_names)
            player = _build_faction(rng_chars, rng_names, rng_res, player_archetype, name)
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
            leader_tmp, officers_tmp = _build_roster(rng_chars, rng_names, player_archetype)
            name = (
                names.cult_name(rng_names)
                if player_archetype is Archetype.PROPHET
                else names.outfit_name(rng_names, leader_first_name=leader_tmp.name)
            )
            player = Faction(
                archetype=player_archetype,
                name=name,
                leader=leader_tmp,
                officers=officers_tmp,
                resources=_starting_resources(rng_res, player_archetype),
                host_holds=[host],
                location_label=f"hosted in {host}",
                is_player=True,
            )
            factions.append(player)

    return factions
