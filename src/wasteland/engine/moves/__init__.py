"""Faction Moves. Each Move is a Move subclass that registers itself on import.

One playable archetype per class now has a full strategic loop:

Boss (Territorial):
    - Tax the Hold       (Authority; raises Heat/discontent)
    - Work the Fields    (Industry; feeds People, enables growth)
    - Build Walls        (Industry; soaks martial fronts)
    - Make an Example    (Vigilance; cuts Heat and discontent)
    - Muster the Watch   (Vigilance; Ammo + stalls an incoming front)

Roadlord (Mobile):
    - Raid               (Notoriety; take Barter/Stock from nearest hold)
    - Extort Tolls       (Notoriety; lighter take, less Heat)
    - Demand Sanctuary   (Standing; refill Gas, shelter for a few seasons)
    - Recruit on the Road (Standing; +Riders for Barter)

Prophet (Embedded):
    - Preach             (Conviction; safe Followers growth)
    - Convert            (Influence; take from host's People, Heat)
    - Open to the Maelstrom (Conviction; Secrets + push the meter)
    - Schism a Rival     (Cunning; cut another embedded's Followers)

Universal:
    - Catch your breath  (reshuffles the Fortune Deck)

Warhound, Tinker, Whisper, Fixer, Hostkeeper play but use only Catch your
breath for now; their full Move sets land in the next phase.
"""

from .base import Move, MoveResult, available_moves, get_move
from .tax_the_hold import TaxTheHold
from .work_the_fields import WorkTheFields
from .build_walls import BuildWalls
from .make_an_example import MakeAnExample
from .muster_the_watch import MusterTheWatch
from .roadlord_moves import Raid, ExtortTolls, DemandSanctuary, RecruitOnTheRoad
from .prophet_moves import Preach, Convert, OpenToTheMaelstrom, SchismARival
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
    "Raid",
    "ExtortTolls",
    "DemandSanctuary",
    "RecruitOnTheRoad",
    "Preach",
    "Convert",
    "OpenToTheMaelstrom",
    "SchismARival",
    "CatchYourBreath",
]
