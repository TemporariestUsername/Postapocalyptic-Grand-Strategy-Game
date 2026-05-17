"""Fortune Cards: the resolution mechanic.

Each faction has its own 12-card deck of {3 Strong, 6 Mixed, 3 Bitter}. Cards
are drawn (not auto-shuffled - the deck shrinks until refreshed). A faction's
relevant stat modifies the draw:

    stat >= +1: draw two, keep the better
    stat <= -1: draw two, keep the worse
    stat ==  0: draw one

Bad luck is finite: if you've burned through two Bitters, only one remains in
the deck. Counting cards is a legitimate strategic skill.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum


class Outcome(str, Enum):
    STRONG = "strong"
    MIXED = "mixed"
    BITTER = "bitter"


# Rank for "better/worse of two" comparisons.
_RANK = {Outcome.BITTER: 0, Outcome.MIXED: 1, Outcome.STRONG: 2}

# Canonical deck composition. Keep stable - tests assert against it.
DEFAULT_DECK = (
    (Outcome.STRONG, 3),
    (Outcome.MIXED, 6),
    (Outcome.BITTER, 3),
)
DECK_SIZE = sum(n for _, n in DEFAULT_DECK)


def _build_deck(rng: random.Random) -> list[Outcome]:
    cards: list[Outcome] = []
    for outcome, count in DEFAULT_DECK:
        cards.extend([outcome] * count)
    rng.shuffle(cards)
    return cards


@dataclass
class FortuneDeck:
    draw_pile: list[Outcome] = field(default_factory=list)
    discard: list[Outcome] = field(default_factory=list)

    @classmethod
    def fresh(cls, rng: random.Random) -> "FortuneDeck":
        return cls(draw_pile=_build_deck(rng), discard=[])

    @property
    def remaining(self) -> int:
        return len(self.draw_pile)

    def composition(self) -> dict[Outcome, int]:
        """How many of each outcome remain in the draw pile. Used by the UI / AI."""
        out = {o: 0 for o in Outcome}
        for c in self.draw_pile:
            out[c] += 1
        return out

    def _draw_one(self, rng: random.Random) -> Outcome:
        """Pop a card from the top of the draw pile.

        If the deck is empty, an emergency card is generated (weighted toward
        Mixed) so the game doesn't hang. This is a soft cliff - it should
        rarely trigger because the player has Catch your breath available.
        """
        if not self.draw_pile:
            # Emergency draw. 1/6 Strong, 4/6 Mixed, 1/6 Bitter. Reflects an
            # exhausted faction stumbling through.
            roll = rng.randint(1, 6)
            if roll == 1:
                return Outcome.STRONG
            if roll == 6:
                return Outcome.BITTER
            return Outcome.MIXED
        return self.draw_pile.pop(0)

    def draw(self, rng: random.Random, stat: int) -> Outcome:
        """Draw an outcome modified by `stat`. Drawn cards go to the discard pile."""
        if stat >= 1:
            a, b = self._draw_one(rng), self._draw_one(rng)
            kept = a if _RANK[a] >= _RANK[b] else b
            other = b if kept is a else a
        elif stat <= -1:
            a, b = self._draw_one(rng), self._draw_one(rng)
            kept = a if _RANK[a] <= _RANK[b] else b
            other = b if kept is a else a
        else:
            kept = self._draw_one(rng)
            other = None
        self.discard.append(kept)
        if other is not None:
            self.discard.append(other)
        return kept

    def reshuffle(self, rng: random.Random) -> None:
        """Catch your breath: shuffle the discard back into the draw pile."""
        self.draw_pile.extend(self.discard)
        self.discard.clear()
        rng.shuffle(self.draw_pile)
