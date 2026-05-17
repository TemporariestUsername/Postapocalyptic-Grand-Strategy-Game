"""CLI entry point. `python -m wasteland [--seed N] [--roster]`."""

from __future__ import annotations

import argparse
import secrets
import sys

from .procgen.faction_gen import format_roster, generate_demo_roster


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="wasteland", description="A grand strategy of scarce things.")
    parser.add_argument(
        "--seed", type=int, default=None,
        help="Integer seed for procedural generation. Random if omitted.",
    )
    parser.add_argument(
        "--roster", action="store_true",
        help="Print a procedural faction roster for the seed and exit. No window opened.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    seed = args.seed if args.seed is not None else secrets.randbits(31)

    if args.roster:
        roster = generate_demo_roster(seed)
        print(format_roster(roster))
        print(f"seed: {seed}")
        return 0

    # Lazy import so --roster works without pygame initializing a display.
    from .app import run
    run(seed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
