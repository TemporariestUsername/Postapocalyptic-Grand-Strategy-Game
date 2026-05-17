# Factions — The Asymmetric Catalogue

Wasteland has **eight playable archetypes**, partitioned into **three structural classes**: Territorial, Mobile, Embedded. Class determines a faction's relationship to geography, its resource set, and the shape of the game it plays.

This document is the canonical archetype catalogue. The pitches and Move lists here are normative — if `docs/DESIGN.md` and this document disagree, this one wins.

> **Why these names?** They're reskins of *Apocalypse World*'s playbooks, picked to give Wasteland its own vocabulary while keeping the lineage obvious. Hardholder → Boss, Chopper → Roadlord, Gunlugger → Warhound, Hocus → Prophet, Savvyhead → Tinker, Brainer → Whisper, Operator → Fixer, Maestro D' → Hostkeeper.

---

## Class: Territorial

Territorial factions **own hexes**. They are the spine of the wasteland; remove them and the other archetypes have nothing to attach to.

There is one Territorial archetype.

### Boss
> *You hold the gate. The hungry sleep behind your walls.*

A Boss runs a hardhold — a fortified settlement with walls, grain, water, and a population that owes them taxes and conscription. Bosses are *public* in a way no other archetype is: everyone within five hexes knows the Boss's name.

**Resources tracked:** Barter, Juice, Heat, Stock, People, Ammo, Walls
**Stat lean:** Grit (3), Menace (2), Charm (2)
**Action budget:** 3 per turn
**Signature Moves:** Tax the Hold, Conscript, Build Walls, Make an Example, Mount a Sortie
**Defeat conditions:** Hold falls (Walls + Riders to 0 during a siege), or leader dies with no successor.

Plays most like a classic 4X faction. Worth choosing if you want the comfort of a map you can defend.

---

## Class: Mobile

Mobile factions **own no land**. They occupy a single hex each turn and can move every turn. They cannot be besieged; they can starve.

### Roadlord
> *The road is yours. You sleep where you stop.*

A biker gang. Lives on the road, makes the road dangerous for everyone else. Fuel is the limiting reagent of their existence. Their politics with hardholds are *transactional* — pay us, host us for the winter, or we take from you.

**Resources tracked:** Barter, Juice, Heat, Gas, Riders, Ammo
**Stat lean:** Menace (3), Grit (2), Charm (1), Insight (1), Weird (1)
**Action budget:** 2 actions + 1 free Ride per turn
**Signature Moves:** Ride, Raid, Extort Tolls, Demand Sanctuary, Recruit on the Road
**Defeat conditions:** Riders ≤ 1, or Gas at 0 with no Boss willing to fuel you.

### Warhound
> *You sell violence by the squad-week.*

Mercenary band. Where the Roadlord raids on principle, the Warhound takes contracts. They are professional in a way Roadlords aren't, which makes them valuable to Bosses and dangerous to everyone else.

**Resources tracked:** Barter, Juice, Heat, Gas, Riders, Ammo
**Stat lean:** Menace (3), Grit (2), Insight (2), Weird (1)
**Action budget:** 2 actions per turn
**Signature Moves:** Take the Contract, Storm a Hold, Drill the Squad, Sell Protection
**Defeat conditions:** Riders ≤ 1, or no Contract holdable for 3 consecutive turns.

---

## Class: Embedded

Embedded factions **live inside a host hardhold**. The host may or may not be theirs. Their game is influence, secrecy, and managing the host relationship.

**Universal embedded mechanics:**
- Choose a host hold at game start. Often someone else's.
- Track **Cover** (the embedded version of secrecy). Track **Heat** universally.
- When **Heat > Cover**, the host detects you. An **eviction clock** starts.
- Eviction clocks can be stalled by Cover-raising Moves, by gaining Juice with the host, or by going dormant for a turn (forfeiting all actions).
- Lose all hosts → defeat.

### Prophet
> *The Maelstrom whispers, and your flock obeys.*

A cult leader. You convert the host's People into your Followers. Your power is the Maelstrom — the moves that grow your flock fastest also push the global Maelstrom meter toward 100.

**Resources tracked:** Barter, Juice, Heat, Followers, Secrets, Cover
**Stat lean:** Weird (3), Charm (3), Insight (1)
**Action budget:** 2 actions + 1 Secret Move per turn
**Signature Moves:** Preach, Convert, Open to the Maelstrom, Anoint a Successor, Schism a Rival
**Defeat conditions:** Host evicts AND no new host accepts within 2 turns. (Also: if Maelstrom hits 100, *everyone* loses, but you'll have gotten there first.)

### Tinker
> *You make miracles from scrap. The hold needs you more than it knows.*

The hold's machine-fixer, weird-tech maker. People bring you broken things and walk away with terrible new ones. Your leverage is that the hold cannot replace you.

**Resources tracked:** Barter, Juice, Heat, Followers (customers), Secrets, Cover
**Stat lean:** Insight (3), Weird (3), Grit (1), Charm (1)
**Action budget:** 2 actions + 1 Secret Move per turn
**Signature Moves:** Build Something Weird, Trade Up, Diagnose, Wire the Hold
**Defeat conditions:** Same as Prophet — eviction with no fallback host.

### Whisper
> *You hear thoughts. You leave suggestions. Nobody remembers you.*

A psychic. The most covert archetype in the game. Nobody knows the Whisper's name unless the Whisper wants them to.

**Resources tracked:** Barter, Juice, Heat, Followers (marks), Secrets, Cover
**Stat lean:** Insight (3), Weird (3), Menace (1), Charm (1)
**Action budget:** 2 actions + 1 Secret Move per turn (Whisper's Secret Moves are extra-secret — they don't even reveal that *something* happened)
**Signature Moves:** Read a Person, Plant a Suggestion, Brainwipe, Walk in Dreams
**Defeat conditions:** Same as Prophet.

### Fixer
> *Every hold has a back door. You know them all.*

A smuggler / dealer / connection-broker. Uniquely among Embedded factions, the Fixer can hold presence in **multiple holds** at once — each one is a "branch." Each branch is a separate Cover/Heat tally. Defeat happens only when you lose your *last* branch.

**Resources tracked:** Barter, Juice, Heat (per branch), Followers (contacts), Secrets, Cover (per branch)
**Stat lean:** Charm (3), Insight (3), Grit (1), Menace (1)
**Action budget:** 2 actions per turn, drawn from any branch
**Signature Moves:** Move Goods, Call in a Favor, Set up a Score, Sell a Secret
**Defeat conditions:** Lose your last branch. (Hardest archetype to fully defeat; correspondingly the slowest to *win* with — you build influence one favor at a time.)

### Hostkeeper
> *The bar belongs to you. So do its secrets.*

You run an establishment — a bar, a brothel, a flophouse, a salon. People come to you, and they talk. Of the embedded archetypes, you're the most *publicly* visible. The Boss knows you exist. The Boss does not know what you know.

**Resources tracked:** Barter, Juice, Heat, Followers (customers), Secrets, Cover
**Stat lean:** Charm (3), Insight (2), Grit (1), Menace (1), Weird (1)
**Action budget:** 2 actions + 1 Secret Move per turn
**Signature Moves:** Throw a Night, Hear Things, Run a Tab, Quietly Vanish Someone
**Defeat conditions:** Eviction — and Hostkeepers cannot take a new host on the fly. Rebuilding the establishment takes 5 turns of vulnerability. The most fragile of the embeddeds.

---

## Quick-Reference Matrix

| Archetype  | Class       | Key resources               | Lean stats             | Defeat |
|------------|-------------|-----------------------------|------------------------|--------|
| Boss       | Territorial | Stock, People, Walls        | Grit, Menace           | Hold falls / leader dies |
| Roadlord   | Mobile      | Gas, Riders                 | Menace, Grit           | No fuel / no gang |
| Warhound   | Mobile      | Gas, Riders, Ammo           | Menace, Insight        | No gang / no contract |
| Prophet    | Embedded    | Followers, Secrets, Cover   | Weird, Charm           | Evicted, no host |
| Tinker     | Embedded    | Followers, Secrets, Cover   | Insight, Weird         | Evicted, no host |
| Whisper    | Embedded    | Followers, Secrets, Cover   | Insight, Weird         | Evicted, no host |
| Fixer      | Embedded    | Followers, Secrets, Cover×N | Charm, Insight         | Last branch lost |
| Hostkeeper | Embedded    | Followers, Secrets, Cover   | Charm, Insight         | Evicted (5-turn rebuild) |

---

## Asymmetric AI Notes (Phase 2 design preview)

The AI must be able to play any archetype the player can. Asymmetry between archetypes means the **AI has different goal functions per class**:

- A Boss AI maximizes (Stock × People + Walls) and minimizes external threats.
- A Mobile AI maximizes (Barter + Riders) and treats Gas like the resource it is — runs *toward* fuel sources, *away* from Bosses with sufficient Walls.
- An Embedded AI optimizes (Followers + Secrets) subject to (Heat < Cover). When Heat closes on Cover, the AI shifts goals to "stall the eviction clock," which is a different planning problem.

We don't write one AI; we write three AI-class behaviors, plus per-archetype Move-selection priors.
