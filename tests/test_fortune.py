"""Fortune deck mechanics."""

from __future__ import annotations

import random
from collections import Counter

from wasteland.engine.fortune import DECK_SIZE, FortuneDeck, Outcome


def test_fresh_deck_has_canonical_composition():
    deck = FortuneDeck.fresh(random.Random(0))
    assert deck.remaining == DECK_SIZE == 12
    counts = Counter(deck.draw_pile)
    assert counts[Outcome.STRONG] == 3
    assert counts[Outcome.MIXED] == 6
    assert counts[Outcome.BITTER] == 3


def test_drawn_cards_go_to_discard_and_deck_shrinks():
    deck = FortuneDeck.fresh(random.Random(0))
    drawn = []
    for _ in range(12):
        drawn.append(deck.draw(random.Random(0), 0))
    assert deck.remaining == 0
    assert len(deck.discard) == 12
    # Total composition across drawn matches the deck.
    counts = Counter(drawn)
    assert counts[Outcome.STRONG] == 3
    assert counts[Outcome.MIXED] == 6
    assert counts[Outcome.BITTER] == 3


def test_reshuffle_restores_full_deck():
    deck = FortuneDeck.fresh(random.Random(0))
    for _ in range(5):
        deck.draw(random.Random(0), 0)
    assert deck.remaining == 7
    deck.reshuffle(random.Random(1))
    assert deck.remaining == 12
    assert deck.discard == []


def test_positive_stat_draws_better_outcomes_on_average():
    """Stat +1 should produce more Strongs than stat 0 across many trials.

    We test the *draw* logic in isolation by repeatedly drawing from a fresh
    deck. Statistics are forgiving: large gap, fixed seed.
    """
    def run(stat: int) -> Counter[Outcome]:
        counts: Counter[Outcome] = Counter()
        rng = random.Random(0xC4F3)
        for trial in range(500):
            deck = FortuneDeck.fresh(rng)
            counts[deck.draw(rng, stat)] += 1
        return counts

    zero = run(0)
    plus = run(+2)
    minus = run(-2)
    # Sanity: total draws match.
    assert sum(zero.values()) == 500
    # Positive stat draws Strong more than half again as often as zero stat.
    assert plus[Outcome.STRONG] > zero[Outcome.STRONG] * 1.5
    # Negative stat draws Bitter substantially more than zero stat.
    assert minus[Outcome.BITTER] > zero[Outcome.BITTER] * 1.5
    # Symmetry: positive stat draws fewer Bitters than zero.
    assert plus[Outcome.BITTER] < zero[Outcome.BITTER]
    # And negative stat draws fewer Strongs.
    assert minus[Outcome.STRONG] < zero[Outcome.STRONG]


def test_empty_deck_emergency_draw_does_not_crash():
    deck = FortuneDeck(draw_pile=[], discard=[])
    # No reshuffle here - we want the soft-cliff emergency draw path.
    out = deck.draw(random.Random(0), 0)
    assert out in (Outcome.STRONG, Outcome.MIXED, Outcome.BITTER)
