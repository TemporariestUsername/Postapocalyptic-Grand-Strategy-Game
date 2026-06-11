# ASHFALL — systems reference

This is the contributor-facing description of how the simulation actually
works. Numbers quoted here live in `ASH.data.BALANCE` (`js/data.js`) unless
noted; if this document and the code disagree, the code is right and this
file has a bug.

---

## 1. The seed contract

`ASH.worldgen.newGame({seed, playerKey, difficulty})` must produce a
byte-identical state for identical inputs. Two mechanisms guarantee it:

- **Derived streams for generation.** Every worldgen subsystem (elevation,
  moisture, features, sites, factions, tile variants) gets its own
  `rng.local(rng.derive(seed, "salt"))` closure. Adding a new generation step
  with a new salt never shifts the draws of existing steps.
- **One simulation stream for play.** Every in-game roll — combat variance,
  storms, growth, AI dice, event draws — goes through `rng.next(state)`,
  which advances the 32-bit `state.rngState` (mulberry32). The stream is part
  of the save, so a loaded game continues the same history it would have had.

Purely cosmetic randomness (particles, audio note choice) uses separate local
streams and must never touch `state`.

## 2. The world

A 36×24 grid of pointy-top hexes, odd-r offset. Terrain comes from two fBm
value-noise fields (elevation, moisture) cut by quantiles:

| terrain | source | notes |
|---|---|---|
| Black Water | elevation < q0.06 | impassable; adjacent settlements fish (+0.5 food/tile) |
| Dead Sea | < q0.14 | passable, unsettleable salt waste |
| Crags | > q0.90 | defence ×1.5, scrap + fuel |
| Blightfens | moisture > q0.84 | food; doubled by a Purifier |
| Pine Barrens | moisture > q0.60 | best plain food |
| Ash Plains | everything else | the default grey |
| Glasslands | 3–5 blast craters stamped on top | radioactive, unsettleable until Rad Inoculants |
| Ruins | 5–7 random-walk city blobs | scrap + knowledge, defence ×1.3 |

Craters carry a radiation field (rad 2–3 core, rad 1 fringe). Units ending a
season on rad ground take `radDamage × rad/2` hp, modified by faction
(`radImmune`, `radResist`) or the Rad Inoculants tech.

**Sites:** 3 Sealed Vaults and 6 Supply Caches (one-shot salvage), 2 Old
Reactors (+2 fuel/season to whoever holds the hex), and exactly 1 **Beacon**,
biased toward the map's centre — the tech-victory objective.

**Faction placement:** capitals go on the best-scored habitable tiles
(food-weighted, rad-penalized) subject to a minimum spacing of 7 hexes
(relaxed only if the map is cramped; tests assert ≥5). Each faction starts
with its capital settlement (pop 12), the ring of tiles around it, its
doctrine's starting warbands, and `startRes` (× difficulty for the player).

## 3. Resources & the season tick

Five stocks — **food, scrap, fuel, meds, knowledge** — plus **Hope** (0–100,
faction-wide) and **population** (per settlement; 1 pop ≈ 20 souls).

Each settlement yields per season:

```
base (2 food, 1.5 scrap)
+ 2 × its own tile's terrain yields
+ 1 × each adjacent owned tile's yields (water fishes at 0.5 food)
+ buildings (hydrofarm +3 food, forge +2.5 scrap, still +1.5 fuel, …)
+ 0.1 scrap per pop (labor)
```

Faction-level modifiers multiply after summing: doctrine mods, Reforged Tools
(+20% scrap), season food multiplier (Long Dark ×0.55, Glare ×1.1), and the
AI's difficulty yield factor. Consumption: pop × 0.5 food, plus per-unit
scrap/fuel upkeep.

**Deficits hurt instead of going negative:** a food deficit zeroes the stock,
costs `starvationHopeHit` hope and 1 pop in the largest settlement; a
scrap/fuel deficit marks `lastDeficit` (which gates the mutiny event), rots
every warband for 10 hp, and bleeds hope. Fed factions with ≥3 food surplus
roll for growth; war drags hope down each season; the Choir's `hopeFloor`
holds at 15 while they hold a settlement.

Buildings finish when their queue ticks to zero (Arc Forges save a season).
Research progress accrues from net knowledge each tick.

## 4. Units & combat

Five unit types (scavenger, militia, raider, veteran, reclaimer) defined in
`data.js`: cost, pop cost, upkeep, atk/def, movement, vision, abilities
(salvage / pillage / found). Recruiting consumes settlement pop and yields a
unit with 0 moves (mustering takes the season). Movement is Dijkstra over
terrain costs; enemy-held tiles are entered only by capture.

`combat.attack(state, fid, from, target)` resolves immediately:

- up to 3 rounds; each side's strength = Σ (stat × hp%) with attacker/defender
  faction mods and Plate & Powder, × random 0.85–1.2 per round;
- defenders multiply by terrain defence, settlement (+20%), and Walls (×1.6);
- settlements defend themselves even empty: garrison = `pop × 0.35 + 1.5`
  (+2 with Barracks);
- damage is proportional to force share, spread across the stack with the
  front unit soaking more;
- if every defender breaks and an attacker survives, the hex (and settlement)
  is captured: a quarter of the pop flees, the ring of border tiles flips,
  hope swings both ways, and a fallen **capital** relocates the loser's court
  to their next settlement.

Attacking someone you're not at war with declares it (rel −30 both ways). AI
factions sue for peace when outmatched ~2:1; offers to the player arrive as a
modal, and `sim.acceptsPeace` answers the player's own offers.

## 5. Events

`data.js` carries ~22 narrative events. Each has an id, prose, a weight
(× difficulty `harsh` when flagged), an optional `cond(state, faction)`
gate, a per-faction cooldown, optional `once`, and 2–3 choices whose
`effects` are **declarative** (`{res:{food:-5}, hope:4, rel:{choir:12},
spawn:{type:"militia"}, pop:2, tech:5, flagged:"x"}`) so the engine — and the
test suite — can apply every branch mechanically. The player draws at most
one per season (55% chance); AI factions quietly resolve their own draws by
`aiScore` weights. A Purifier converts Black Rain into a log line, which is
the building working as advertised.

## 6. Remembrance (tech)

Eleven techs in three branches, linear prereqs inside each:

- **Survival:** Seed Vaults → Clean Water → Field Medicine → Rad Inoculants
  (settle the glass, ignore its damage);
- **Industry:** Reforged Tools → Combustion / Plate & Powder → Arc Forges;
- **Signal:** Signal Discipline (+1 sight, reveal rival capitals) →
  Cryptolexicon (+1 knowledge per Archive) → **The Long Antenna** (unlocks
  the Beacon).

## 7. The Beacon

Hold the Beacon hex (claim it with any warband), research The Long Antenna,
pay 60 scrap + 20 fuel to begin the Kindling, then end six seasons with a
friendly warband standing on the spire. Losing the hex resets progress; an
uncrewed season merely pauses it. Completing it wins the game; the AI does
not pursue the Beacon (its three personality families chase land instead),
which is a deliberate asymmetry: the Beacon is the *player's* long game under
siege pressure.

## 8. Victory & ruin

Checked at the end of every season:

- **Dominion:** any faction holding ≥60% of all settlements (min 8) — win if
  it's you, game over if it isn't.
- **Last banner:** sole surviving faction.
- **Beacon:** see above.
- **Ruin:** you lose every settlement (overrun), or Hope reaches 0
  (collapse). Eliminated factions' lands return to the wastes.

The Legacy score: `settlements×15 + pop×2 + techs×10 + battlesWon×5 +
salvaged×3 + turns (+100 for winning)`.

## 9. AI

`ai.takeTurn` per rival each season: pick research from a doctrine-ordered
list; build against deficits first, then by personality; recruit toward a
desired army size (settlements + war posture + aggression); occasionally
train a reclaimer and walk it to the best-scored site; consider war
(needs a shared border, rel < −10, usually a 1.35:1 strength edge, scaled by
personality × difficulty aggression); then move units — garrison threatened
settlements, advance on the nearest enemy and attack when the local odds
clear a personality-specific bar, salvage with scavengers, claim border
hexes, drift home in peace. All of it rolls on the simulation stream, so AI
behaviour replays deterministically.

## 10. Save format

`turn.serialize` strips the two derived tables (`adj`, `visible`) and
stringifies the rest; `deserialize` validates `v: 1`, rebuilds adjacency, and
recomputes vision. Saves live in `localStorage["ashfall.save.v1"]`
(autosaved every season, cleared on game over). Round-tripping is asserted
byte-identical in the tests.

## 11. Presentation contracts

- `render.js` owns a base offscreen canvas (terrain, borders, settlements,
  fog) redrawn only when `markDirty()` is called — state mutations that
  change the map must mark it. Per-frame work is units, highlights, storms,
  shimmer, flashes, ash, vignette, grain, culled to the viewport.
- `audio.js` exposes `boot()` (first user gesture), `updateMood(state)`,
  `stinger(kind)`, `sfx(name)`; everything no-ops without an AudioContext so
  the headless tests can load the file.
- `ui.js` renders DOM from state and calls the controller in `main.js`;
  neither is loaded by the core tests.

## 12. Balance knobs

Everything tunable sits in `ASH.data.BALANCE` with comments: eat rate, growth
threshold and chance, heal/rad/storm damage, hope regen and war drag, battle
rounds, pillage loot, dominion fraction, event chance, settlement caps. The
test `economy: every faction starts food-positive` is the canary — if a
balance change starves a doctrine on turn one, the suite says so.
