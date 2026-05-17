"""Top-level world generation: orchestrates map, factions, relationships, threats."""

from __future__ import annotations

import random

from ..core.faction import Archetype
from ..core.world import World
from ..engine.fortune import FortuneDeck
from ..engine.log import LogEntry, LogKind
from ..engine.turn import action_budget
from ..rng import derive, make_rng
from .faction_gen import generate_factions
from .map_gen import generate_map
from .relationships import build_relationships
from .threats import seed_threats


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

    world = World(
        seed=seed,
        hex_map=hex_map,
        factions=factions,
        relationships=relationships,
        threats=threats,
    )
    if world.player is not None:
        world.actions_left = action_budget(world.player)
    world.event_log.append(
        LogEntry(turn=world.turn, kind=LogKind.SYSTEM, text=f"--- Season {world.turn} ---")
    )
    return world
