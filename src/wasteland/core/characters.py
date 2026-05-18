"""Characters: leaders and officers.

Every faction has a Leader plus a fixed slate of Officers. Both are
Characters. Stats are 0-100, per-class asymmetric (see STAT_SCHEMA):
Territorial factions track Authority/Industry/Vigilance/Standing/Cunning,
Mobile factions track Notoriety/Cohesion/Mobility/Standing/Cunning, Embedded
factions track Influence/Network/Discretion/Conviction/Cunning.

Stats grow with use (Move resolution deposits XP into the acting officer's
primary stat) and decay toward 50 each turn through the Upkeep step.

The Fortune Card resolver still consumes a -1/0/+1 modifier; the translation
from 0-100 stat to that modifier lives in engine/fortune.stat_modifier.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum

from .faction import ARCHETYPE_CLASS, Archetype, ArchetypeClass


class CharacterRole(str, Enum):
    # Leader roles - one per archetype. Mirrors Archetype but is its own enum
    # so 'is_leader' checks don't have to import Archetype semantics.
    BOSS = "boss"
    ROADLORD = "roadlord"
    WARHOUND = "warhound"
    PROPHET = "prophet"
    TINKER = "tinker"
    WHISPER = "whisper"
    FIXER = "fixer"
    HOSTKEEPER = "hostkeeper"
    # Officer roles. A name can appear in more than one archetype's roster
    # (e.g. Lieutenant is used by both Roadlord and Fixer) - the role string
    # is shared, the primary stat is looked up via ROSTER's (role, stat) pair.
    STEWARD = "steward"
    MARSHAL = "marshal"
    BAILIFF = "bailiff"
    LIEUTENANT = "lieutenant"
    OUTRIDER = "outrider"
    BAGMAN = "bag-man"
    SERGEANT = "sergeant"
    QUARTERMASTER = "quartermaster"
    SCOUT = "scout"
    CHOSEN = "chosen"
    DOOMSAYER = "doomsayer"
    INQUISITOR = "inquisitor"
    APPRENTICE = "apprentice"
    SALVAGER = "salvager"
    JUNKER = "junker"
    ACOLYTE = "acolyte"
    SLEEPER = "sleeper"
    LISTENER = "listener"
    SMUGGLER = "smuggler"
    CAPTAIN = "captain"
    BARTENDER = "bartender"
    BOUNCER = "bouncer"
    MADAM = "madam"


LEADER_ROLES = frozenset({
    CharacterRole.BOSS, CharacterRole.ROADLORD, CharacterRole.WARHOUND,
    CharacterRole.PROPHET, CharacterRole.TINKER, CharacterRole.WHISPER,
    CharacterRole.FIXER, CharacterRole.HOSTKEEPER,
})


# Stat schema per ArchetypeClass. Every Character on a faction of that class
# tracks exactly these five stats. Cunning is shared by all classes.
STAT_SCHEMA: dict[ArchetypeClass, tuple[str, ...]] = {
    ArchetypeClass.TERRITORIAL: ("authority", "industry", "vigilance", "standing", "cunning"),
    ArchetypeClass.MOBILE:      ("notoriety", "cohesion", "mobility", "standing", "cunning"),
    ArchetypeClass.EMBEDDED:    ("influence", "network", "discretion", "conviction", "cunning"),
}


# Per-archetype leader role + flagship stat. Leaders roll high in their flagship.
LEADER_ROLE: dict[Archetype, CharacterRole] = {
    Archetype.BOSS:       CharacterRole.BOSS,
    Archetype.ROADLORD:   CharacterRole.ROADLORD,
    Archetype.WARHOUND:   CharacterRole.WARHOUND,
    Archetype.PROPHET:    CharacterRole.PROPHET,
    Archetype.TINKER:     CharacterRole.TINKER,
    Archetype.WHISPER:    CharacterRole.WHISPER,
    Archetype.FIXER:      CharacterRole.FIXER,
    Archetype.HOSTKEEPER: CharacterRole.HOSTKEEPER,
}

LEADER_PRIMARY_STAT: dict[Archetype, str] = {
    Archetype.BOSS:       "authority",
    Archetype.ROADLORD:   "notoriety",
    Archetype.WARHOUND:   "cohesion",
    Archetype.PROPHET:    "conviction",
    Archetype.TINKER:     "network",
    Archetype.WHISPER:    "influence",
    Archetype.FIXER:      "network",
    Archetype.HOSTKEEPER: "influence",
}


# Officer roster per archetype: ordered tuple of (role, primary_stat).
# The order is canonical - tests and procgen rely on it.
ROSTER: dict[Archetype, tuple[tuple[CharacterRole, str], ...]] = {
    Archetype.BOSS: (
        (CharacterRole.STEWARD, "industry"),
        (CharacterRole.MARSHAL, "vigilance"),
        (CharacterRole.BAILIFF, "authority"),
    ),
    Archetype.ROADLORD: (
        (CharacterRole.LIEUTENANT, "cohesion"),
        (CharacterRole.OUTRIDER,   "mobility"),
        (CharacterRole.BAGMAN,     "standing"),
    ),
    Archetype.WARHOUND: (
        (CharacterRole.SERGEANT,      "cohesion"),
        (CharacterRole.QUARTERMASTER, "standing"),
        (CharacterRole.SCOUT,         "mobility"),
    ),
    Archetype.PROPHET: (
        (CharacterRole.CHOSEN,     "conviction"),
        (CharacterRole.DOOMSAYER,  "influence"),
        (CharacterRole.INQUISITOR, "discretion"),
    ),
    Archetype.TINKER: (
        (CharacterRole.APPRENTICE, "network"),
        (CharacterRole.SALVAGER,   "cunning"),
        (CharacterRole.JUNKER,     "network"),
    ),
    Archetype.WHISPER: (
        (CharacterRole.ACOLYTE,  "influence"),
        (CharacterRole.SLEEPER,  "discretion"),
        (CharacterRole.LISTENER, "network"),
    ),
    Archetype.FIXER: (
        (CharacterRole.LIEUTENANT, "network"),
        (CharacterRole.SMUGGLER,   "discretion"),
        # Captain holds the cross-hold network together; for an Embedded faction
        # that long-haul commitment is Conviction (not Standing - Embedded
        # factions don't track Standing).
        (CharacterRole.CAPTAIN,    "conviction"),
    ),
    Archetype.HOSTKEEPER: (
        (CharacterRole.BARTENDER, "influence"),
        (CharacterRole.BOUNCER,   "discretion"),
        (CharacterRole.MADAM,     "network"),
    ),
}


# 3-letter abbreviations used in the sidebar to keep the stat line compact.
STAT_ABBREV: dict[str, str] = {
    "authority":  "Aut",
    "industry":   "Ind",
    "vigilance":  "Vig",
    "standing":   "Std",
    "cunning":    "Cun",
    "notoriety":  "Not",
    "cohesion":   "Coh",
    "mobility":   "Mob",
    "influence":  "Inf",
    "network":    "Net",
    "discretion": "Dis",
    "conviction": "Con",
}


@dataclass
class Character:
    name: str
    role: CharacterRole
    stats: dict[str, int] = field(default_factory=dict)
    age: int = 30                                       # in seasons since adulthood
    alive: bool = True
    pending_xp: dict[str, int] = field(default_factory=dict)  # applied at upkeep

    @property
    def is_leader(self) -> bool:
        return self.role in LEADER_ROLES


def _roll_stat_block(
    rng: random.Random,
    schema: tuple[str, ...],
    primary: str,
    is_leader: bool,
) -> dict[str, int]:
    """Roll a 0-100 stat block.

    Leaders skew higher in their flagship stat than officers do in theirs - a
    Boss's Authority should out-weight any officer's primary. Triangular
    distribution clipped to [10, 95] keeps things textured but bounded.
    """
    out: dict[str, int] = {}
    for stat in schema:
        if stat == primary:
            mean = 75 if is_leader else 62
            spread = 10
        else:
            mean = 52 if is_leader else 45
            spread = 14
        v = int(rng.triangular(mean - spread, mean + spread, mean))
        out[stat] = max(10, min(95, v))
    return out


def roll_character(
    rng: random.Random,
    archetype: Archetype,
    role: CharacterRole,
    name: str,
) -> Character:
    """Construct a Character of `role` belonging to a faction of `archetype`."""
    cls = ARCHETYPE_CLASS[archetype]
    schema = STAT_SCHEMA[cls]
    if role in LEADER_ROLES:
        primary = LEADER_PRIMARY_STAT[archetype]
        is_leader = True
    else:
        primary = next(
            (p for r, p in ROSTER[archetype] if r is role),
            "cunning",  # defensive fallback if a caller hands us a stray role
        )
        is_leader = False
    return Character(
        name=name,
        role=role,
        stats=_roll_stat_block(rng, schema, primary, is_leader),
        age=rng.randint(22, 58),
    )
