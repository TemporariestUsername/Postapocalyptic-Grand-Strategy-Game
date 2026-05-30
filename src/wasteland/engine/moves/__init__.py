"""Faction Moves. Each Move is a Move subclass that registers itself on import.

Boss (Territorial) has a full strategic loop:
    - Tax the Hold       (money; raises Heat/discontent)
    - Work the Fields    (food; feeds People, enables growth)
    - Build Walls        (defense; soaks martial fronts)
    - Make an Example    (order; cuts Heat and discontent)
    - Muster the Watch   (readiness; Ammo + stalls an incoming front)
Universal:
    - Catch your breath  (reshuffles the Fortune Deck)

Other archetypes' full Move sets land in subsequent phases (see docs/FACTIONS.md).
"""

from .base import Move, MoveResult, available_moves, get_move
from .tax_the_hold import TaxTheHold
from .work_the_fields import WorkTheFields
from .build_walls import BuildWalls
from .make_an_example import MakeAnExample
from .muster_the_watch import MusterTheWatch
from .catch_your_breath import CatchYourBreath

__all__ = [
    "Move",
    "MoveResult",
    "available_moves",
    "get_move",
    "TaxTheHold",
    "WorkTheFields",
    "BuildWalls",
    "MakeAnExample",
    "MusterTheWatch",
    "CatchYourBreath",
]
