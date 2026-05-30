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
- `engine/moves/tax_the_hold.py`: full implementation of the Boss's signature Move - stat-modified Fortune draw, Strong/Mixed/Bitter branches with resource effects and a Bitter Snag. (Phase 3.5 rekeyed this to Authority-on-Steward.)
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

## Phase 3.5 — Personnel + Locations + Buildings + Dynamics *(complete)*

**Goal:** Replace AW-flavored faction stats with a Grand Strategy substrate: named Officers + structural Locations + dynamic state that evolves each turn.

Delivered:
- `core/characters.py`: `Character` (Leader + 3 Officers per faction), `CharacterRole` enum, asymmetric 5-stat `STAT_SCHEMA` per ArchetypeClass (Territorial: Authority/Industry/Vigilance/Standing/Cunning; Mobile: Notoriety/Cohesion/Mobility/Standing/Cunning; Embedded: Influence/Network/Discretion/Conviction/Cunning), 0–100 stat scale with triangular-distribution `roll_character`, canonical officer `ROSTER` (3 named roles per archetype with a primary stat each).
- `core/buildings.py`: `Building` dataclass with type/level/condition/assigned_officer, `BuildingType` enum (Granary/Garage/Drill Yard/Shrine/Workshop/Hidden Cell/Backroom/Tavern), `BUILDING_YIELDS` table, `BUILDING_KEEPER_ROLE` map, condition-scaled `yield_now()`.
- `core/locations.py`: `LocationState` (population, discontent, authority, buildings, hosted_buildings).
- `core/faction.py`: dropped `FactionStats`; added `leader: Character | None`, `officers: list[Character]`, `camp: LocationState | None` (Mobile-only). `leader_name` is now a `@property`.
- `core/world.py`: added `locations: dict[(q, r), LocationState]`.
- `engine/fortune.py`: added `stat_modifier(value: int) -> int` translating a 0–100 stat into the −1/0/+1 draw tilt at the 30/70 thresholds.
- `engine/moves/base.py`: `Move.stat` is now `str | None`; added `acting_role` and helpers `acting_character`, `stat_value`, `draw_modifier`.
- `engine/moves/tax_the_hold.py`: keys on the Steward's Authority; Strong/Mixed grant Authority XP; Bitter wounds the Steward.
- `engine/upkeep.py`: end-turn dynamics — apply pending XP, drift idle stats toward 50, age characters, maintain buildings (yield + condition), Heat decay, location discontent drift.
- `engine/turn.py`: `end_turn` runs Upkeep before refilling the player's actions.
- `procgen/faction_gen.py`: rewrote roster generation around `_build_roster` (Leader + 3 officers per faction). `format_roster` prints the new shape.
- `procgen/world_gen.py`: `_populate_locations` builds hex-bound LocationStates for Bosses, camps for Mobiles, and slots Embedded factions' signature Buildings into the right host's `hosted_buildings`.
- `procgen/names.py`: added `officer_name(rng)`.
- `scenes/world_view.py`: sidebar now shows the class-specific 5-stat line for the leader, an officer council list (role · name · primary stat), and a Buildings sub-panel per selected hex with condition % and keeper.
- `docs/PERSONNEL.md` and `docs/LOCATIONS.md` document the model; `docs/MECHANICS.md` updated for the new stat system and Upkeep step.

Verification:
- `tests/test_characters.py` (9 tests): stat-schema correctness, every archetype has 3 officer roles, every primary stat is in its class's schema, stat values clamp to [10, 95], leader skews high in flagship, officer skews high in primary.
- `tests/test_buildings.py` (5 tests): yield-at-full, yield scales with condition, yield zero below threshold, yield scales with level, multi-resource yield (Tavern).
- `tests/test_upkeep.py` (10 tests): pending XP applied before drift, idle drift toward 50, characters age, Granary deposits Stock when keeper alive, Heat decays/floors, condition holds with keeper / decays without, Mobile camps tick, Embedded hosted buildings tick, upkeep emits log entries.
- `tests/test_world_gen.py` extended with 3 new tests: every faction has leader + 3 officers, every Boss has a location with a Granary, every Mobile has a camp with one building, every Embedded has a hosted building.
- `tests/test_moves.py` rewritten for the new stat shape; Strong Tax confirmed to deposit +2 Authority XP, Bitter Tax confirmed to lower Steward Authority by 3.
- 70/70 tests pass.
- Manual play: 5 turns of Tax the Hold on seed 42 grew Barter 4 → 28, Heat 1 → 10, Stock 3 → 9 (Granary at 100% kept yielding +2/turn), Steward Authority 37 → 48 (drift up due to Move XP); deck depleted exactly on schedule.

---

## Phase 3.75 — A World That Pushes Back *(complete)*

**Goal:** Turn the inert demo into a strategic simulation: the world advances and bites on its own, the player has real decisions, and runs can end.

Delivered:
- `engine/upkeep.py`: a real Territorial economy. People eat `ceil(People/2)` Stock each season; surplus + calm grows population; scarcity starves it and spikes discontent; discontent ≥ 60 bleeds People/Authority; discontent 100 revolts. A Maelstrom doom timer rises every third season.
- `engine/threats.py`: `advance_threats` ticks every seeded front each season and **fires** kind-specific consequences when one fills (raids soak on Walls then burn Stock; marches grind Walls then People; undermining saps Authority; extortion bleeds Barter; etc.), then resets the front. `ThreatKind` added to `procgen/threats.py`. Pre-seeded fronts are how the world acts until the Phase 5 AI lands.
- `engine/endgame.py`: archetype-specific defeat checks (hold empties / revolts; gang scatters; embedded exposed or hostless) plus the universal Maelstrom cap, and a `legacy_score`. `World.outcome` records the end; `end_turn` stops cleanly when set.
- Four new Boss Moves (`engine/moves/`): **Work the Fields** (Stock/food), **Build Walls** (defense that soaks martial fronts), **Make an Example** (cuts Heat + discontent), **Muster the Watch** (Ammo + stalls the worst incoming front). With Tax the Hold and Catch your breath, the Boss now has a genuine 3-action tradeoff each season.
- `scenes/world_view.py`: an `INCOMING` panel listing fronts aimed at the player with progress bars, a hold-`order %` readout, input gating once the game is over, and a full-screen game-over overlay with the run's epitaph and Legacy score.

Verification:
- `tests/test_threats_engine.py` (8), `tests/test_endgame.py` (9), economy tests in `tests/test_upkeep.py` (+6), new-Move tests in `tests/test_moves.py` (+9). **102/102 tests pass.**
- Scripted playthroughs (seed 7): feed-and-fortify play grows a hold 4→11 People over 13 seasons and survives; greedy tax-only spirals on Heat and depopulates into a scored defeat by season 9.

---

## Phase 4 — Remaining Archetype Moves + the Maelstrom Subsystem

**Goal:** Every archetype's full Move list playable, and the Maelstrom acting.

Deliverables:
- Every Move from `FACTIONS.md` (Mobile + Embedded sets) has a dispatch function and a UI button.
- Mobile and Embedded per-turn economies (Gas drain, Cover/Heat dynamics) to match the Territorial loop already in `engine/upkeep.py`.
- The Maelstrom subsystem from `MAELSTROM.md`, with all four threshold events (the doom timer already ticks; the threshold *events* are what's left).

Verification:
- Player can play a full game from start to defeat with at least 3 of the archetypes (Boss is already there).
- Threat fog-of-war keyed on Cunning for distant fronts.

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
