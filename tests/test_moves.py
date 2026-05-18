"""Tax the Hold + end-turn + action-budget mechanics."""

from __future__ import annotations

import random

from wasteland.core.characters import CharacterRole
from wasteland.core.faction import Archetype, Faction
from wasteland.engine.fortune import FortuneDeck, Outcome
from wasteland.engine.moves import TaxTheHold, CatchYourBreath, available_moves
from wasteland.engine.turn import action_budget, end_turn
from wasteland.procgen.world_gen import generate_world


def _force_top_card(deck: FortuneDeck, outcome: Outcome) -> None:
    """Manipulate the deck so the next single-draw returns `outcome`."""
    for i, c in enumerate(deck.draw_pile):
        if c is outcome:
            deck.draw_pile.insert(0, deck.draw_pile.pop(i))
            return
    raise AssertionError(f"no {outcome} in deck")


def _player_world():
    w = generate_world(seed=42, player_archetype=Archetype.BOSS)
    p = w.player
    # Force the acting officer (the Steward, who runs Tax the Hold) and the
    # leader to neutral Authority so the Fortune draw is a flat single-card
    # draw - keeps these tests focused on outcome handling, not roll bias.
    if p is not None and p.leader is not None:
        p.leader.stats["authority"] = 50
        for o in p.officers:
            if o.role is CharacterRole.STEWARD:
                o.stats["authority"] = 50
    return w, p


def test_strong_tax_gives_three_barter_no_heat():
    w, p = _player_world()
    starting_barter = p.resources["barter"]
    starting_heat = p.resources["heat"]
    starting_people = p.resources["people"]
    _force_top_card(p.fortune, Outcome.STRONG)
    result = TaxTheHold.resolve(w, p, random.Random(0))
    assert result.outcome is Outcome.STRONG
    assert p.resources["barter"] == starting_barter + 3
    assert p.resources["heat"] == starting_heat
    assert p.resources["people"] == starting_people


def test_mixed_tax_gives_two_barter_one_heat():
    w, p = _player_world()
    starting_barter = p.resources["barter"]
    starting_heat = p.resources["heat"]
    _force_top_card(p.fortune, Outcome.MIXED)
    result = TaxTheHold.resolve(w, p, random.Random(0))
    assert result.outcome is Outcome.MIXED
    assert p.resources["barter"] == starting_barter + 2
    assert p.resources["heat"] == starting_heat + 1


def test_bitter_tax_loses_people_and_rolls_snag():
    w, p = _player_world()
    starting_people = p.resources["people"]
    starting_heat = p.resources["heat"]
    _force_top_card(p.fortune, Outcome.BITTER)
    result = TaxTheHold.resolve(w, p, random.Random(0))
    assert result.outcome is Outcome.BITTER
    # +1 Barter is the consolation, -1 People, +2 Heat.
    assert p.resources["people"] == starting_people - 1
    assert p.resources["heat"] == starting_heat + 2
    kinds = [e.kind.value for e in result.entries]
    assert "snag" in kinds


def test_tax_the_hold_blocked_when_no_people_left():
    w, p = _player_world()
    p.resources["people"] = 0
    allowed, reason = TaxTheHold.can_attempt(w, p)
    assert not allowed
    assert "People" in reason


def test_tax_grants_authority_xp_on_strong():
    """A Strong Tax should deposit +2 Authority XP to the Steward."""
    w, p = _player_world()
    steward = next(o for o in p.officers if o.role is CharacterRole.STEWARD)
    steward.pending_xp.clear()
    _force_top_card(p.fortune, Outcome.STRONG)
    TaxTheHold.resolve(w, p, random.Random(0))
    assert steward.pending_xp.get("authority", 0) == 2


def test_bitter_tax_immediately_lowers_steward_authority():
    """Bitter outcomes wound the responsible officer's stat directly."""
    w, p = _player_world()
    steward = next(o for o in p.officers if o.role is CharacterRole.STEWARD)
    steward.stats["authority"] = 50
    _force_top_card(p.fortune, Outcome.BITTER)
    TaxTheHold.resolve(w, p, random.Random(0))
    assert steward.stats["authority"] == 47


def test_catch_your_breath_requires_two_juice():
    w, p = _player_world()
    p.resources["juice"] = 1
    p.fortune.draw(random.Random(0), 0)  # consume one card so the deck isn't full
    allowed, reason = CatchYourBreath.can_attempt(w, p)
    assert not allowed
    assert "Juice" in reason


def test_catch_your_breath_reshuffles_deck_and_consumes_juice():
    w, p = _player_world()
    p.resources["juice"] = 5
    for _ in range(3):
        p.fortune.draw(random.Random(0), 0)
    assert p.fortune.remaining == 9
    result = CatchYourBreath.resolve(w, p, random.Random(0))
    assert p.resources["juice"] == 3
    assert p.fortune.remaining == 12
    assert p.fortune.discard == []


def test_action_budget_matches_archetype():
    assert action_budget_for(Archetype.BOSS) == 3
    assert action_budget_for(Archetype.ROADLORD) == 2
    assert action_budget_for(Archetype.FIXER) == 2


def action_budget_for(archetype: Archetype) -> int:
    # action_budget only reads archetype - no leader/officers/stats needed.
    f = Faction(archetype=archetype, name="x")
    return action_budget(f)


def test_end_turn_refills_actions_and_advances_counter():
    w, p = _player_world()
    starting_turn = w.turn
    w.actions_left = 0
    entries = end_turn(w, random.Random(0))
    assert w.turn == starting_turn + 1
    assert w.actions_left == action_budget(p)
    assert any(e.text.startswith("--- Season") for e in entries)


def test_available_moves_for_boss_includes_tax_and_catch():
    w, p = _player_world()
    moves = available_moves(p)
    names = {m.name for m in moves}
    assert "Tax the Hold" in names
    assert "Catch your breath" in names


def test_available_moves_for_non_boss_excludes_tax():
    w = generate_world(seed=42, player_archetype=Archetype.ROADLORD)
    p = w.player
    names = {m.name for m in available_moves(p)}
    assert "Tax the Hold" not in names
    # Catch your breath is universal, so it should be present.
    assert "Catch your breath" in names
