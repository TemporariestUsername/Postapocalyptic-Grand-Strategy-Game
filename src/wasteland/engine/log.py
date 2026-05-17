"""Event log: a small append-only list of things that happened this game.

Each entry is one line. The world view shows the most recent few.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class LogKind(str, Enum):
    MOVE = "move"
    OUTCOME = "outcome"
    SNAG = "snag"
    SYSTEM = "system"


@dataclass
class LogEntry:
    turn: int
    kind: LogKind
    text: str
