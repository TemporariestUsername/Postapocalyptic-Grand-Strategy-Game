# Roadmap

Phased build-out. Each phase has a concrete deliverable, a verification step, and an explicit "what's in / out" boundary.

---

## Phase 1 — Design + Scaffold *(complete)*

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

## Phase 2 — World Generation *(complete)*

**Goal:** Generate a real world from a seed and display it.

Delivered:
- `procgen/map_gen.py`: fertile-pocket BFS painting + distance-from-fertile terrain bands + irradiated zones + Dijkstra road tracing + scarcity tagging.
- `procgen/faction_gen.generate_factions`: places 4–7 Bosses on fertile hexes; 1–3 Mobiles in distant wastes/ruins; 0–3 Embedded per hold with no-archetype-duplication; Fixers get 0–2 extra hold branches; exactly one faction flagged `is_player`.
- `procgen/relationships.py`: archetype-pair sentiment baselines, Boss/Boss adjacency hostility bonus, one named grudge per faction.
- `procgen/threats.py`: 1–2 threats per non-player faction with class-filtered templates and partially-pre-filled clocks.
- `procgen/world_gen.generate_world(seed, player_archetype)` orchestrating it all with per-subsystem derived RNGs.
- `scenes/world_view.py`: pointy-top hex rendering, terrain palette, road polylines, hold/mobile markers with player ring, sidebar with player block + per-hex info + archetype-aware embedded fog-of-war.
- Title → Archetype select → World view wired end-to-end (Enter or click on a chosen archetype generates the world).

Verification:
- `tests/test_world_gen.py` — 10 tests covering determinism, structural invariants (every Boss on fertile, every Embedded has a host, Mobiles off boss-hexes, irradiated tiles have Maelstrom bias, exactly one player), and threat-index validity.
- 23/23 tests pass.
- Visual: see `world_view_boss.png` / `world_view_roadlord.png` (same seed, different player archetypes).

---

## Phase 3 — Resolution + One Loop of One Move *(complete)*

**Goal:** Implement Fortune Cards and one playable Move end-to-end.

Delivered:
- `engine/fortune.py`: 12-card per-faction Fortune Deck with `_RANK`-based "better/worse of two" stat resolution, soft-cliff emergency draw when the deck is empty, and discard-then-reshuffle semantics for *Catch your breath*.
- `engine/snags.py`: Snag table filtered by archetype class with per-faction effect callbacks.
- `engine/log.py`: typed `LogEntry` with `LogKind` for move/outcome/snag/system lines.
- `engine/moves/base.py`: `Move` ABC, module-level registry, `available_moves` and `get_move` helpers.
- `engine/moves/tax_the_hold.py`: full implementation of the Boss's signature Move - Charm-stat draw, Strong/Mixed/Bitter branches with resource effects and a Bitter Snag.
- `engine/moves/catch_your_breath.py`: universal meta-Move that reshuffles the deck for 2 Juice.
- `engine/turn.py`: per-archetype action budgets, `end_turn` that ticks the turn counter and refills the player's actions.
- `procgen/world_gen.py`: every faction gets a fresh `FortuneDeck` derived from a stable salt, so deck shuffles are part of the seed-deterministic world state.
- `scenes/world_view.py`: sidebar gained an ACTIONS counter, deck composition readout (e.g. `2S 5M 3B`), clickable Move buttons that disable themselves with a veto reason when unavailable, a scrollable event log, and an End Turn button.

Verification:
- `tests/test_fortune.py` (5 tests): canonical 3/6/3 composition, draw-empties-deck-to-discard, reshuffle restores 12, statistical assertion that stat +2 produces ≥1.5× the Strongs of stat 0 over 500 trials, emergency draw on empty deck.
- `tests/test_moves.py` (10 tests): Strong/Mixed/Bitter Tax effects, veto when People=0, Catch-requires-2-Juice, action-budget table, end-turn refills, archetype-specific Move availability.
- 38/38 tests pass.
- Manual play: 5 turns of taxation grew Barter from 4 to 38, Heat from 2 to 13, exhausted the deck (0 remaining, 30 in discard), and Catch your breath became available exactly when expected.

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
