# Locations — Settlements, Camps, and Hosted Structures

A faction is its people *and* the places it has carved out of the wasteland. **LocationState** is the structural state of a settled place: the population behind the walls, the discontent simmering in the streets, the authority of whoever runs the gate, and the **Buildings** that produce resources turn after turn.

Asymmetric ownership rules are the point. A Boss owns the place outright; a Mobile faction owns nothing fixed but carries its camp on its back; an Embedded faction owns a *room inside someone else's place*. Same data structure, three relationships.

Implementation: `src/wasteland/core/locations.py` (LocationState), `src/wasteland/core/buildings.py` (Building, BuildingType).

---

## 1. LocationState

```python
@dataclass
class LocationState:
    owner_faction_idx: int             # the faction that owns this place
    hex: Hex | None                    # None for Mobile camps (they move)
    population: int                    # 0..100; structural total (distinct from People resource)
    discontent: int                    # 0..100; rises with scarcity / low Authority
    authority: int                     # 0..100; baseline grip on the place
    buildings: list[Building]          # buildings *owned* by the location's owner
    hosted_buildings: list[Building]   # buildings owned by Embedded factions living here
```

### Ownership by class

- **Territorial (Boss).** One LocationState per Boss-owned hex, stored in `world.locations[(q, r)]`. The Boss's Buildings live in `.buildings`. Embedded factions inside this hold place their Buildings in `.hosted_buildings`.
- **Mobile (Roadlord, Warhound).** The LocationState (`camp`) lives on the Faction itself (`Faction.camp`). It moves with the gang and never appears in `world.locations`. Embedded factions cannot host inside a Mobile camp — Mobiles aren't a place anyone sleeps long enough to nest in.
- **Embedded (Prophet, Tinker, Whisper, Fixer, Hostkeeper).** No LocationState of their own. Each Embedded faction owns one or more Buildings that live in their host's `hosted_buildings` list. A Fixer with multiple hosts gets one building per host (Phase 4+; Phase 3.5 places only the primary).

### Population vs People resource

`population` (LocationState field) is the *structural* count — how big this place actually is, from 0 to 100. The `People` resource on a Boss is *taxable bodies the leader commands*. They drift in parallel: high population enables higher People; a Bitter Tax burns People (the resource) and also gradually pulls down population (Phase 4 will wire this drift).

For Phase 3.5, the two stay loosely coupled. Tests assert the resource changes; population is set at procgen time and drifts via Upkeep.

---

## 2. Building

```python
@dataclass
class Building:
    type: BuildingType
    owner_faction_idx: int       # the faction that benefits from the yield
    level: int                   # 1..3 (only L1 in this phase)
    condition: int               # 0..100; scales yield; decays without maintenance
    assigned_officer: str | None # name of the keeper; None means unassigned
```

`owner_faction_idx` is distinct from the LocationState's `owner_faction_idx`. A Prophet's Shrine inside a Boss's hold has the **Prophet** as `owner_faction_idx` (they reap the Followers) and the Boss as the LocationState's `owner_faction_idx` (they rule the place around it).

### Signature starting building per archetype

| Archetype  | Building          | Yield (L1 @ cond 100)         | Keeper officer |
|------------|-------------------|-------------------------------|----------------|
| Boss       | Granary           | +2 Stock                      | Steward        |
| Roadlord   | Garage            | +2 Gas                        | Outrider       |
| Warhound   | Drill Yard        | +1 Riders                     | Sergeant       |
| Prophet    | Shrine            | +1 Followers                  | Chosen         |
| Tinker     | Workshop          | +1 Barter                     | Apprentice     |
| Whisper    | Hidden Cell       | +1 Secrets                    | Sleeper        |
| Fixer      | Backroom          | +1 Barter                     | Smuggler       |
| Hostkeeper | Tavern            | +1 Juice, +1 Secrets          | Bartender      |

Phase 3.5 ships exactly one signature building per archetype at game start. Phase 4 adds construction Moves that let factions build more (Granary L2, second Shrine, second Hidden Cell, etc.).

### Condition and maintenance

Each turn at Upkeep:

- If the assigned officer is **alive** on the owning faction's roster, condition `+= 1` (the keeper is doing their job).
- If unassigned or the keeper is dead, condition `-= 1` (slow decay).
- Yield this turn = `floor(base * level * condition / 100)`.

A Granary at condition 60 yields 1 Stock instead of 2; at 40 it yields 0. Buildings can't be permanently destroyed by neglect in this phase (they floor at 0 and stop yielding), but Phase 4 sieges/raids can demolish them entirely.

---

## 3. Discontent dynamics

Each Upkeep, for each Boss-owned LocationState:

- If `owner.resources['stock'] <= 1` or `authority < 30`: `discontent += 1`.
- Else: `discontent -= 1` (or `-2` if an alive Bailiff exists on the owner's officer roster).

Discontent caps at [0, 100]. It does nothing in Phase 3.5 — it's instrumentation. Phase 4 ties high discontent to:
- Revolts (population secedes; Boss loses the hex).
- Embedded recruitment opportunity (Prophets convert easily in disgruntled holds).
- Refugee outflow (population drains to neighboring holds).

---

## 4. Worked example: seed 42, player as Boss

```
Boss "Hollow-scar" (player), hex (10, 7)
  Leader: Shuz   Authority 79  Industry 62  Vigilance 47  Standing 52  Cunning 63
  Officers:
    Steward Plonox   Industry primary
    Marshal Greez    Vigilance primary
    Bailiff Plan     Authority primary
  Location at (10, 7):
    population 60   discontent 0   authority 50
    buildings:
      Granary L1  condition 100  · assigned to Plonox  (yields +2 Stock/turn)
    hosted_buildings:
      Workshop L1  condition 100  (owned by Tinker "The Last Switchboard")
      Shrine   L1  condition 100  (owned by Prophet "Sons of the Cinder Mother")
      ...
```

Each Upkeep: Plonox maintains the Granary (+1 condition), Hollow-scar gains +2 Stock. The Tinker and Prophet living inside the hold collect their own yields from their hosted buildings — Hollow-scar doesn't see those resources.

---

## 5. Out of scope (this phase)

Phase 3.5 establishes the data model and the upkeep dynamics. Later phases add:

- **Building construction Moves.** `Build Walls`, `Wire the Hold`, `Set up a Score` — Moves that add Buildings to a location.
- **Upgrade Moves.** Granary L1 → L2 → L3 doubles yield (and cost).
- **Demolition.** Sieges, purges, and Heat events can destroy Buildings entirely.
- **Cross-hold network.** Fixer extra hosts get hosted Buildings.
- **Discontent → revolt.** High discontent triggers Phase 4's revolt clock.
- **Population dynamics.** Tying population to Stock surplus, Heat, and Move outcomes.
