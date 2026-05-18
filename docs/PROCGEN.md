# Procedural Generation

The world is entirely procedural. There are no hand-authored maps, factions, leaders, or events. A single 64-bit integer seed reproduces the entire starting state.

This document specifies the **generation contract** — what every layer takes as input, what it produces, and how layers compose. Phase 1 implements the names layer and a demo roster. Phase 2 implements the rest behind these interfaces.

---

## 1. The Seed Contract

> **Determinism guarantee:** For a given integer seed, `generate_world(seed)` produces a byte-identical world.

This is *tested* in `tests/test_names.py` for the names layer. As each subsequent layer lands, the test is extended.

Mechanics:
- Every procgen function takes an explicit `random.Random` instance. No `random.seed(...)` at module scope; no use of the `random` module's process-wide global state.
- Subsystems get **derived RNGs** via `rng.derive(parent, salt)`. The salt is a string identifying the subsystem (`"names"`, `"map"`, `"grudges"`, ...). This insulates each subsystem from changes to the others: adding a new layer doesn't shift downstream draws.
- The salt string is hashed via BLAKE2b (not Python's built-in `hash()`, which is randomized per process).

---

## 2. Generation Pipeline

```
seed
  │
  ▼
make_rng(seed)  ─────► root_rng
  │
  ├── derive("map")        ─► map_rng       ─► generate_map()       → HexMap
  ├── derive("names")      ─► names_rng     ─► (used by faction gen)
  ├── derive("factions")   ─► faction_rng   ─► place_factions()     → list[Faction]
  ├── derive("grudges")    ─► grudges_rng   ─► build_relationships()→ RelationshipGraph
  ├── derive("threats")    ─► threats_rng   ─► seed_threats()       → list[Clock]
  └── derive("maelstrom")  ─► maelstrom_rng ─► seed_maelstrom()     → MaelstromState
```

### Layer 1: Map

`generate_map(rng, width=24, height=16) → HexMap`

Phase 2 implementation:
1. Build a flat hex grid.
2. Lay down terrain with cellular automaton: start with random `wastes/ruins/fertile` distribution, smooth over 3 passes.
3. Drop **fertile pockets** — 4–7 small clusters of `fertile` hexes, spaced.
4. Drop **irradiated zones** — 1–3 clusters of `irradiated` hexes; these radiate Maelstrom bias to adjacent hexes.
5. Trace **roads** between fertile pockets via least-cost paths (cost: terrain difficulty).
6. Mark **deep wilds** at the map edges.
7. Assign a **scarcity tag** to each hex based on terrain and proximity to roads.

Phase 1 stub returns a flat map of `wastes` tiles (see `procgen/map_gen.py`). The interface is the contract.

### Layer 2: Names

`procgen/names.py` (implemented in Phase 1).

Five generators:
- `hold_name(rng)` → e.g., `"Rust-Gable"`, `"Cinder"`
- `leader_name(rng)` → e.g., `"Krin"`, `"Mama Sallow"`, `"Vex-9"`
- `gang_name(rng)` → e.g., `"The Iron Coyotes"`
- `cult_name(rng)` → e.g., `"Children of the Hollow Sun"`
- `outfit_name(rng, leader_first_name)` → e.g., `"Saint's Lockup"`, `"Workshop on Smoke Lane"`

The wordlists are deliberately small and rust-colored. Adding new entries is fine; reordering them breaks determinism for old seeds, so do it deliberately.

### Layer 3: Factions

Phase 2: `place_factions(map, rng) → list[Faction]`

Algorithm:
1. **Bosses.** Pick `N_BOSSES ∈ [4, 7]` fertile hexes with at least 3 hexes of spacing. Each gets a procedural `hold_name`, a `leader_name`, stat array per archetype weighting, and starting resources.
2. **Mobiles.** Pick `N_MOBILE ∈ [1, 3]` road / wasteland hexes for Roadlords / Warhounds. Each gets a `gang_name`, a `leader_name`, a starting "haunt" radius.
3. **Embedded.** For each Boss-hold:
   - Roll `N_EMBEDDED ∈ [0, 3]` embedded factions hosted *inside* it. (Note: independent per hold — a hold might have a Prophet and a Fixer who don't necessarily know about each other.)
   - For each, pick an archetype from `{Prophet, Tinker, Whisper, Fixer, Hostkeeper}`; pick a name (`cult_name` for Prophet, `outfit_name` for the rest); pick a leader; assign starting Cover/Heat such that initial detection chance is low but non-zero.
   - Fixers may have presence in 1–3 holds initially.
4. **Player position.** The player chooses an archetype at game start; the generator places one **player-flagged faction** of that archetype, displacing or coexisting with a generated one as needed.

### Layer 4: Relationships

`build_relationships(factions, rng) → RelationshipGraph`

Each pair of factions gets a starting sentiment ∈ `[-100, +100]`, weighted by archetype proximity rules:

```
Two Bosses adjacent on the map           : -30 ± 20   (territorial conflict)
Two Bosses non-adjacent                  :   0 ± 20
Boss + Mobile (Mobile has raided lately) : -40 ± 20
Boss + Embedded inside their hold        :   0 ± 30   (host doesn't always know!)
Two Embedded same host                   : -10 ± 30   (competitors)
Prophet + Embedded leader with Conviction ≥ 60 : +15 ± 20  (cult-affinity)
Whisper + anyone                         :   0 ± 10   (cipher; relationships
                                                       built secretly later)
```

The graph also stores **hidden grudges** — directional, asymmetric facts ("Glass-reach owes blood to The Burnt Vultures") that get revealed through play.

### Layer 5: Threats / Fronts

`seed_threats(factions, rng) → list[(Faction, Clock)]`

Each AI faction rolls `1–2` starting threat clocks. Each clock has:
- A `label` (procedural: combines a verb-noun pattern: "raid Glass-reach", "schism the flock", "extort the road").
- A `segments` count (`4`, `6`, or `8`, biased by threat magnitude).
- A `target` (another faction or "anyone").
- A `trigger` (a procedural effect to apply when filled).

### Layer 6: Maelstrom

`seed_maelstrom(map, rng) → MaelstromState`

- Starting global level rolled in `[10, 25]`.
- Each irradiated hex contributes +1 passive Maelstrom bias to itself and its neighbors per turn.

---

## 3. Determinism Tests

`tests/test_names.py` covers the names layer:

- Same seed → same name sequence.
- Different seeds → different name sequence (sampled across 50 names).
- The full demo roster (`generate_demo_roster(seed)`) is byte-identical between two calls with the same seed.

Phase 2 extends this with `test_map_gen.py`, `test_faction_gen.py`, and a high-level `test_world_gen.py` that does a full seed → world generation and snapshots the result.

---

## 4. What does NOT use procgen

Three categories of content are written by hand:

1. **Archetype definitions and Move lists.** These are the *rules* of the game. They live in `core/faction.py` and the design docs.
2. **The Snag table.** Procedurally weighted, but the entries themselves are hand-written.
3. **The Maelstrom threshold events.** Each of `25/50/75/100` is a hand-authored event because those moments carry the most weight; we want them to land.

Everything else — names, layout, starting positions, grudges, threats, leader stats — is generated.
