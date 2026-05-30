"""Endgame: defeat checks and the Legacy score.

The game is open-ended - there is no victory screen, only how long you lasted
and what you left behind. `legacy_score` reduces a run to a single number;
`check_endgame` decides when the run is over.

Defeat is archetype-specific (a Boss falls differently than a Roadlord) plus
one universal condition: the Maelstrom taking everything. Phase 4 wires the
Boss path richly; Mobile/Embedded get lighter checks until their full Move
sets land.
"""

from __future__ import annotations

from ..core.faction import ARCHETYPE_CLASS, Archetype, ArchetypeClass, Faction
from ..core.world import GameOutcome, GameOutcomeKind, World


MAELSTROM_CAP = 100
REVOLT_DISCONTENT = 100  # a hold at max discontent throws open its gates


def legacy_score(world: World) -> int:
    """A single number a run is remembered by. Higher is a longer, larger legacy.

    Seasons survived are the spine; holdings, people, and wealth pile on top.
    Computed for the player faction; defeat still scores (you lasted N seasons).
    """
    player = world.player
    score = world.turn * 5
    if player is None:
        return score

    r = player.resources
    score += r.get("barter", 0) + r.get("juice", 0)

    cls = ARCHETYPE_CLASS[player.archetype]
    if cls is ArchetypeClass.TERRITORIAL:
        score += r.get("people", 0) * 10
        score += r.get("stock", 0) * 2
        score += r.get("walls", 0) * 3
        loc = world.location_for(player)
        if loc is not None:
            score += loc.population
            score += max(0, 50 - loc.discontent)
    elif cls is ArchetypeClass.MOBILE:
        score += r.get("riders", 0) * 8
        score += r.get("gas", 0) * 2
    else:  # EMBEDDED
        score += r.get("followers", 0) * 6
        score += r.get("secrets", 0) * 4
        score += r.get("cover", 0) * 2
        score += len(player.host_holds) * 15  # a Fixer's breadth counts

    # Officers who survived and grew are part of the legacy.
    if player.leader is not None:
        score += max(player.leader.stats.values(), default=0) // 5
    return score


def _player_defeat_reason(world: World, player: Faction) -> str | None:
    """Archetype-specific defeat. Returns a player-facing reason, or None."""
    cls = ARCHETYPE_CLASS[player.archetype]
    r = player.resources

    if cls is ArchetypeClass.TERRITORIAL:
        if r.get("people", 0) <= 0:
            return "Your hold empties. The last of them slip out the gate by night."
        loc = world.location_for(player)
        if loc is not None and loc.discontent >= REVOLT_DISCONTENT:
            return "Your hold revolts. They take the walls you built and turn you out."
        return None

    if cls is ArchetypeClass.MOBILE:
        if r.get("riders", 0) <= 0:
            return "Your gang scatters to the wind. A warlord with no riders is just a traveller."
        return None

    # EMBEDDED
    if r.get("cover", 0) <= 0 and r.get("heat", 0) >= 6:
        return "Your cover is blown and the host comes for you. There is nowhere left to hide."
    if not player.host_holds:
        return "You have no host left. The wasteland has no room for a parasite without a body."
    return None


def check_endgame(world: World) -> GameOutcome | None:
    """Evaluate end conditions. Returns a GameOutcome if the run is over, else None."""
    if world.is_over:
        return world.outcome

    if world.maelstrom >= MAELSTROM_CAP:
        return GameOutcome(
            kind=GameOutcomeKind.DEFEAT,
            reason="The Maelstrom rises through everything. The lid comes off the world.",
            legacy=legacy_score(world),
            turn=world.turn,
        )

    player = world.player
    if player is not None:
        reason = _player_defeat_reason(world, player)
        if reason is not None:
            return GameOutcome(
                kind=GameOutcomeKind.DEFEAT,
                reason=reason,
                legacy=legacy_score(world),
                turn=world.turn,
            )

    return None
