"""Top-level world generation: orchestrates map, factions, locations, relationships, threats."""

from __future__ import annotations

import random

from ..core.buildings import BUILDING_KEEPER_ROLE, STARTING_BUILDING, Building
from ..core.faction import ARCHETYPE_CLASS, Archetype, ArchetypeClass, Faction
from ..core.locations import LocationState
from ..core.world import World
from ..engine.fortune import FortuneDeck
from ..engine.log import LogEntry, LogKind
from ..engine.turn import action_budget
from ..rng import derive, make_rng
from .faction_gen import generate_factions
from .map_gen import generate_map
from .relationships import build_relationships
from .threats import seed_threats


def _build_starting_building(faction: Faction, faction_idx: int) -> Building:
    """Construct the faction's signature starting building.

    The keeper officer (the one whose role.value matches BUILDING_KEEPER_ROLE)
    is auto-assigned. If the officer is missing (defensive: shouldn't happen
    given the canonical roster) the building starts unassigned and will decay.
    """
    btype = STARTING_BUILDING[faction.archetype]
    keeper_role = BUILDING_KEEPER_ROLE[(faction.archetype, btype)]
    keeper_name: str | None = next(
        (o.name for o in faction.officers if o.role.value == keeper_role),
        None,
    )
    return Building(
        type=btype,
        owner_faction_idx=faction_idx,
        level=1,
        condition=100,
        assigned_officer=keeper_name,
    )


def _populate_locations(factions: list[Faction]) -> dict[tuple[int, int], LocationState]:
    """Create LocationStates: hex-bound for Bosses, camps for Mobiles, hosted Buildings for Embedded.

    Embedded factions' signature Building is appended to their primary host's
    hosted_buildings list (Fixers with multiple hosts only get a building in
    their first listed host; cross-hold expansion is Phase 4+).
    """
    locations: dict[tuple[int, int], LocationState] = {}

    # Bosses: hex-bound location + signature building.
    for idx, f in enumerate(factions):
        if f.archetype is Archetype.BOSS and f.location_hex is not None:
            building = _build_starting_building(f, idx)
            locations[(f.location_hex.q, f.location_hex.r)] = LocationState(
                owner_faction_idx=idx,
                hex=f.location_hex,
                population=60,
                discontent=0,
                authority=50,
                buildings=[building],
            )

    # Mobile camps: LocationState lives on the faction itself.
    for idx, f in enumerate(factions):
        if f.archetype_class is ArchetypeClass.MOBILE:
            building = _build_starting_building(f, idx)
            f.camp = LocationState(
                owner_faction_idx=idx,
                hex=None,
                population=40,
                discontent=0,
                authority=50,
                buildings=[building],
            )

    # Build a hold-name -> LocationState lookup so embeddeds can slot in.
    hold_lookup: dict[str, LocationState] = {}
    for idx, f in enumerate(factions):
        if f.archetype is Archetype.BOSS and f.location_hex is not None:
            hold_lookup[f.name] = locations[(f.location_hex.q, f.location_hex.r)]

    # Embedded: signature Building goes in the primary host's hosted_buildings.
    for idx, f in enumerate(factions):
        if f.archetype_class is ArchetypeClass.EMBEDDED:
            building = _build_starting_building(f, idx)
            host = f.host_holds[0] if f.host_holds else None
            if host is None or host not in hold_lookup:
                continue
            hold_lookup[host].hosted_buildings.append(building)

    return locations


def generate_world(seed: int, player_archetype: Archetype) -> World:
    """Generate a complete world from a seed. Deterministic.

    Each subsystem gets its own derived RNG so adding new generation steps
    later won't shift downstream draws.
    """
    root = make_rng(seed)

    rng_map = derive(root, "map")
    hex_map = generate_map(rng_map)

    rng_factions = derive(root, "factions")
    factions = generate_factions(hex_map, rng_factions, player_archetype)

    rng_relationships = derive(root, "relationships")
    relationships = build_relationships(factions, rng_relationships)

    rng_threats = derive(root, "threats")
    threats = seed_threats(factions, rng_threats)

    # Each faction gets a Fortune Deck shuffled from its own derived RNG, so
    # the deck order is part of the seed-deterministic world state.
    rng_decks = derive(root, "decks")
    for i, f in enumerate(factions):
        f.fortune = FortuneDeck.fresh(derive(rng_decks, f"deck-{i}-{f.name}"))

    locations = _populate_locations(factions)

    world = World(
        seed=seed,
        hex_map=hex_map,
        factions=factions,
        relationships=relationships,
        threats=threats,
        locations=locations,
    )
    if world.player is not None:
        world.actions_left = action_budget(world.player)
    world.event_log.append(
        LogEntry(turn=world.turn, kind=LogKind.SYSTEM, text=f"--- Season {world.turn} ---")
    )
    return world
