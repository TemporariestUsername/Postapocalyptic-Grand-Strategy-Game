"""Seeded RNG. Every procgen consumer takes an explicit Random instance.

We never touch `random.seed` at module scope - tests and gameplay both need to
be able to spin up isolated RNG streams without colliding.
"""

from __future__ import annotations

import hashlib
import random


def make_rng(seed: int | None = None) -> random.Random:
    """Build a Random seeded with `seed`. If None, use a system-time seed."""
    return random.Random(seed)


def _stable_hash(s: str) -> int:
    return int.from_bytes(hashlib.blake2b(s.encode("utf-8"), digest_size=8).digest(), "big")


def derive(rng: random.Random, salt: str) -> random.Random:
    """Spawn a child RNG deterministically derived from a parent + salt string.

    Useful when you want one subsystem's procgen (e.g. map) to be independent
    of another (e.g. names) given the same seed, so adding new generation steps
    later doesn't shift downstream results. Uses BLAKE2b for the salt because
    Python's built-in hash() of strings is randomized per process.
    """
    child_seed = rng.getrandbits(64) ^ _stable_hash(salt)
    return random.Random(child_seed)
