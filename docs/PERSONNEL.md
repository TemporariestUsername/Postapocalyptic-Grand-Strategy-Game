# Personnel — Leaders and Officers

Every faction in the wasteland is run by people, not abstractions. Each faction has a **Leader** and a **Council of 3 Officers**. Together they are the faction's *personnel*. Stats live here, on the Characters — not on the Faction itself.

This document specifies the personnel model. Implementation in `src/wasteland/core/characters.py`.

---

## 1. Character model

```python
@dataclass
class Character:
    name: str
    role: CharacterRole               # leader role (Boss/Roadlord/...) or officer role
    stats: dict[str, int]             # keys depend on faction's ArchetypeClass
    age: int                          # in seasons since adulthood
    alive: bool                       # killed Characters stay in the roster for one season
    pending_xp: dict[str, int]        # accumulates from Moves; applied at Upkeep
```

Characters do not own resources or Moves; their faction does. A Character contributes to a Move by being its `acting_role` — the officer whose stat feeds the Fortune draw and who absorbs the XP / consequences.

---

## 2. Stat schema (asymmetric per ArchetypeClass)

| Class        | Stats                                                        |
|--------------|--------------------------------------------------------------|
| Territorial  | **Authority, Industry, Vigilance, Standing, Cunning**        |
| Mobile       | **Notoriety, Cohesion, Mobility, Standing, Cunning**         |
| Embedded     | **Influence, Network, Discretion, Conviction, Cunning**      |

`Cunning` is shared by all classes — every leader needs guile. Standing is shared by Territorial and Mobile (both deal with the wider world publicly); Embedded swaps it for `Conviction` (commitment to the embedded mission — faith for Prophets, craft-obsession for Tinkers, profit-loyalty for Fixers, psychic resolve for Whispers, professional pride for Hostkeepers).

Stats are integers in **0–100**. Most Characters cluster around 45–60; specialists push past 70; the broken or untrained sit under 30.

### Translation to the Fortune draw

A Character's raw stat feeds `engine/fortune.stat_modifier(v) -> int`:
- `v >= 70` → +1 (specialist; keep the better of two cards)
- `v <= 30` → -1 (weak link; keep the worse of two cards)
- else → 0 (single draw)

The thresholds are deliberately tight. *Most* officers in *most* positions don't bend luck — they take the single card the deck dealt them.

---

## 3. Roles

### Leader

Each archetype has one Leader role with one **flagship stat**:

| Archetype  | Leader role | Flagship stat |
|------------|-------------|---------------|
| Boss       | Boss        | Authority     |
| Roadlord   | Roadlord    | Notoriety     |
| Warhound   | Warhound    | Cohesion      |
| Prophet    | Prophet     | Conviction    |
| Tinker     | Tinker      | Network       |
| Whisper    | Whisper     | Influence     |
| Fixer      | Fixer       | Network       |
| Hostkeeper | Hostkeeper  | Influence     |

Leaders roll on average ~75 in their flagship stat at generation.

### Officers (3 per archetype)

| Archetype  | Officer 1 (role · primary) | Officer 2 | Officer 3 |
|------------|----------------------------|-----------|-----------|
| Boss       | Steward · Industry         | Marshal · Vigilance     | Bailiff · Authority    |
| Roadlord   | Lieutenant · Cohesion      | Outrider · Mobility     | Bag-man · Standing     |
| Warhound   | Sergeant · Cohesion        | Quartermaster · Standing| Scout · Mobility       |
| Prophet    | Chosen · Conviction        | Doomsayer · Influence   | Inquisitor · Discretion|
| Tinker     | Apprentice · Network       | Salvager · Cunning      | Junker · Network       |
| Whisper    | Acolyte · Influence        | Sleeper · Discretion    | Listener · Network     |
| Fixer      | Lieutenant · Network       | Smuggler · Discretion   | Captain · Conviction   |
| Hostkeeper | Bartender · Influence      | Bouncer · Discretion    | Madam · Network        |

Officers roll on average ~62 in their primary stat. Roles named the same across archetypes (e.g. *Lieutenant* in both Roadlord and Fixer) share the role label but key off different stats — context-driven.

---

## 4. Dynamics (Upkeep step)

Per character, each turn:

1. **Apply pending XP.** Move resolutions during the turn deposit XP into `pending_xp[stat]`. Each entry adds to `stats[stat]` (capped 0–100).
2. **Idle drift.** Every stat takes one step toward 50. A stat at 75 with no XP this turn drops to 74; a stat at 35 with no XP rises to 36.
3. **Age.** `age += 1`. Reserved for Phase 4+ effects (succession, decline).

The order is important: XP applies *before* drift, so a Strong Move (XP +2) on a 70-stat officer nets +1 (70 → 72 → 71).

Net behavior: an officer who works steadily climbs slowly; an idle officer reverts to mediocre; a wounded officer recovers naturally toward 50; only sustained Move pressure pushes someone into specialist territory (≥ 70).

---

## 5. Acting officer per Move

Each Move declares an `acting_role`. When the Move resolves:

1. The engine finds the alive officer on the faction with that role; otherwise it falls back to the Leader.
2. That Character's named stat is read; `stat_modifier` translates it to the draw tilt.
3. On Strong/Mixed outcomes, the responsible officer's `pending_xp` receives the Move's XP reward (typically +2 for Strong, +1 for Mixed).
4. On Bitter outcomes, the officer can take an immediate stat penalty (typically -3 to their primary stat) — they're held visibly accountable.

The Leader can be substituted by assigning them as the actor explicitly. Bosses can run Tax the Hold directly if the Steward is missing — the leader's flagship stat (Authority) is, after all, what the Move keys on.

---

## 6. Out of scope (this phase)

Phase 3.5 establishes the model. The following land in later phases:

- **Death and succession.** Officers can be killed in Phase 4 Moves (raids, purges). Replacement officers spawn from a pool (`Recruit an Officer` Move, or auto-promote a high-Cunning villager).
- **Poaching/defection.** A Fixer might `Call in a Favor` to recruit an enemy's Steward.
- **Trauma.** Wounded officers losing Move access for a few turns.
- **Personality traits.** Procedural quirks (Greedy, Pious, Cruel) modifying Move priors. AI flavor; not strictly needed for the player.
