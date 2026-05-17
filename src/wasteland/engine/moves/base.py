"""Move ABC + registry.

A Move is a callable that, given a world + a faction + an rng, mutates the
world and returns a list of log entries describing what happened.
"""

from __future__ import annotations

import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from ...core.faction import Archetype, Faction
from ...core.world import World
from ..fortune import Outcome
from ..log import LogEntry


@dataclass
class MoveResult:
    outcome: Outcome
    entries: list[LogEntry] = field(default_factory=list)


class Move(ABC):
    name: str
    stat: str  # one of "grit", "menace", "charm", "insight", "weird"
    action_cost: int = 1
    archetypes: tuple[Archetype, ...] = ()  # which archetypes can use this Move

    @abstractmethod
    def can_attempt(self, world: World, faction: Faction) -> tuple[bool, str]:
        """Return (allowed, reason). reason is the user-facing veto when disallowed."""
        ...

    @abstractmethod
    def resolve(self, world: World, faction: Faction, rng: random.Random) -> MoveResult: ...


# Module-level registry. Moves register themselves on import.
_REGISTRY: list[Move] = []


def register(move: Move) -> Move:
    _REGISTRY.append(move)
    return move


def get_move(name: str) -> Move | None:
    for m in _REGISTRY:
        if m.name == name:
            return m
    return None


def available_moves(faction: Faction) -> list[Move]:
    """Return all Moves the faction's archetype can perform.

    This is *all* such Moves, not "Moves the faction can currently afford."
    The UI separately checks `can_attempt` to grey out unavailable ones.
    """
    return [m for m in _REGISTRY if not m.archetypes or faction.archetype in m.archetypes]
