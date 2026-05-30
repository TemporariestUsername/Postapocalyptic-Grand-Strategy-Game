# Wasteland

A turn-based, post-apocalyptic **grand strategy game** inspired by Vincent Baker's tabletop RPG *Apocalypse World*. You don't play a faceless empire — you play **one kind of power**: the Boss of a walled hold, the warlord of a road-gang, a Prophet whispering inside someone else's temple. Every world generates fresh from a seed; every faction has a Leader and a council of named Officers; every hold has Buildings that produce, decay, and need keeping.

```
                          THE WASTELAND
            Boss → Roadlord → Warhound → Prophet → Tinker
                  Whisper → Fixer → Hostkeeper
            Eight archetypes. Three structural classes.
              All eight are playable from turn one.
```

---

## What's in the box right now

The repo is at the end of **Phase 3.75: A World That Pushes Back** (built on the Phase 3.5 personnel/locations layer). What that means concretely:

- **Procedural world generation.** A 24×16 pointy-top hex map with fertile pockets, irradiated zones, deep wilds, and Dijkstra-traced roads between fertile centers. 4–7 Bosses on fertile hexes, 1–3 mobile gangs in the wastes, 0–3 embedded factions per hold. Determinism: the same seed produces a byte-identical world.
- **Eight playable archetypes.** Pick any from the title screen → archetype select. The choice changes where you start, what resources you track, which Moves you have, and which officers run your faction.
- **Personnel system.** Each faction is a **Leader + 3 named Officers**. Each Character has **five 0–100 stats** specific to their archetype's class:
  - **Territorial** (Boss): Authority, Industry, Vigilance, Standing, Cunning.
  - **Mobile** (Roadlord, Warhound): Notoriety, Cohesion, Mobility, Standing, Cunning.
  - **Embedded** (Prophet, Tinker, Whisper, Fixer, Hostkeeper): Influence, Network, Discretion, Conviction, Cunning.
- **Dynamic stats.** Successful Moves deposit XP into the acting officer's primary stat; idle stats drift toward 50 each turn. Specialists (≥ 70) bend the Fortune Card draw; the weak (≤ 30) bend it the wrong way.
- **Locations + Buildings.** Bosses own hex-bound LocationStates; Mobile gangs carry a *camp* that moves with them; Embedded factions own Buildings *inside* their host's hold. Each archetype has one signature starting building (Granary, Garage, Drill Yard, Shrine, Workshop, Hidden Cell, Backroom, Tavern) yielding resources scaled by condition.
- **Resolution mechanic — Fortune Cards.** A 12-card per-faction deck (3 Strong / 6 Mixed / 3 Bitter). Each Move declares the stat and officer it keys on; high stats let you keep the better of two cards, low stats keep the worse. Bitter outcomes carry a procedural Snag.
- **A real Boss strategy loop.** Six Moves competing for a 3-action season: **Tax the Hold** (money, but raises Heat/discontent), **Work the Fields** (food), **Build Walls** (defense), **Make an Example** (order), **Muster the Watch** (readiness + stall a front), and the universal **Catch your breath** (reshuffle the deck). Each is fully wired: action cost, veto reasons, Strong/Mixed/Bitter branches, officer XP, log lines.
- **An economy with feedback.** People eat Stock each season; a fed surplus grows your population (a bigger tax base that eats more); scarcity starves it and breeds discontent; a discontented hold revolts. Feeding vs. taxing vs. defending vs. policing is the core tension.
- **Threats that advance and fire.** Every seeded rival "front" ticks each season and, when it fills, hits you with a kind-specific consequence — raids burn Stock (Walls soak them), marches grind Walls then People, undermining saps Authority. The `INCOMING` panel shows the clocks bearing down on you. Until the AI lands, these fronts are how the world acts.
- **Stakes.** Archetype-specific defeat (your hold empties or revolts; your gang scatters; your cover is blown), a slow Maelstrom doom timer, and a **Legacy score** so an open-ended run has a number to chase. A full-screen epitaph when it ends.
- **Deterministic CLI demo.** `python -m wasteland --roster --seed 42` prints a full procedural faction roster (leaders, officers with their stats, hold names, grudges) to stdout for the seed and exits — no window needed.

What's **not** in yet — see [`docs/ROADMAP.md`](docs/ROADMAP.md):

- The Move catalogue for the Mobile and Embedded archetypes (Phase 4). The Boss loop is complete; other archetypes still have only Catch your breath.
- Per-turn economies for Mobile/Embedded to match the Territorial loop (Phase 4).
- The Maelstrom *threshold events* — the doom timer ticks, but omens/surges/possessions aren't wired yet (Phase 4).
- AI for rival factions — they sit on the map; their threat-fronts act, but the factions don't take Moves yet (Phase 5).

---

## Installation

### Prerequisites

- **Python 3.10 or newer.** `python --version` to check.
- **`pip`** and **`venv`** (both ship with modern Python).
- **A graphical display** if you want the Pygame UI. The `--roster` CLI mode does not need one.

System packages for Pygame on Linux (only if `pip install pygame` fails — most distributions don't need these):

```bash
# Debian / Ubuntu
sudo apt-get install -y libsdl2-2.0-0 libsdl2-image-2.0-0 libsdl2-mixer-2.0-0 libsdl2-ttf-2.0-0

# Fedora
sudo dnf install -y SDL2 SDL2_image SDL2_mixer SDL2_ttf

# macOS (Homebrew) — usually not needed; pygame wheels include SDL
brew install sdl2 sdl2_image sdl2_mixer sdl2_ttf
```

Windows: nothing extra. The pygame wheel from PyPI bundles SDL.

### Install (recommended: editable, in a virtualenv)

```bash
git clone https://github.com/TemporariestUsername/Postapocalyptic-Grand-Strategy-Game.git
cd Postapocalyptic-Grand-Strategy-Game

python -m venv .venv
source .venv/bin/activate          # Linux / macOS
# .venv\Scripts\activate           # Windows PowerShell
# .venv\Scripts\activate.bat       # Windows cmd.exe

pip install --upgrade pip
pip install -e ".[dev]"
```

`-e` installs in *editable* mode — code changes show up without reinstalling.
`[dev]` pulls in `pytest`. Leave it off if you only want to play.

### Verify the install

```bash
pytest                  # should report 70 passed
python -m wasteland --roster --seed 42   # deterministic faction roster to stdout
```

If both work, you're good. If pytest is happy but the Pygame window won't open, see [Troubleshooting](#troubleshooting) below.

---

## Running

### Launch the game

```bash
python -m wasteland                     # random seed
python -m wasteland --seed 42           # specific seed
wasteland                                # also works if the install put the console script on PATH
```

Opens a 1024×768 window. Esc returns from any scene; the window's close button always exits.

### Roster demo (no window)

Prints a deterministic procedural roster for the seed and exits. Use it to peek at a world without opening the UI, or to confirm determinism after a change.

```bash
python -m wasteland --roster --seed 42
```

Sample tail of the output:

```
--- TERRITORIAL ---
  boss         Furnace
               led by Clorzess, their own gates
               authority 69  industry 47  vigilance 53  standing 58  cunning 64
               · steward       Orss
               · marshal       Urr
               · bailiff       Krairk
               grudge: Furnace owes blood to The Pale Lockup.
```

### Tests

```bash
pytest                  # everything
pytest tests/test_characters.py     # one file
pytest -q -k upkeep                 # by keyword
```

Currently **102 tests pass.**

---

## How to play

Play a **Boss** for the full loop — the other archetypes are generated and playable, but their Move sets land in Phase 4.

1. **Title screen.** Click **New Game**. (Or **Quit**.)
2. **Archetype select.** Pick **Boss** for the complete experience. Each archetype shows a one-line pitch.
3. **World view.** You'll see the generated hex map; your hold has an accent ring. The sidebar shows your leader's stats, your 3-Officer council, your **hold order %**, your resources, an **INCOMING** panel of fronts bearing down on you (with progress bars), your action budget and Fortune Deck, your Move buttons, and the event log.
4. **Manage the season.** You get 3 actions. The tension:
   - **Work the Fields** so People don't starve — and bank a surplus to *grow* (more People = more tax, but more mouths).
   - **Tax the Hold** for Barter — but it raises Heat and stirs discontent.
   - **Build Walls** before a martial front fills — Walls soak raids and marches.
   - **Make an Example** to cut Heat and quell discontent before the hold revolts.
   - **Muster the Watch** to bank Ammo and shove the worst **INCOMING** front back a couple of seasons.
5. **Click End Turn.** Upkeep runs (the hold eats, stats drift, buildings yield), fronts advance and may fire, the Maelstrom creeps up. Watch the log.
6. **Endure.** Mismanage food, order, or defense and the run ends — your hold empties, revolts, or the Maelstrom takes everything. You're playing for a high **Legacy** score before that day comes.

Rival factions don't take Moves yet (Phase 5) — but their pre-seeded **fronts act on their own**, so the world is already dangerous.

---

## Project layout

```
Postapocalyptic-Grand-Strategy-Game/
├── README.md                       you are here
├── pyproject.toml                  package metadata, pygame + pytest deps
├── docs/
│   ├── DESIGN.md                   master design document
│   ├── FACTIONS.md                 archetype catalogue (officers, buildings, defeats)
│   ├── MECHANICS.md                resolution, clocks, economy, turn order
│   ├── PERSONNEL.md                Character model, stat schema, dynamics
│   ├── LOCATIONS.md                LocationState, Buildings, ownership rules
│   ├── PROCGEN.md                  the seed → world contract
│   ├── MAELSTROM.md                psychic threat system
│   └── ROADMAP.md                  what's done, what's next
├── src/wasteland/
│   ├── __main__.py                 CLI entry point (--seed, --roster)
│   ├── app.py                      Pygame loop + scene dispatch
│   ├── config.py                   window size, palette
│   ├── rng.py                      seeded RNG with stable derive(parent, salt)
│   ├── core/
│   │   ├── faction.py              Faction, Archetype, ArchetypeClass
│   │   ├── characters.py           Character, CharacterRole, STAT_SCHEMA, ROSTER
│   │   ├── buildings.py            Building, BuildingType, BUILDING_YIELDS
│   │   ├── locations.py            LocationState
│   │   ├── resources.py            Resource enum, per-class resource sets
│   │   ├── world.py                World root container
│   │   ├── hex.py                  pointy-top hex math
│   │   └── clock.py                threat-clock primitive
│   ├── procgen/
│   │   ├── world_gen.py            top-level: map + factions + locations + threats + decks
│   │   ├── map_gen.py              terrain, irradiated zones, roads, scarcity
│   │   ├── faction_gen.py          Bosses → Mobiles → Embedded; demo roster CLI
│   │   ├── relationships.py        sentiment graph
│   │   ├── threats.py              seeded fronts (Threat, ThreatKind)
│   │   └── names.py                phonotactic name generators
│   ├── engine/
│   │   ├── fortune.py              FortuneDeck + stat_modifier(v)
│   │   ├── moves/                  Move ABC + the six Boss Moves + Catch your breath
│   │   ├── snags.py                Bitter-outcome complications, class-filtered
│   │   ├── log.py                  LogEntry / LogKind
│   │   ├── turn.py                 end_turn: upkeep → threats → endgame → refill
│   │   ├── upkeep.py               XP, stat drift, yields, the feed/starve/grow economy
│   │   ├── threats.py              advance_threats: tick fronts, fire consequences
│   │   └── endgame.py              defeat checks + Legacy score
│   ├── scenes/
│   │   ├── title.py                title screen
│   │   ├── archetype_select.py     pick your power
│   │   └── world_view.py           hex map + sidebar
│   └── ui/text.py                  font helper
└── tests/                          70 tests, deterministic
```

---

## Design documents

The design predates the code by intent. Read these in order if you want the full picture:

1. **[`docs/DESIGN.md`](docs/DESIGN.md)** — the master document. Premise, player fantasy, three structural classes, resources, stats, resolution, Moves, the Maelstrom.
2. **[`docs/FACTIONS.md`](docs/FACTIONS.md)** — the archetype catalogue. Officer rosters and signature Buildings per archetype.
3. **[`docs/MECHANICS.md`](docs/MECHANICS.md)** — Fortune Cards, snags, the Upkeep step, action budgets, turn order, defeat conditions.
4. **[`docs/PERSONNEL.md`](docs/PERSONNEL.md)** — Character model, the 0–100 stat schema, role primaries, XP/decay dynamics.
5. **[`docs/LOCATIONS.md`](docs/LOCATIONS.md)** — LocationState, Buildings, ownership rules per class.
6. **[`docs/PROCGEN.md`](docs/PROCGEN.md)** — what `seed → World` is contractually guaranteed to produce.
7. **[`docs/MAELSTROM.md`](docs/MAELSTROM.md)** — the psychic undertow, threshold events, who eats from this table.
8. **[`docs/ROADMAP.md`](docs/ROADMAP.md)** — phased build-out; what's done and what's next.

---

## Determinism

Every procgen subsystem takes an explicit `random.Random` derived from the root seed via `rng.derive(parent, salt: str)`. This means:

- The same seed produces the same world, byte-for-byte. (Tested.)
- Adding a new generation step doesn't shift downstream draws — give it its own derived RNG.
- Fortune Decks are part of the seed-deterministic world state; reshuffles use a separate per-Move RNG (seeded off the world seed at scene init) so player choice still feels alive.

If you ever need to debug an interesting situation, the seed in the sidebar lets anyone reproduce it.

---

## Troubleshooting

**`pip install` fails on `pygame`.** Upgrade pip (`pip install --upgrade pip`) and retry. If that still fails on Linux, install the SDL2 system packages listed in [Prerequisites](#prerequisites).

**Pygame window won't open (Linux, headless, WSL).** Either run on a real desktop session, or set the dummy driver: `SDL_VIDEODRIVER=dummy python -m wasteland --roster --seed 42` is the no-graphics path. On WSL2, install a desktop or use the `--roster` mode.

**`ModuleNotFoundError: wasteland`.** You probably forgot `pip install -e .` or aren't in the venv. Activate it and re-install.

**`pytest` finds tests but they import as `wasteland.X` and fail.** `pyproject.toml` puts `src/` on `pythonpath` for pytest already; if you've changed the layout, restore `pythonpath = ["src"]` in `[tool.pytest.ini_options]`.

**ALSA warnings on Linux at startup.** Harmless — pygame initializes audio. The game makes no sounds yet.

---

## Inspiration and attribution

This game is *inspired by* but not derived from **[*Apocalypse World*](http://apocalypse-world.com/) (2010) by D. Vincent Baker**. None of Baker's text is reused. The playbook names have been reskinned:

| AW playbook  | Wasteland archetype |
|--------------|---------------------|
| Hardholder   | Boss                |
| Chopper      | Roadlord            |
| Gunlugger    | Warhound            |
| Hocus        | Prophet             |
| Savvyhead    | Tinker              |
| Brainer      | Whisper             |
| Operator     | Fixer               |
| Maestro D'   | Hostkeeper          |

The setting words *"Maelstrom"* and *"barter"* are used in tribute. The mechanic — Fortune Cards with Strong/Mixed/Bitter outcomes — is original to this project; it captures the AW *feel* of "the most common outcome costs you something" without copying 2d6+stat math. If you've never played *Apocalypse World*, you should — the influence is open and admiring.

---

## License

MIT. See the project root for the full text once it's added; until then, treat the repo as MIT-licensed.

Contributions, bug reports, and seed numbers that produced strange worlds all welcome.
