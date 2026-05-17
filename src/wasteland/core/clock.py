"""Threat clock primitive.

A clock has a fixed number of segments (typically 4, 6, or 8). It advances by
N segments at a time; when it fills, it triggers. Stolen wholesale from
*Apocalypse World* / Blades in the Dark conventions for faction "fronts".
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Clock:
    label: str
    segments: int
    filled: int = 0

    def __post_init__(self) -> None:
        if self.segments <= 0:
            raise ValueError("clock must have at least one segment")
        if self.filled < 0:
            raise ValueError("filled cannot be negative")
        self.filled = min(self.filled, self.segments)

    @property
    def is_full(self) -> bool:
        return self.filled >= self.segments

    @property
    def remaining(self) -> int:
        return max(0, self.segments - self.filled)

    def advance(self, amount: int = 1) -> bool:
        """Advance by `amount` segments. Returns True if this tick filled the clock.

        Once full, further calls are no-ops and return False.
        """
        if amount < 0:
            raise ValueError("advance amount cannot be negative")
        if self.is_full:
            return False
        before_full = self.is_full
        self.filled = min(self.segments, self.filled + amount)
        return self.is_full and not before_full

    def reset(self) -> None:
        self.filled = 0
