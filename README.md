# Wasteland

A turn-based, post-apocalyptic grand strategy game inspired by Vincent Baker's tabletop RPG *Apocalypse World*. You don't play a faceless empire — you play one kind of power: the Boss of a walled hold, the warlord of a road-gang, a Prophet whispering in someone else's temple. The wasteland generates fresh from a seed every time.

This repository is at **Phase 3: resolution + one playable Move**. Phases 1–3 are complete: design + scaffold, procedural world + hex map, and now Fortune Cards plus one Move (the Boss's *Tax the Hold*) wired end-to-end, with the universal *Catch your breath* meta-Move alongside it. Pick Boss as your archetype, click Tax the Hold, watch the deck shrink and the log fill. End the turn to refill your action budget. No AI opponents yet; that's Phase 5. See `docs/ROADMAP.md`.

## Status

- Design: see [`docs/DESIGN.md`](docs/DESIGN.md)
- Archetype catalogue: see [`docs/FACTIONS.md`](docs/FACTIONS.md)
- Procedural generation contract: see [`docs/PROCGEN.md`](docs/PROCGEN.md)
- Mechanics (resolution, clocks, economy): see [`docs/MECHANICS.md`](docs/MECHANICS.md)
- The Maelstrom: see [`docs/MAELSTROM.md`](docs/MAELSTROM.md)
- Roadmap: see [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m wasteland             # launches the Pygame app
python -m wasteland --seed 42   # deterministic procgen demo
python -m wasteland --roster --seed 42  # print a procedural faction roster and exit
pytest                          # run the tests
```

What works today:
- The title screen offers `New Game` and `Quit`.
- Archetype select lists **all 8 archetypes** (Boss, Roadlord, Warhound, Prophet, Tinker, Whisper, Fixer, Hostkeeper) grouped by class. Pick any one.
- Picking an archetype generates a full world for the current seed and opens the **world view**: a pointy-top hex map showing terrain (wastes / ruins / fertile / irradiated / deep wilds), procedurally traced roads between fertile pockets, hardholds with names, mobile gangs in the wastes, and a sidebar with player info, selected-hex info, and embedded-faction visibility filtered by your archetype's fog-of-war rules.
- The procedural name generator and the full world generator are deterministic: same seed → byte-identical world.
- Esc returns to the title screen at any point.

## Inspiration & attribution

This game is *inspired by* but not derived from *Apocalypse World* (2010) by D. Vincent Baker. None of Baker's text is reused. The playbook names have been reskinned (Hardholder → Boss, Chopper → Roadlord, Hocus → Prophet, Gunlugger → Warhound, Savvyhead → Tinker, Brainer → Whisper, Operator → Fixer, Maestro D' → Hostkeeper). The setting words "Maelstrom" and "barter" are used in tribute. If you've never played *Apocalypse World*, you should — the influence is open and admiring.

## License

MIT.
