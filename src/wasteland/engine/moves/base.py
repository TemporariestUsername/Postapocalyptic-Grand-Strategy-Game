"""Move ABC + registry.

A Move is a callable that, given a world + a faction + an rng, mutates the
world and returns a list of log entries describing what happened.

Each Move declares:
    - `stat`: the named character stat (0-100) the Move keys off, or None
      for meta-Moves like Catch your breath that don't draw.
    - `acting_role`: which officer role acts on the faction's behalf (or
      None to use the leader). The acting Character's stat value is what
      feeds the Fortune draw.
"""

from __future__ import annotations

import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from ...core.characters import LEADER_ROLES, Character, CharacterRole
from ...core.faction import Archetype, Faction
from ...core.world import World
from ..fortune import Outcome, stat_modifier
from ..log import LogEntry


@dataclass
class MoveResult:
    outcome: Outcome
    entries: list[LogEntry] = field(default_factory=list)


class Move(ABC):
    name: str
    stat: str | None             # named character stat, e.g. "authority"; None = no draw
    action_cost: int = 1
    archetypes: tuple[Archetype, ...] = ()  # which archetypes can use this Move
    acting_role: CharacterRole | None = None  # which officer acts; None = leader

    def acting_character(self, faction: Faction) -> Character | None:
        """Return the Character who acts on this Move. Falls back to leader."""
        if self.acting_role is None or self.acting_role in LEADER_ROLES:
            return faction.leader
        for o in faction.officers:
            if o.role is self.acting_role and o.alive:
                return o
        return faction.leader

    def stat_value(self, faction: Faction) -> int:
        """The raw 0-100 stat the Fortune draw is based on. 50 if no stat declared."""
        if self.stat is None:
            return 50
        char = self.acting_character(faction)
        if char is None:
            return 50
        return char.stats.get(self.stat, 50)

    def draw_modifier(self, faction: Faction) -> int:
        return stat_modifier(self.stat_value(faction))

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
