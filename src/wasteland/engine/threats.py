"""Threat advancement: ticking fronts and firing their consequences.

Every season, each active threat clock advances. When a clock fills, the
threat *fires*: the engine applies a kind-specific consequence to the target
faction and logs it. The clock then resets so the rivalry keeps simmering -
fronts are ongoing pressure, not one-shots. The player answers martial fronts
by raising Walls (which soak the blow) and by Muster the Watch (which stalls
a clock), but a neglected hold bleeds.

This is the design's "fronts advance regardless of the player" pillar made
mechanical. Until a real rival AI lands (Phase 5), these pre-seeded fronts
are how the world pushes back.
"""

from __future__ import annotations

import random

from ..core.faction import ARCHETYPE_CLASS, ArchetypeClass, Faction
from ..core.world import World
from ..procgen.threats import Threat, ThreatKind
from .log import LogEntry, LogKind


# How much a front advances per season. Kept at 1 for legibility: a 4-segment
# raid lands every four seasons, an 8-segment march every eight, so the player
# can read the rhythm and plan against it.
_TICK_PER_SEASON = 1


def _spend(faction: Faction, key: str, amount: int) -> int:
    """Reduce a resource toward zero. Returns how much was actually removed."""
    have = faction.resources.get(key, 0)
    taken = min(have, amount)
    faction.resources[key] = have - taken
    return taken


def _gain(faction: Faction, key: str, amount: int) -> None:
    faction.resources[key] = faction.resources.get(key, 0) + amount


def _fire(world: World, threat: Threat) -> str:
    """Apply a threat's consequence to its target. Returns a player-facing line.

    Martial fronts (raid, march) are partly absorbed by Walls; the rest spills
    into Stock and People. Each kind reads off the target's own resource set so
    a front never tries to take Riders from a Boss or Stock from a Roadlord.
    """
    target = world.factions[threat.target_idx]
    kind = threat.kind

    if kind is ThreatKind.RAID:
        walls = target.resources.get("walls", 0)
        if walls > 0:
            _spend(target, "walls", 1)
            stock_lost = _spend(target, "stock", 1)
            _gain(target, "heat", 1)
            return f"The walls hold, barely. Walls -1, Stock -{stock_lost}, Heat +1."
        stock_lost = _spend(target, "stock", 2)
        barter_lost = _spend(target, "barter", 1)
        _gain(target, "heat", 1)
        return f"Raiders get inside. Stock -{stock_lost}, Barter -{barter_lost}, Heat +1."

    if kind is ThreatKind.MARCH:
        walls = target.resources.get("walls", 0)
        if walls > 0:
            _spend(target, "walls", 2)
            return "The host throws itself at your walls. Walls -2."
        people_lost = _spend(target, "people", 1)
        _gain(target, "heat", 1)
        return f"Your walls are down; the host pours through. People -{people_lost}, Heat +1."

    if kind is ThreatKind.EXTORT:
        barter_lost = _spend(target, "barter", 2)
        return f"You pay the toll, as ever. Barter -{barter_lost}."

    if kind is ThreatKind.HUNT:
        riders_lost = _spend(target, "riders", 1)
        gas_lost = _spend(target, "gas", 1)
        return f"They run your outriders down. Riders -{riders_lost}, Gas -{gas_lost}."

    if kind is ThreatKind.SCHISM:
        lost = _spend(target, "followers", 2)
        return f"The flock splits. Followers -{lost}."

    if kind is ThreatKind.UNDERMINE:
        loc = world.location_for(target)
        if loc is not None:
            loc.authority = max(0, loc.authority - 10)
            loc.discontent = min(100, loc.discontent + 10)
        people_lost = _spend(target, "people", 1)
        return f"Rot spreads through the hold. People -{people_lost}, Authority shaken."

    if kind is ThreatKind.EXPOSE:
        cover_lost = _spend(target, "cover", 2)
        _gain(target, "heat", 1)
        return f"Someone talks. Cover -{cover_lost}, Heat +1."

    # DEBTS (and any fallback)
    barter_lost = _spend(target, "barter", 1)
    juice_lost = _spend(target, "juice", 1)
    return f"Old debts come due. Barter -{barter_lost}, Juice -{juice_lost}."


def advance_threats(world: World, rng: random.Random) -> list[LogEntry]:
    """Tick every active front; fire and reset any that fill this season.

    Returns log entries. Fronts targeting the player are always reported (they
    are existential); fronts between two rivals are reported only when they
    fire and the player can plausibly notice (the target is a public hold).
    """
    entries: list[LogEntry] = []
    if world.threats is None:
        return entries

    player_idx = world.player_idx

    for threat in world.threats.threats:
        filled = threat.clock.advance(_TICK_PER_SEASON)
        if not filled:
            continue
        line = _fire(world, threat)
        targets_player = threat.target_idx == player_idx
        if targets_player:
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.SNAG,
                text=f"{threat.clock.label} comes to a head. {line}",
            ))
        elif ARCHETYPE_CLASS[world.factions[threat.target_idx].archetype] is ArchetypeClass.TERRITORIAL:
            # A rival hold takes a blow - visible from across the wasteland.
            entries.append(LogEntry(
                turn=world.turn, kind=LogKind.SYSTEM,
                text=f"Word arrives: {threat.clock.label}.",
            ))
        # The front resets and begins building again - the rivalry endures.
        threat.clock.reset()

    return entries


def player_threats(world: World) -> list[Threat]:
    """Active fronts aimed at the player, worst (most-filled) first."""
    if world.threats is None or world.player_idx is None:
        return []
    mine = [t for t in world.threats.threats if t.target_idx == world.player_idx]
    mine.sort(key=lambda t: (t.clock.remaining, -t.clock.segments))
    return mine
