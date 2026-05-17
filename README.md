# Wasteland

A turn-based, post-apocalyptic grand strategy game inspired by Vincent Baker's tabletop RPG *Apocalypse World*. You don't play a faceless empire — you play one kind of power: the Boss of a walled hold, the warlord of a road-gang, a Prophet whispering in someone else's temple. The wasteland generates fresh from a seed every time.

This repository is at **Phase 1: design + scaffold**. There is no playable game yet. The Pygame app launches, the scene system works, the procedural name generator is deterministic, and the design is fully written down in `docs/`. Phase 2 begins building the actual world generator behind the interfaces defined here. See `docs/ROADMAP.md`.

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

The scaffold proves:
- A Pygame window opens and a scene system dispatches events/updates/draws.
- The title screen offers `New Game` and `Quit`.
- `New Game` opens an archetype-select screen listing **all 8 archetypes** (Boss, Roadlord, Warhound, Prophet, Tinker, Whisper, Fixer, Hostkeeper) grouped by class — any one is selectable, proving the "every faction type is playable" constraint at the UI layer.
- The procedural name generator is deterministic for a given seed and produces a different roster for a different seed.

## Inspiration & attribution

This game is *inspired by* but not derived from *Apocalypse World* (2010) by D. Vincent Baker. None of Baker's text is reused. The playbook names have been reskinned (Hardholder → Boss, Chopper → Roadlord, Hocus → Prophet, Gunlugger → Warhound, Savvyhead → Tinker, Brainer → Whisper, Operator → Fixer, Maestro D' → Hostkeeper). The setting words "Maelstrom" and "barter" are used in tribute. If you've never played *Apocalypse World*, you should — the influence is open and admiring.

## License

MIT.
