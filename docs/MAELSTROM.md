# The Maelstrom

The Maelstrom is the psychic / supernatural undercurrent of the wasteland. In-fiction, it's whatever you want it to be — the bleed-through of a parallel world, the collective unconscious of the dead, the dream the bombs left behind. Mechanically, it is **a fourth player**.

This document is the canonical specification of how it acts.

---

## 1. The Meter

A single global integer in `[0, 100]`. Starts in `[10, 25]` (rolled by `seed_maelstrom`).

The meter **rises** with:

| Cause | Amount |
|---|---|
| A named character dies | +2 |
| A hold is sacked | +5 |
| A faction performs `Open to the Maelstrom` | +1 per use |
| A faction performs `Walk in Dreams` | +1 per use |
| Each turn, per irradiated hex with a faction on it | +1 |
| Bitter Snag rolls "Maelstrom rises" | +1 |

The meter **falls** with:

| Cause | Amount |
|---|---|
| Prophet performs `Anoint a Successor` | -1 |
| Tinker performs `Wire the Hold` | -1 |
| A faction goes a full turn with no actions (lying low) | -1 |

The drain channels are deliberately stingy. The Maelstrom should always feel like it's *winning*.

---

## 2. Thresholds

When the meter crosses a threshold for the first time, the threshold's event fires. Crossing it again on the way down does not retrigger; crossing it back up *does* (the world is sensitized).

### 25 — Omens

The Maelstrom is *audible*. The world remains otherwise normal.

The engine picks one of the following at random, weighted by what factions exist:

- **Dreams.** Each named Embedded character with `Conviction ≥ 40` writes one line of procedural dream-text into their faction's log. Mostly flavor; one Prophet/Whisper somewhere gets a free reveal of one fact about a random rival.
- **Dead Birds.** All factions take Heat +1 (the wasteland is paying attention).
- **Static.** All `Cunning`-keyed Moves this turn resolve at -1 stat (the Maelstrom clouds judgment).

### 50 — Surges

The Maelstrom can touch the world.

The engine picks a random named character anywhere on the map and **opens** them. Embedded characters gain +5 Conviction permanently; Territorial/Mobile characters gain +5 Cunning but lose -5 Standing (they read as *off* to anyone watching). The character's behavior shifts — their AI faction's Move priors update toward Maelstrom-aligned Moves (Open to the Maelstrom, Walk in Dreams).

Preference is given to characters who already trend high in Maelstrom-adjacent stats (Conviction for Embedded, Cunning for others).

### 75 — Possessions

The Maelstrom acts directly.

The engine picks a random named character with `Conviction ≥ 70` (Embedded) or who has been previously *opened* by a Surge (any class). On a procedural roll:

- 25%: the character is **fully possessed**. Their faction's AI is replaced for `1d4 + 1` turns with a **Maelstrom-aligned hostile AI** that picks the worst Move for their own faction each turn.
- 50%: the character is **whisper-touched**. They behave normally but pull `1d2` Bitter cards into their Fortune Deck.
- 25%: the Maelstrom asks them a question (procedural text), revealed in the faction's log as flavor.

If the possessed character is the player's leader, the player **does not lose control** — instead, their actions for the affected turns require a `Catch your breath` Move to clear, costing 2 Juice per turn cleared. This avoids player-helplessness but makes the cost real.

### 100 — The Lid Comes Off

**Game over for everyone.** The Maelstrom rises through the wasteland. Every hold cracks. Every road dissolves into static. Every cult that was praying *gets answered*.

Legacy score is calculated for all factions and the run ends.

This is the only universal defeat condition in the game. It exists to give Prophet/Whisper-heavy playstyles a real downside — *they could in principle win* but every Move they use to win is a Move that brings the cliff closer.

---

## 3. Using the Maelstrom — *who eats from this table*

The Maelstrom is not pure threat. It is *power available for a price*:

| Archetype | Uses |
|---|---|
| **Prophet** | `Open to the Maelstrom` (gain Secrets, raise meter); core to the archetype. |
| **Whisper** | `Walk in Dreams`, `Plant a Suggestion`, `Brainwipe`; their psychic abilities literally run on Maelstrom. |
| **Tinker** | `Build Something Weird` rolls on a Maelstrom-flavored artifact table; high Network and Conviction help. |
| **Boss** | Touches the Maelstrom only by accident (a character of the hold who has been *opened* by a Surge). Most Bosses fear it. |
| **Mobile** | Almost never. The Maelstrom is for people who sit still and listen. |

The asymmetry is the point. Prophets and Whispers play a *fundamentally different macro game* — they're racing the meter both ways.

---

## 4. Implementation Notes (for Phase 2)

The Maelstrom subsystem will be one module: `engine/maelstrom.py`, with:

```python
@dataclass
class MaelstromState:
    level: int                  # 0..100
    thresholds_crossed: set[int]  # which of {25, 50, 75, 100} have fired
    biased_hexes: list[tuple[int, int, int]]  # (q, r, bias_per_turn)

def step(world: World, rng: random.Random) -> list[MaelstromEvent]:
    """Called in step 2 of the turn order. Returns events for the log."""
    ...
```

Threshold events are dispatched through a small registry keyed by integer threshold. Events themselves are dataclasses so the UI can render them uniformly.
