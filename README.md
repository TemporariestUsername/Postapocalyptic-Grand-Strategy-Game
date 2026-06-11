# ASHFALL

**The world ended. The ash remembers.**

![The title vista — synthesized live, like everything else](docs/screenshots/title.png)

An evocative, gritty, **post-apocalyptic grand strategy game** that runs in your
browser. Eighty-seven years after the Fall, six factions scrabble over a
procedurally ruined earth. You lead one of them: feed your people through the
Long Dark, raise warbands from your own thin population, salvage the old
world's bones, weather the ash storms, out-scheme five rival banners — and end
the long silence, by dominion, by survival, or by kindling the Beacon and
making the sky answer.

**Everything is procedural. There are no asset files.** The map is generated
from a seed. The art is drawn live on a canvas. The full layered soundtrack —
drones, wind, war-drums, far-off bells — is synthesized note by note in
WebAudio while you play. The repository contains code and prose, nothing else.

| | |
|---|---|
| ![A lived-in world, 23 seasons in](docs/screenshots/world.png) | ![Your capital, your borders, your problems](docs/screenshots/capital.png) |

---

## Run it

No build step. No dependencies. Pick whichever you like:

```bash
# 1 — just open it
open index.html              # macOS
xdg-open index.html          # Linux
start index.html             # Windows

# 2 — or serve it (makes browser saves durable across sessions)
node tools/serve.js          # -> http://localhost:8080
# or: python3 -m http.server 8080
```

Any modern desktop browser works (Chrome, Firefox, Edge, Safari). Turn your
sound on — the soundtrack is half the weather report.

---

## The six banners

| Faction | Doctrine |
|---|---|
| **The Hearthbound** | Farmers with rifles. +25% food, sturdier defence, hope mends faster. Slow to anger, slow to march. |
| **The Rust Legion** | An army that outlived its war. +25% attack, +15% scrap. Hungry, hated, and aware of neither. |
| **The Veiled Choir** | They sing to the Glow and swear it sings back. Hope cannot break while the sanctum stands; radiation does half work on them. |
| **The Free Caravans** | Rolling cities of welded trucks and counted favours. +25% scrap and fuel, the best market rates. Everything they love can be stolen. |
| **The Archivists** | Monks of the magnetic tape. +50% knowledge, walls of conviction. An army of librarians is an army of librarians. |
| **The Court of Teeth** | The wastes' own children. The Glow ignores them; broods grow fast. Trusted by no one, including each other. |

All six are playable; the other five are run by personality-driven AI
(builder, warlord, zealot, trader, hermit, raider) that expands, builds,
researches, raids, declares wars it thinks it can win, and sues for peace
when it turns out it couldn't.

## How a season goes

One turn is one season — Thaw, Glare, Rust, and the **Long Dark**, when food
yields halve and the storms hunt. Each season you:

- **Feed everyone.** Population is your deepest resource: it eats, it grows,
  it staffs every warband you muster. Watch the FOOD net number like it owes
  you money.
- **Build** hydrofarms, scrapforges, stills, clinics, archives, walls,
  barracks, radio masts, purifiers — six structures per settlement, each a
  trade-off.
- **March.** Scavengers salvage vaults and ruins; raiders pillage; militia
  hold; reclaimer crews — three families and a disassembled windmill —
  **found new settlements**, which is how you actually win.
- **Claim** hexes, **trade** at the market, **research** the Remembrance tree
  (Survival / Industry / Signal), manage **Hope** — the resource that, when it
  runs out, your story does.
- **Endure the world's turn.** Rivals act, ash storms walk, the glasslands
  burn whoever stands in them, and the narrative deck deals you another hard
  choice in two or three paragraphs of prose: black rain, deserters, the
  drowned bell, a child born unmarked by the Glow.

**Three roads out:** hold 60% of the world's settlements · outlive every
rival · or research the Long Antenna, claim the Beacon hex, pay its cost, and
keep a warband on the spire for six straight seasons while everyone watches
you do it.

**Controls:** click to select · click a lit hex to march, a red-ringed hex to
attack · drag/arrows pan · wheel zoom · **Enter** ends the season · **Space**
jumps home · **Esc** deselects · **M** mutes. The `?` button has the rest.

---

## The soundtrack

There is no audio directory. `js/audio.js` builds the entire score at
runtime in A phrygian:

- **Drone** — detuned saws and a sub sine breathing through a slow filter LFO;
- **Wind** — looping brown noise through a wandering bandpass;
- **Pads** — chord progressions chosen per *mood*, swelling over two bars;
- **Melody** — sparse chord-aware plucks through a long feedback echo, with
  rare far-off FM bells;
- **Percussion** — toms and metal clanks that only wake when the mood does.

The **mood engine** (calm / tension / war / doom / title) follows the game
state — your wars, your hope, storms on the horizon — and crossfades the
layers over seconds, so peace sounds like grief on hold and war sounds like a
forge falling downstairs. Stingers punctuate events, battles, declarations,
victory, defeat. Every interface click, march, salvage rattle, and hammer
blow is an envelope over oscillators and filtered noise.

## The graphics

There is no image directory either. `js/render.js` draws:

- a pointy-top hex world with per-tile procedural texture — pine barrens,
  blasted glasslands that shimmer at night, drowned water, dead seabed,
  ruined city blocks with broken crowns;
- fog of war, faction borders, hand-drawn faction sigils, settlement clusters
  that grow with population;
- walking ash storms, radiation fringes, battle flashes, floating casualty
  numbers, the Beacon's pulse;
- drifting ash particles, a vignette, and film grain over everything
  (toggleable in settings);
- and the animated title vista — dying sun, ruined skyline, one lit window.

---

## Architecture

```
index.html            shell — classic scripts, works from file://
css/style.css         rust, bone, ash
js/
  util.js  rng.js     helpers; deterministic seeded RNG (sim stream + local streams)
  names.js            procedural names: settlements, leaders by culture, warbands
  data.js             ALL game data: terrain, factions, units, buildings,
                      techs, balance knobs, and the narrative event deck
  worldgen.js         seed -> world: noise terrain, craters, dead cities,
                      sites, faction placement
  sim.js              the simulation core: economy, movement, settlements,
                      tech, diplomacy, market, vision, the Beacon
  combat.js           stack battles, garrisons, capture, capitals falling
  events.js           event engine: draw, gate, apply declarative effects
  ai.js               rival faction brains, one personality each
  turn.js             end-of-season pipeline, storms, victory/defeat, save/load
  audio.js            the synthesized soundtrack + SFX (browser only)
  render.js           the canvas renderer (browser only)
  ui.js  main.js      DOM chrome + controller/input/loop (browser only)
tests/
  run_tests.js        32 headless tests of the whole core — node, no deps
  smoke_dom.js        boots the REAL ui in jsdom and plays seasons (optional)
tools/
  serve.js            zero-dep static server
  screenshot.js       renders real PNGs of the game headlessly (optional)
```

**Design rules the code lives by:**

- **State is plain data.** No classes, no methods on game objects. Save =
  `JSON.stringify`, load = parse + rebuild two derived tables. The game
  autosaves to localStorage every season.
- **Determinism is contractual.** Every gameplay roll flows through one RNG
  stream stored *in* the state; worldgen draws from per-subsystem derived
  seeds. Same seed + same choices = byte-identical history (tested). Seeds
  can be numbers or any phrase you like.
- **The core never touches the DOM.** Everything in `js/` up to `turn.js`
  runs in bare Node, which is what makes the test suite and the headless
  screenshot tool possible.

## Tests

```bash
npm test                     # 32 core tests: worldgen determinism, economy,
                             # combat, events, tech, trade, beacon, save/load,
                             # and 60-season full-AI autoplays with invariants

npm i --no-save jsdom && npm run test:dom    # boots the real UI headlessly:
                             # title -> faction select -> build -> recruit ->
                             # research -> 8 seasons -> save -> load

npm i --no-save @napi-rs/canvas && npm run shots   # re-render the README
                             # screenshots through the actual renderer
```

## Design

The full systems reference — generation contract, economy math, combat
formulas, the event deck's rules, AI behaviour, balance knobs — lives in
[`docs/DESIGN.md`](docs/DESIGN.md).

## License

MIT. Take it, fork it, reskin it, set it on fire — the wasteland keeps no
score. Seed numbers that produced strange worlds gratefully accepted.
