# Wasteland — Master Design Document

> A turn-based grand strategy game inspired by Vincent Baker's *Apocalypse World*.
> You don't play a faceless empire. You play one *kind* of power.

---

## 1. Premise & Tone

The apocalypse already happened. Nobody agrees on what it was. Some say the bombs, some say the plague, some say the Maelstrom rose up and took everything that wasn't bolted down. The history isn't the point. The wasteland is the point.

What's left: **hardholds** — fortified settlements clinging to defensible water, fertile dirt, or some pre-Fall machine nobody understands; **roads** between them, half-buried; **gangs** that ride the roads because they can't take the holds; **cults** that grew up in the holds because the holds couldn't keep them out; and the **Maelstrom**, the psychic undertow that whispers to anyone with the ear for it and which is, in some sense, what's wrong with everything.

The tone is **scarcity, weariness, and consequence**:

- Resources are always short. The hold's grain stores are always months away from running out. Ammo is hoarded. Fuel is worth blood.
- Every action costs something. There are very few clean wins. The mechanic embodies this — the most common outcome is a *Mixed* draw, and Mixed always means "you get what you wanted, but here's what it cost."
- Death is normal. Holds fall. Leaders die. Cults schism. The game does not protect you. The default ending is defeat.
- The Maelstrom listens. Some characters *use* it. Most are wise to fear it.

The game should feel like *Mad Max* on the road, *The Road* in the wastes, and *True Detective: Season 1* whenever the Maelstrom is on screen.

---

## 2. Player Fantasy — *one kind of power*

You are not playing "a civilization." You are playing **a single faction** with a leader, a small set of stats, and a structurally specific game that is **different from the games other archetypes play**.

There are three structural classes of faction:

| Class | What you have | What you don't | The game you play |
|---|---|---|---|
| **Territorial** | Walls, people, grain, a gate | Mobility, secrecy | Defend what you hold. Project power outward. Survive the inside as much as the outside. |
| **Mobile** | Wheels, fuel, a gang | A home, a wall | Where do we sleep tonight? Who do we squeeze? When do we run? |
| **Embedded** | A host, followers, secrets | Open authority, your own walls | Stay useful, stay hidden, take the temple from the inside. |

If you play a **Boss** (territorial), you are playing the closest thing to a classic 4X game: you own hexes, you have garrisons, you tax your population, you build walls, you go to war with the neighboring Boss. Your defeats are familiar: starvation, siege, succession crisis.

If you play a **Roadlord** (mobile), you have no land at all. Each turn you and your gang are *in* a hex; next turn you're somewhere else. Your resources are Gas and Riders. The Bosses pay you not to raid them; the cults invite you to do things their hosts can't be seen doing. Your defeat is when the road runs out — no fuel, no gang, no welcome anywhere.

If you play a **Prophet** (embedded), you start *inside someone else's hold*. The Boss does not necessarily know you're there. Your followers are a parallel power structure inside their walls. Your moves are Preach, Convert, Schism, Open to the Maelstrom. You win by taking the hold from inside, or by spreading across multiple holds without ever ruling one openly. Your defeat is when the host detects and purges you.

Every one of those archetypes is **selectable from the title screen**. None of them is "the player faction" versus "the NPC factions." The world is populated by other factions of the same archetypes, each playing the same game you are, against you and each other.

---

## 3. Turn Structure

One turn is one **season**.

```
1. UPKEEP          — pay maintenance (Stock, Gas, Followers' demands). Faction may starve here.
2. MAELSTROM       — the Maelstrom clock advances; events fire at thresholds.
3. PLAYER ACTIONS  — spend an action budget (see below) on Moves.
4. RIVAL FACTIONS  — each AI faction takes its actions, in initiative order.
5. THREAT CLOCKS   — all unresolved threat clocks tick forward.
6. END             — death/eviction/fall checks. Defeat screens fire here.
```

**Action budgets are asymmetric.** A Boss runs a hold full of subordinates and gets **3 actions** per turn. A Roadlord can only be in one place and gets **2 actions** plus a free Ride. An embedded faction is constrained by its cover and gets **2 actions**, but can also spend **1 Secret Move** per turn that does not generate Heat.

**Initiative is partially random.** The order in which AI factions act is rerolled each turn (seeded), so the player can't memorize "the Roadlord always raids me before the Prophet preaches." This keeps the wasteland feeling reactive.

---

## 4. The Three Archetype Classes

### Territorial — *the spine of the game*

There is one Territorial archetype: the **Boss**. Bosses are the substrate of the wasteland. They own hexes. They hold population. They control the grain. Without them, the other archetypes have nowhere to attach.

A Boss's existence is **public**. Everyone in the wasteland knows the name of every Boss within five hexes. You cannot hide a hold.

A Boss's primary loop:
- Tax the hold for Barter and Stock.
- Defend the walls against raids.
- Project power outward into adjacent hexes (which can themselves become holdings).
- Deal with the embedded factions you can see, and the ones you can't.

### Mobile — *the wasteland's nervous system*

Mobile archetypes (**Roadlord**, **Warhound**) own no land. They occupy a single hex each turn and can move every turn. They have no walls; their defense is movement and reputation.

Their resources are Gas and Riders (or Soldiers). Both are **constantly draining**. A Roadlord that doesn't raid, extort, or get hired this turn is bleeding fuel for nothing.

Mobiles **cannot be besieged**. They can be hunted, ambushed, or starved (cut off from fuel), but you cannot trap them in place. They make the wasteland between the holds dangerous in a way no Boss can match.

### Embedded — *the parasite is also the immune system*

Embedded archetypes (**Prophet**, **Tinker**, **Whisper**, **Fixer**, **Hostkeeper**) live *inside a hardhold*. Their host may or may not be theirs. A Boss-faction may have a Prophet operating openly under their patronage — or one operating *without their knowledge*, in their own walls, building toward a coup.

Their public existence is partial. Bosses know the Hostkeeper runs the bar; they know the Tinker fixes things. They do not necessarily know the Hostkeeper is taking confessions for the Whisper, or that the Tinker is also a Prophet.

Their resources are Followers, Secrets, and Cover. Cover is the inverse of Heat at the embedded scale — when a faction's Heat exceeds its Cover, the host detects them, and the **eviction clock** starts ticking.

Embedded factions interact with the world *through* their host. A Prophet in Glass-reach can preach to Glass-reach's population. They cannot preach to Salt-holm's population unless they cross the wastes and accept a new host there (a separate move that exposes them).

---

## 5. Resources

| Resource | Tracked by | Use |
|---|---|---|
| **Barter** | all | universal currency |
| **Juice** | all | reputation/influence — spend to bend a deal |
| **Heat** | all | how loud the world finds you; bad for everyone but especially fatal for Embedded |
| **Stock** | Territorial | grain, water; consumed each Upkeep |
| **People** | Territorial | population; produces Stock and Barter, can be Conscripted |
| **Ammo** | Territorial, Mobile | needed for any combat Move |
| **Walls** | Territorial | reduces incoming damage in sieges/raids |
| **Gas** | Mobile | needed to Ride each turn |
| **Riders** | Mobile | gang strength — needed for raids, extortion, and protection contracts |
| **Followers** | Embedded | flock/customers/marks; produces Barter and Secrets |
| **Secrets** | Embedded | the embedded faction's primary leverage; spend to coerce or to be paid |
| **Cover** | Embedded | inverse of Heat at the embedded scale |

This is a deliberately small economy. Each archetype tracks **about six resources** (three universal + class-specific). The cognitive load on the player is bounded.

---

## 6. Faction Stats

Five faction-scale stats, reflavored from AW's Cool/Hard/Hot/Sharp/Weird:

| Stat | What it covers |
|---|---|
| **Grit** | Endurance, persistence, taking a hit. |
| **Menace** | Capacity for violence. Read as: how willing is this faction to do something irreversible? |
| **Charm** | Ability to bargain, recruit, charm a host. |
| **Insight** | Information, foresight, reading rivals. |
| **Weird** | Connection to the Maelstrom. |

Every faction has all five. Archetypes weight them differently at generation (see `procgen/faction_gen.py: _STAT_WEIGHTS`). A Boss is grit-heavy and weird-light. A Prophet is the inverse.

Each stat is a small integer (typically -1 to +5). Stats modify draws on the resolution mechanic.

---

## 7. Action Resolution — *Fortune Cards*

We need a resolution mechanic that captures the *Apocalypse World* feel of "the most common outcome is a partial success that costs you something" — without copying AW's 2d6+stat math.

**The mechanic: Fortune Cards.**

Each faction has its own **Fortune Deck** of 12 cards:

- **3 Strong cards** — full success
- **6 Mixed cards** — success with a cost (the default)
- **3 Bitter cards** — failure, often with a complication

To resolve a Move:
1. Identify the relevant stat (each Move declares one).
2. Draw 1 card.
3. If the stat is +1 or higher, draw an extra card and **keep the better**.
4. If the stat is -1 or lower, draw an extra card and **keep the worse**.
5. Resolve the Move's text for that outcome.
6. The drawn card is set aside; the deck does not reshuffle until it is empty.

This last point is the load-bearing design. **Bad luck is finite.** If you've drawn two Bitters in a row, there's only one left in the deck — your next gamble is statistically safer. It also gives skilled players information: counting cards is a legitimate strategic skill, the same way it is for a Boss who knows their granary has two seasons of stock left.

Bitter cards always come with a **Snag**: a procedurally chosen complication — "an ally gets hurt," "Heat rises," "the Maelstrom notices." The same Move can fail in different ways across the deck's lifetime.

---

## 8. Moves by Archetype

Each archetype gets **4–6 signature Moves**. Below is the Phase-1 catalogue. Phase 2 fills in the mechanics for each (cost, stat, effect on Strong/Mixed/Bitter outcomes).

### Boss (Territorial)
- **Tax the Hold** *(Charm)* — gain Barter; People drop by 1 on Bitter, Heat rises on Bitter.
- **Conscript** *(Menace)* — convert People into Riders/Soldiers; Mixed costs Juice.
- **Build Walls** *(Grit)* — increase Walls; Mixed delays one turn.
- **Make an Example** *(Menace)* — public execution; reduces Heat at the cost of Juice.
- **Mount a Sortie** *(Menace)* — attack a hex outside your walls; Bitter means losing Riders without taking the hex.

### Roadlord (Mobile)
- **Ride** *(free)* — move to an adjacent hex; ride farther on Strong.
- **Raid** *(Menace)* — hit a hold or convoy; trade Riders for Barter/Stock.
- **Extort Tolls** *(Charm)* — set up at a road junction; passive Barter every turn until pushed off.
- **Demand Sanctuary** *(Charm)* — make a hold host you for the winter; raises mutual Heat.
- **Recruit on the Road** *(Charm)* — gain Riders from broken holds; raises your Heat.

### Warhound (Mobile)
- **Take the Contract** *(Insight)* — accept a Boss's job; guarantees Barter, but the job is rolled procedurally.
- **Storm a Hold** *(Menace)* — full assault; Riders trade for Walls and People.
- **Drill the Squad** *(Grit)* — recover Riders' fatigue; pulls one Bitter out of your deck and replaces with Mixed.
- **Sell Protection** *(Charm)* — passive Barter from a hold while you stay nearby.

### Prophet (Embedded)
- **Preach** *(Charm)* — gain Followers in your host hold.
- **Convert** *(Charm)* — turn one of the host's People into your Followers; raises Heat.
- **Open to the Maelstrom** *(Weird)* — gain Secrets; advances the global Maelstrom clock by 1.
- **Anoint a Successor** *(Insight)* — establish a successor; survives your leader's death.
- **Schism a Rival** *(Insight)* — split another embedded faction's Followers.

### Tinker (Embedded)
- **Build Something Weird** *(Weird)* — produce a one-shot artifact (procedural effect).
- **Trade Up** *(Insight)* — convert Barter to better Barter via salvage; Mixed: less than promised.
- **Diagnose** *(Insight)* — reveal one Secret about another faction in your host.
- **Wire the Hold** *(Insight)* — set up surveillance that raises your Cover.

### Whisper (Embedded)
- **Read a Person** *(Insight)* — gain a Secret about any named character.
- **Plant a Suggestion** *(Weird)* — influence one of the host's actions next turn.
- **Brainwipe** *(Weird)* — remove one Secret another faction holds about you.
- **Walk in Dreams** *(Weird)* — see one rival's planned move; raises Maelstrom.

### Fixer (Embedded)
- **Move Goods** *(Insight)* — convert Barter across two holds you have presence in.
- **Call in a Favor** *(Charm)* — spend Juice for a one-time effect from any named character.
- **Set up a Score** *(Insight)* — start a 3-segment clock that pays out Barter when it fills.
- **Sell a Secret** *(Charm)* — trade Secrets for Barter or Juice.

### Hostkeeper (Embedded)
- **Throw a Night** *(Charm)* — gain Followers (customers); gain a Secret on Strong.
- **Hear Things** *(Insight)* — gain a Secret about your host's plans.
- **Run a Tab** *(Charm)* — defer a Barter cost from another Move; the tab itself becomes leverage on the debtor.
- **Quietly Vanish Someone** *(Menace)* — remove a named character; raises Heat sharply.

---

## 9. Cross-Faction Interaction

The asymmetry creates rich interaction patterns. A non-exhaustive list:

- **A Boss vs. an enemy Boss.** Classic territorial war: sorties, sieges, attrition. Walls vs. Walls.
- **A Boss vs. a Mobile.** The Boss cannot pursue; the Mobile cannot besiege. They settle into a *protection-or-tribute* dynamic, or the Boss hires a Warhound to hunt the Mobile.
- **A Boss vs. an Embedded faction inside their hold.** If the Boss doesn't know the embedded faction is there, this interaction doesn't exist yet. Once Heat exceeds Cover, the Boss can spend actions on Investigate / Purge / Evict. The Embedded faction can run, switch hosts, or fight back asymmetrically (Schism, Plant a Suggestion).
- **Two Embedded factions in the same host.** They compete for Followers, Secrets, and the host's tolerance. They can also ally — a Prophet and a Fixer can be a frighteningly stable partnership.
- **An Embedded faction vs. an outside Mobile.** Mostly mediated by the host. A Whisper might *want* a Roadlord to raid their host (weakens the Boss they're trying to undermine) and Plant a Suggestion accordingly.
- **A Fixer in multiple holds.** Fixers are the only Embedded archetype with multi-host presence. Each new host requires a Move to establish, and raises Heat globally.

This is the system's combinatorial heart and where most procedural texture will emerge. Phase 2 builds the relationship graph and the host/eviction system.

---

## 10. The Maelstrom

The Maelstrom is a **global meter** from 0 to 100. It rises with:
- Violence (raids, sieges, assassinations).
- Death (especially of named characters).
- Deliberate Moves (Open to the Maelstrom, Walk in Dreams).
- Tile-local pressure (irradiated zones have a passive +1/turn nearby).

At threshold values (25, 50, 75, 100) the Maelstrom **acts**:

- **25 — Omens.** Procedural narrative beats: dreams, dead birds, static. Mostly flavor.
- **50 — Surges.** A named character somewhere in the wasteland *opens* — gains Weird, loses Grit. The faction's behavior shifts.
- **75 — Possessions.** A faction's leader may be replaced by the Maelstrom's puppet, with a hostile agenda. Rare but devastating.
- **100 — The Lid Comes Off.** Universal defeat condition. The game ends. Final Legacy score is calculated against the wasteland that no longer exists.

Prophets and Whispers *use* the Maelstrom — their best Moves draw on it, but those Moves also raise it. The tension is real for them: every Move that earns them Followers or Secrets brings the world closer to the cliff.

See `docs/MAELSTROM.md` for the full event table.

---

## 11. Threats & Clocks

Every AI faction has **1–2 Threat clocks** at any time, modeled on AW's "fronts." A clock is `(label, segments_total, segments_filled, trigger)`. When the clock fills, the trigger fires — typically a hostile action against the player or another faction.

Examples:
- *"The Cracked Snakes raid Glass-reach in 4 turns unless tribute is paid."* (4-segment clock, +1/turn unless the player pays Barter)
- *"Hands of the Long Silence schism the Boss's flock in 6 turns."*

The player can **see** clocks they have Insight enough to read, and can **stall** them with Moves. Clocks the player can't see are revealed when they fire.

See `docs/MECHANICS.md` for the threat-clock system in full.

---

## 12. Map

A pointy-top hex grid, **procedurally generated**. Default size is 24×16 hexes.

Each hex has:
- A **terrain** type: wastes, ruins, fertile, irradiated, deep_wilds.
- A **scarcity** tag: barren, picked-over, fertile-but-claimed, rich, irradiated.
- A possible **occupant**: a Boss (the hex *is* their hold), a Mobile (passing through), the wreck of a previous Boss, nothing.

The map is the same for every faction in the same game (same seed). Where you start depends on your archetype:
- Bosses spawn in fertile hexes with no other Boss within 3 hexes.
- Mobiles spawn on a road tile or in wastes adjacent to one.
- Embedded factions spawn inside a Boss's hold — *not necessarily yours*. The most interesting starts have you embedded in a rival Boss.

Phase 1 ships only the interface for the map (`procgen/map_gen.py`). The real generator (cellular-automaton terrain + flood-fill biomes + road tracing) is Phase 2.

---

## 13. Procedural Generation

Covered in detail in [`PROCGEN.md`](PROCGEN.md). Key contract:

> A single integer seed reproduces a full game state — map, factions, leaders, names, grudges, initial threats — byte for byte.

Phase 1 implements the names layer and a demo roster generator. Phase 2 extends this to the full pipeline.

---

## 14. Victory & Defeat

There is no fixed victory. The game ends in **defeat or in the Maelstrom**.

**Universal defeat:** Maelstrom hits 100. The wasteland ends. Final Legacy is calculated.

**Archetype-specific defeat:**

| Archetype | Defeat condition |
|---|---|
| **Boss** | The hold falls (Walls + Riders reduced to 0 during a siege) OR the leader dies and no successor is named. |
| **Roadlord** | Riders below threshold (1) OR Gas at 0 with no Boss willing to fuel you. |
| **Warhound** | Riders below threshold (1) OR no Contract holdable for 3 consecutive turns. |
| **Prophet** | The host evicts you AND no other host accepts you within 2 turns. |
| **Tinker** | The host evicts you AND no other host accepts you within 2 turns. |
| **Whisper** | The host evicts you AND no other host accepts you within 2 turns. |
| **Fixer** | Lose your last host (Fixers track multiple). |
| **Hostkeeper** | The host evicts you — and Hostkeepers can't take a new host without rebuilding the establishment over 5 turns. The most fragile of the embeddeds. |

**Legacy** is a final score combining longevity, resources accumulated, Moves performed, named rivals outlived, and Maelstrom level at game-over. The intent is that *runs are stories*, and the Legacy score is just a number to compare runs by.

---

## 15. Architecture Notes

- **Engine:** Pygame, single-window, 1024×768. No 3D, no shaders.
- **Top-level:** A scene-based loop. The current scene receives events, ticks, and draws each frame. Scenes can request transitions (`scene.next_scene = NextScene(...)`) or quit (`scene.quit = True`).
- **World state:** A single `World` dataclass holds all game state. Pure functions in `core/` and `engine/` mutate or replace it. This keeps save/load trivial later — pickling the dataclass tree is acceptable for Phase 2; we'll move to JSON at Phase 3 when modders need it.
- **RNG:** Every procgen consumer takes an explicit `random.Random`. The seed flows from the CLI → `World.seed` → child RNGs via `rng.derive(parent, salt)`. **No `random.seed` at module scope.**
- **Tests:** `pytest`. The two load-bearing tests for Phase 1 are `test_clock.py` (the threat-clock primitive) and `test_names.py` (the procgen determinism contract).
- **Content:** Names, archetype pitches, and stat weights live in code, not JSON. Reason: changes to these in Phase 1–3 are rare and Python is more discoverable. We'll migrate to JSON/TOML when the content surface stabilizes.

---

## 16. Open Questions

These are flagged for resolution but **not blockers** for Phase 1:

1. **Replenishing the Fortune Deck.** When the 12-card deck empties, do we reshuffle, or does the deck shrink permanently and force restart-flavored play? Lean: reshuffle, but only after a "Catch your breath" Move that costs Juice.
2. **Multi-faction player.** Can a Fixer in two holds technically "be" both? Likely yes — Fixer is intentionally the cross-hold archetype.
3. **Diplomacy UI.** A separate relationship-graph screen, or inline through faction tooltips? Probably both, but the inline view is the daily-driver.
4. **Map size scaling.** 24×16 hexes is a guess. Phase 2 needs playtest to tune.
5. **AI for embedded factions.** AI Bosses are tractable. AI Prophets are not — *what does an AI Whisper want, and how does it model "stay hidden"?* This will need its own design pass.
6. **Sound.** Out of scope for now. The setting wants a sparse soundscape: wind, distant generators, occasional static. Out-of-scope marker, not a forgetting.
