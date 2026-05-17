"""Determinism + structural invariants for full world generation."""

from __future__ import annotations

from wasteland.core.faction import ARCHETYPE_CLASS, Archetype, ArchetypeClass
from wasteland.procgen.map_gen import (
    TERRAIN_FERTILE,
    TERRAIN_IRRADIATED,
)
from wasteland.procgen.world_gen import generate_world


def _signature(world) -> tuple:
    """Reduce the world to a tuple of hashable values for byte-for-byte comparison."""
    map_sig = tuple(
        (q, r, t.terrain, t.scarcity, t.maelstrom_bias)
        for (q, r), t in sorted(world.hex_map.tiles.items())
    )
    factions_sig = tuple(
        (
            f.archetype.value,
            f.name,
            f.leader_name,
            (f.location_hex.q, f.location_hex.r) if f.location_hex else None,
            tuple(f.host_holds),
            f.is_player,
            (f.stats.grit, f.stats.menace, f.stats.charm, f.stats.insight, f.stats.weird),
            tuple(sorted(f.resources.items())),
        )
        for f in world.factions
    )
    rel_sig = tuple(sorted(world.relationships.sentiments.items()))
    threat_sig = tuple(
        (t.source_idx, t.target_idx, t.clock.label, t.clock.segments, t.clock.filled)
        for t in world.threats.threats
    )
    return (map_sig, factions_sig, rel_sig, threat_sig)


def test_generate_world_is_deterministic_for_same_seed():
    a = generate_world(seed=12345, player_archetype=Archetype.BOSS)
    b = generate_world(seed=12345, player_archetype=Archetype.BOSS)
    assert _signature(a) == _signature(b)


def test_generate_world_differs_across_seeds():
    a = generate_world(seed=1, player_archetype=Archetype.BOSS)
    b = generate_world(seed=2, player_archetype=Archetype.BOSS)
    assert _signature(a) != _signature(b)


def test_generate_world_player_archetype_changes_player_faction():
    boss_world = generate_world(seed=7, player_archetype=Archetype.BOSS)
    prophet_world = generate_world(seed=7, player_archetype=Archetype.PROPHET)
    assert boss_world.player is not None
    assert prophet_world.player is not None
    assert boss_world.player.archetype is Archetype.BOSS
    assert prophet_world.player.archetype is Archetype.PROPHET


def test_world_has_at_least_one_boss():
    world = generate_world(seed=42, player_archetype=Archetype.ROADLORD)
    bosses = [f for f in world.factions if f.archetype is Archetype.BOSS]
    assert len(bosses) >= 4  # the minimum the generator promises


def test_every_boss_sits_on_a_fertile_hex():
    world = generate_world(seed=42, player_archetype=Archetype.BOSS)
    for f in world.factions:
        if f.archetype is Archetype.BOSS:
            assert f.location_hex is not None
            tile = world.hex_map.get(f.location_hex)
            assert tile is not None
            assert tile.terrain == TERRAIN_FERTILE, (
                f"Boss {f.name} placed on non-fertile {tile.terrain}"
            )


def test_every_embedded_has_a_host():
    world = generate_world(seed=42, player_archetype=Archetype.BOSS)
    hold_names = {f.name for f in world.factions if f.archetype is Archetype.BOSS}
    for f in world.factions:
        if ARCHETYPE_CLASS[f.archetype] is ArchetypeClass.EMBEDDED:
            assert f.host_holds, f"{f.name} has no host holds"
            for host in f.host_holds:
                assert host in hold_names, f"{f.name} hosted in unknown {host!r}"


def test_mobiles_are_off_grid_from_holds():
    world = generate_world(seed=42, player_archetype=Archetype.WARHOUND)
    boss_hexes = {
        (f.location_hex.q, f.location_hex.r)
        for f in world.factions
        if f.archetype is Archetype.BOSS and f.location_hex is not None
    }
    for f in world.factions:
        if ARCHETYPE_CLASS[f.archetype] is ArchetypeClass.MOBILE:
            assert f.location_hex is not None
            assert (f.location_hex.q, f.location_hex.r) not in boss_hexes


def test_irradiated_hexes_have_maelstrom_bias():
    world = generate_world(seed=42, player_archetype=Archetype.BOSS)
    for tile in world.hex_map.tiles.values():
        if tile.terrain == TERRAIN_IRRADIATED:
            assert tile.maelstrom_bias >= 1


def test_exactly_one_player_faction():
    world = generate_world(seed=42, player_archetype=Archetype.FIXER)
    players = [f for f in world.factions if f.is_player]
    assert len(players) == 1
    assert players[0].archetype is Archetype.FIXER


def test_threats_reference_real_faction_indices():
    world = generate_world(seed=42, player_archetype=Archetype.BOSS)
    n = len(world.factions)
    for t in world.threats.threats:
        assert 0 <= t.source_idx < n
        assert 0 <= t.target_idx < n
        assert t.source_idx != t.target_idx
