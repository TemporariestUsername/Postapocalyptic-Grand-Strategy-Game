# Mechanics — Resolution, Clocks, Economy

This is the rules document. It does not justify design choices (see `DESIGN.md` for that). It states *what happens*.

---

## 1. Resolution: Fortune Cards

Each faction maintains a personal **Fortune Deck**.

**Deck composition (default, 12 cards):**
- 3 × Strong
- 6 × Mixed
- 3 × Bitter

When a Move calls for resolution:

1. The Move declares a named stat from its class's schema (see §6) and an `acting_role` — which officer of the faction performs it. The Leader is the default.
2. The acting Character's raw 0–100 stat value `v` is read.
3. `stat_mod = stat_modifier(v)` translates that to a draw tilt:
   - `v >= 70` → `+1` (specialist; keep better of two cards).
   - `v <= 30` → `-1` (weak link; keep worse of two cards).
   - otherwise → `0` (single draw).
4. Draw 1 card from the faction's Fortune Deck. If the tilt is non-zero, draw a second and pick per the tilt (Strong > Mixed > Bitter).
5. The drawn card(s) are set aside. The deck does not auto-reshuffle.
6. Resolve the Move's text for the kept outcome.
7. On Strong/Mixed, the acting officer accrues XP into their primary stat (applied at the next Upkeep). On Bitter, the acting officer can lose stat points immediately.

The brackets in step 3 are tight on purpose. Most rolls are a single flat draw; only genuine specialists (rare; stat ≥ 70 means deep training and earned XP) bend the deck. A character at 50 in everything is a competent generalist who doesn't bend luck.

### Deck refresh

The deck refreshes only via the `Catch your breath` meta-Move (any archetype, 1 action, cost: 2 Juice). This reshuffles the discard pile back in. Without this, a faction whose deck has run dry resolves Moves with a single fresh-shuffle of the original 12 — that is, fortune becomes generous again at the *next* Move, but the player must spend an action specifically to keep the rhythm.

### Bitter Snags

When a Bitter is kept, the GM (engine) rolls on the **Snag table** for the Move's archetype. Snags are short procedural complications:

```
Universal Snags (any archetype):
  - "Heat rises by 1."
  - "Maelstrom rises by 1."
  - "An ally loses 1 Juice."
  - "A clock you'd forgotten about advances by 1."
  - "Your leader takes a Hard Hit." (-1 to a chosen stat for the next 2 turns)

Boss Snags:
  - "Stock drops by 1."
  - "A faction in your hold gains 1 Cover against you."

Mobile Snags:
  - "Gas drops by 1."
  - "A Rider deserts."

Embedded Snags:
  - "Cover drops by 1."
  - "Your host learns 1 Secret about you."
```

Phase 2 implements these procedurally with a weighted draw.

---

## 2. Threat Clocks

A clock is a tuple `(label: str, segments: int, filled: int)`. See `core/clock.py` for the primitive.

### Lifecycle (implemented in `engine/threats.py`)
- **Created** at procgen (`procgen/threats.py` seeds 1–2 per non-player faction) or, later, by faction Moves.
- **Advanced** one segment each season by `advance_threats`, called from `end_turn`.
- **Fires** when it fills: a kind-specific consequence hits the target faction (see below), it is logged, and the clock **resets** so the rivalry keeps simmering. Fronts are ongoing pressure, not one-shots.
- **Visible to the player**: fronts aimed at the player are always shown in the world-view `INCOMING` panel (they are existential). Fronts between two rivals surface in the log only when they fire against a public hold. Cunning-gated fog for *distant* fronts is reserved for a later pass.

### Threat kinds and their consequences

Each front carries a `ThreatKind` that decides what it does when it fires. Consequences read off the *target's* own resource set, so a front never takes Riders from a Boss.

| Kind | Fires on | Effect |
|---|---|---|
| **Raid** | Mobile → Territorial | Walls soak it (−1 Wall, −1 Stock) if present; otherwise −2 Stock, −1 Barter, +1 Heat. |
| **March** | Territorial → Territorial | −2 Walls; once Walls are gone, −1 People. |
| **Extort** | Mobile → Territorial | −2 Barter. |
| **Hunt** | Territorial → Mobile | −1 Riders, −1 Gas. |
| **Schism** | Embedded → any | −2 Followers. |
| **Undermine** | Embedded → Territorial | −10 Authority, +10 discontent, −1 People. |
| **Expose** | Embedded → Embedded | −2 Cover, +1 Heat. |
| **Debts** | any → any | −1 Barter, −1 Juice. |

**Walls are the load-bearing defense:** they absorb Raid and March hits, so banking Walls ahead of an incoming martial clock is how a Boss survives a neighbor's army.

### Stalling
The player can buy time against a known front:
- A Boss can **Muster the Watch** to push the most-advanced incoming clock back by 1–2 segments (and bank Ammo).
- Future archetype Moves (Demand Sanctuary, Wire the Hold, Brainwipe, Throw a Night) will stall their own class's fronts.

### Standard clock sizes
- **4 segments** — short threats (raids, exposure).
- **6 segments** — medium projects (extortion, a schism, a hunt).
- **8 segments** — long projects (a march, undermining a hold).

---

## 3. Economy

### Universal resources (every archetype tracks these)

| Resource | Earn | Spend |
|---|---|---|
| **Barter** | Most Moves yield Barter on Strong / Mixed. | Bribes, Run a Tab repayments, Move costs. |
| **Juice** | Strong outcomes often grant Juice. Standing/Influence Moves can convert Barter→Juice. | Stalling, Catch your breath, social Moves. |
| **Heat** | Generated by violent / public Moves. | Reduced by Make an Example, lying low (skipping turns). |

### Class-specific resources

**Territorial (Boss)** — the Stock↔People loop is the strategic core (`engine/upkeep.py`):

| Resource | Generation | Drain |
|---|---|---|
| **Stock** | Granary (+2/turn), Work the Fields Move | People eat `ceil(People / 2)` each Upkeep; spent as Wall materials |
| **People** | +1 when fed *and* Stock surplus ≥ 4 *and* discontent < 40 | Starvation (−1/season with no Stock), unrest, Tax/Make-an-Example Bitters, martial fronts |
| **Ammo** | Muster the Watch | Spent in combat Moves (future) |
| **Walls** | Build Walls Move | Absorbed by Raid/March fronts |

**The feeding loop:** each season the hold eats `ceil(People / 2)` Stock. Fed + surplus → People grow (a bigger tax base that *also* eats more next season). Unfed → someone starves and discontent spikes. A Granary kept by its Steward covers a small hold; a growing one needs Work the Fields. This is the tension the player manages every turn.

**Discontent → revolt:** discontent rises with starvation, Heat ≥ 6, and Authority < 30; it eases when fed and calm (faster with a Bailiff). At ≥ 60 the hold bleeds People and Authority; at 100 it revolts and the run ends. Make an Example cuts it sharply but a Bitter outcome breeds a martyr.

**Mobile (Roadlord, Warhound):**

| Resource | Generation | Drain |
|---|---|---|
| **Gas** | Found via Raid / Contract / extortion | -1 per Ride, more for long Rides |
| **Riders** | Recruit Moves | Lost in raids, deserter Snags |
| **Ammo** | Raid yields | Combat Moves |

**Embedded (Prophet, Tinker, Whisper, Fixer, Hostkeeper):**

| Resource | Generation | Drain |
|---|---|---|
| **Followers** | Preach / Throw a Night / Convert | Lost to Schism, host purge |
| **Secrets** | Hear Things / Read a Person / Diagnose | Spent to coerce, sold for Barter |
| **Cover** | Wire the Hold / Brainwipe / lying low | Reduced by failed Moves; ticks down with Heat |

---

## 4. Action Budgets per Turn

| Archetype  | Standard actions | Bonus actions |
|------------|------------------|---------------|
| Boss       | 3                | — |
| Roadlord   | 2                | +1 free Ride |
| Warhound   | 2                | — |
| Prophet    | 2                | +1 Secret Move (does not generate Heat) |
| Tinker     | 2                | +1 Secret Move |
| Whisper    | 2                | +1 Secret Move (also concealed from rivals' Cunning) |
| Fixer      | 2                | actions can be drawn from any branch |
| Hostkeeper | 2                | +1 Secret Move |

---

## 5. Turn Order

```
1. UPKEEP (engine — runs at the top of end_turn)
   1a. For each Character on each faction:
       - Apply pending XP from this turn's Moves.
       - Drift idle stats one point toward 50.
       - age += 1.
   1b. For each Building (Boss locations + Mobile camps + Embedded hosted):
       - +1 condition if the assigned officer is alive, else -1.
       - Deposit floor(base * level * condition / 100) yield into the owner's resources.
   1c. Heat decay: every faction with Heat > 0 loses 1 (universal pressure release).
   1d. For each Boss-owned LocationState:
       - Discontent rises with low Stock or low Authority; falls otherwise (faster with an active Bailiff).
2. MAELSTROM
   - Maelstrom counter advances by procedural amount (base 0, +1 per high-Conviction Embedded Move last turn that touched the Maelstrom).
   - If a threshold (25/50/75/100) is crossed, fire its event.
3. PLAYER ACTIONS
   - Player spends up to action_budget on Moves.
4. RIVAL FACTION ACTIONS
   - Each rival AI spends its budget. Initiative order is reseeded each turn.
5. THREAT CLOCKS
   - All active clocks tick by 1, plus any modifiers.
   - Clocks that fill fire their trigger NOW.
6. END
   - Defeat checks per archetype.
   - Maelstrom == 100 check.
   - Turn counter advances.
```

Phase 3.5 implements step 1 in `engine/upkeep.py`. Steps 2, 4, 5 are Phase 4+.

---

## 6. Stats (per Character, asymmetric per class)

Stats live on **Characters**, not on Factions. Each faction has a **Leader + 3 Officers** (see `docs/PERSONNEL.md`). Every Character has the five stats of their faction's class:

| Class       | Stats                                                   |
|-------------|---------------------------------------------------------|
| Territorial | **Authority, Industry, Vigilance, Standing, Cunning**   |
| Mobile      | **Notoriety, Cohesion, Mobility, Standing, Cunning**    |
| Embedded    | **Influence, Network, Discretion, Conviction, Cunning** |

Stats are integers in **0–100**. Leaders skew high in their flagship stat (mean ~75) at generation; officers skew high in their role's primary stat (mean ~62); other stats land around 50 with texture.

Stats are **dynamic**. Each Upkeep:
- Pending XP from this turn's Moves is applied (a Strong outcome typically grants +2 to the acting officer's primary stat; Mixed grants +1; Bitter can subtract).
- Every stat drifts one point toward 50 if unused.

Net effect: an officer who works steadily slowly climbs; an officer left idle slowly converges to mediocre; a wounded officer recovers naturally; a specialist who pushes themselves can reach 70+ (the specialist threshold for bending Fortune draws).

---

## 7. Locations and Buildings

See `docs/LOCATIONS.md` for the full model. Summary:

- **Bosses** own a hex-bound `LocationState` (population, discontent, authority, buildings).
- **Mobile** factions carry a `LocationState` (`camp`) on the Faction; it moves with them.
- **Embedded** factions don't own a LocationState. Their structures live in their host's `hosted_buildings` list.

Each archetype has a **signature starting Building** (Granary, Garage, Shrine, Workshop, ...) that yields a resource per turn scaled by condition.

---

## 8. Endgame (engine-side)

`end_turn` calls `check_endgame` (`engine/endgame.py`) after Upkeep and threats. The game is open-ended — there is no victory screen, only **how long you lasted and what you left behind**, scored as **Legacy**.

### Defeat conditions (implemented)

| Class | Condition |
|---|---|
| **Territorial** | People reach 0 (the hold empties), or the hold's discontent hits 100 (it revolts and throws you out). |
| **Mobile** | Riders reach 0 (the gang scatters). |
| **Embedded** | Cover gone with Heat ≥ 6 (exposed and purged), or no host left. |
| **Universal** | `world.maelstrom >= 100` — the lid comes off the world. |

The Maelstrom is a slow doom timer: it rises one notch every third season (plus Snag spikes), so even a well-run hold is playing against the clock. Legacy is the number the run is remembered by — seasons survived, holdings, people, and wealth.

### Legacy score

```
legacy = turn * 5
       + barter + juice
       + (class-specific holdings: People×10 + Stock×2 + Walls×3 + population for a Boss;
          Riders×8 + Gas×2 for a Mobile; Followers×6 + Secrets×4 + hosts×15 for Embedded)
       + best leader stat / 5
```

Mobile and Embedded economies (their per-turn drains and growth) are lighter until their full Move sets land; the defeat checks above already apply to them.
