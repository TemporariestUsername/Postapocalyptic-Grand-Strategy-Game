# Roadmap

Phased build-out. Each phase has a concrete deliverable, a verification step, and an explicit "what's in / out" boundary.

---

## Phase 1 — Design + Scaffold *(current)*

**Goal:** Get the design written down and prove the engine seams work.

Deliverables:
- All design docs in `docs/` (DESIGN, FACTIONS, MECHANICS, PROCGEN, MAELSTROM, ROADMAP).
- Pygame app that opens a window, shows a title screen, opens an archetype-select screen listing all 8 archetypes.
- Deterministic procedural name generator with tests.
- CLI: `python -m wasteland [--seed N] [--roster]`.
- Clock primitive with tests.

Verification:
- `pytest` passes.
- `python -m wasteland` opens a Pygame window.
- `python -m wasteland --roster --seed 42` prints a deterministic 8-faction roster.
- `docs/DESIGN.md` reads coherently for a reader unfamiliar with *Apocalypse World*.

What's explicitly **not** here: actual gameplay, hex map rendering, AI, the Fortune Card resolver as code, the Maelstrom subsystem as code.

---

## Phase 2 — World Generation

**Goal:** Generate a real world from a seed and display it.

Deliverables:
- Full `procgen/map_gen.py` (cellular automaton + biomes + roads + scarcity).
- Full `procgen/faction_gen.py` placing Bosses, Mobiles, and Embedded factions per the rules in `PROCGEN.md`.
- `procgen/relationships.py` for the grudge graph.
- `procgen/threats.py` for starting threat clocks.
- A new scene: **world view**. Hex map rendered. Hardholds, mobile factions, and embedded-faction indicators visible (with appropriate fog-of-war for the player's archetype).
- Player can pick an archetype at game start and the world generates with them placed correctly.

Verification:
- A new test `tests/test_world_gen.py` snapshots a full world for a known seed.
- Loading the same seed twice produces the same hex map, factions, and relationship graph.
- Visual: the hex map renders, hardholds are at fertile-pocket centers, roads connect them.

---

## Phase 3 — Resolution + One Loop of One Move

**Goal:** Implement Fortune Cards and one playable Move end-to-end, for one archetype.

Deliverables:
- `engine/fortune.py` — the Fortune Deck per faction, draw mechanics, Snag table.
- `engine/moves/` — Move dispatcher.
- The Boss's `Tax the Hold` Move implemented: declares stat, resolves a card, applies effects, logs result.
- A turn step that lets the player click "Tax the Hold" and see the consequence.

Verification:
- Drawing 12 cards from a fresh deck always yields exactly 3 Strong / 6 Mixed / 3 Bitter.
- Stat-modified draws produce the right "better/worse of two" behavior (statistically tested over many seeded trials).
- Clicking the Move in-game updates resources visibly.

---

## Phase 4 — All Moves, Per Archetype

**Goal:** Every archetype's full Move list, playable.

Deliverables:
- Every Move from `FACTIONS.md` has a dispatch function and a UI button.
- Threat clocks tick each turn.
- Defeat checks run at end of turn.
- The Maelstrom subsystem from `MAELSTROM.md`, with all four thresholds.

Verification:
- Player can play a full game from start to defeat, with at least 3 of the archetypes.
- A run that ends has a Legacy score calculated.

---

## Phase 5 — AI

**Goal:** AI plays every archetype as a credible opponent.

Deliverables:
- Three class-level AI behaviors (Territorial, Mobile, Embedded).
- Per-archetype Move priors.
- AI plays out faction turns in step 4 of each turn.

Verification:
- A game with the player as a Roadlord and 4 AI Bosses produces non-trivial outcomes — Bosses sometimes form alliances against the Roadlord, sometimes pay tribute.
- An AI Whisper inside an AI Boss's hold reliably moves toward Cover-protecting Moves when Heat rises.

---

## Phase 6 — Polish

Audio, art direction, UI scenes for relationship graph / threat clocks / log history. Save/load. Mod hooks (JSON-driven content where stable).

Not scoped further until Phase 5 is in.
