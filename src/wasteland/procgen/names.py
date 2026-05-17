"""Procedural names: holds, leaders, gangs, cults.

Wordlist-based combinators. Everything takes an explicit Random so determinism
is testable.

Tone notes:
- Hold names sound like ruined places: harsh, monosyllabic, rust-colored.
- Leader names are terse, mononymic, often with a tacked-on title or number.
- Gang names follow "The <adj> <noun>s" - the gang knows what it is.
- Cult names are theophoric and ominous: "Children of the Hollow Sun".
"""

from __future__ import annotations

import random

# --- Hold names ---------------------------------------------------------------

HOLD_PREFIXES = (
    "Rust", "Salt", "Ash", "Bone", "Iron", "Slag", "Tar", "Glass", "Crow",
    "Dust", "Hollow", "Old", "Black", "Red", "Dry", "Cold", "Broke", "Last",
    "Lost", "Grim", "Sour", "Pale", "Hush", "Long",
)
HOLD_SUFFIXES = (
    "gable", "holm", "fall", "yard", "gate", "reach", "haven", "mire", "fork",
    "barrow", "ditch", "stead", "cross", "hill", "rest", "kiln", "mark", "well",
    "scar", "wall", "kettle", "row",
)
HOLD_SINGLE = (
    "Cinder", "Reckoning", "Slough", "Veil", "Carrion", "Echo", "Tatter",
    "Smolder", "Furnace", "Threnody", "Drift", "Ruin",
)


def hold_name(rng: random.Random) -> str:
    if rng.random() < 0.20:
        return rng.choice(HOLD_SINGLE)
    return f"{rng.choice(HOLD_PREFIXES)}-{rng.choice(HOLD_SUFFIXES)}"


# --- Leader names -------------------------------------------------------------
# A tiny phonotactic generator: consonant cluster + vowel core + tail. Then a
# small chance of a title or a numeric suffix. Avoids real-name lists - we want
# the names to feel found in the wasteland, not borrowed from a baby book.

_ONSETS = (
    "", "K", "Kr", "Tr", "Vr", "Br", "Dr", "Gr", "Sk", "Sh", "Th", "Z", "V",
    "M", "Sn", "Pl", "Bl", "Cl", "F", "Fr", "St", "Str", "T", "N", "R",
)
_NUCLEI = ("a", "e", "i", "o", "u", "ai", "au", "ee", "ei", "y", "ar", "or", "ur")
_CODAS = (
    "", "n", "k", "sh", "th", "x", "n", "r", "rk", "st", "lt", "n", "rn",
    "ss", "z", "nd", "sk",
)
_TITLES = (
    "Mama", "Papa", "Old", "Boss", "Captain", "Doc", "Father", "Mother",
    "Sister", "Brother", "Saint",
)
_EPITHETS = (
    "the Knife", "the Hollow", "the Quiet", "the Burnt", "the Twice-Dead",
    "Half-Hand", "One-Eye", "of the Pit", "of the Long Road", "the Whisper",
    "the Pale", "the Cold", "Hard-Voice", "Iron-Lung",
)


def _stem(rng: random.Random) -> str:
    s = rng.choice(_ONSETS) + rng.choice(_NUCLEI) + rng.choice(_CODAS)
    # Most names are 1 syllable; ~25% get a second.
    if rng.random() < 0.25:
        s += rng.choice(_NUCLEI) + rng.choice(_CODAS)
    return s.capitalize()


def leader_name(rng: random.Random) -> str:
    roll = rng.random()
    stem = _stem(rng)
    if roll < 0.10:
        # Numbered: "Vex-9"
        return f"{stem}-{rng.randint(1, 99)}"
    if roll < 0.30:
        # Title + stem: "Mama Sallow"
        return f"{rng.choice(_TITLES)} {stem}"
    if roll < 0.45:
        # Stem + epithet: "Krin the Knife"
        return f"{stem} {rng.choice(_EPITHETS)}"
    return stem


# --- Gang names ---------------------------------------------------------------

GANG_ADJECTIVES = (
    "Iron", "Red", "Black", "Burnt", "Pale", "Wild", "Cracked", "Hungry",
    "Glass", "Howling", "Silent", "Last", "Cold", "Rusted", "Crooked",
)
GANG_NOUNS = (
    "Coyote", "Wolf", "Vulture", "Hound", "Crow", "Snake", "Cinder", "Spike",
    "Wheel", "Ghost", "Saint", "Knife", "Lash", "Boar", "Jackal",
)


_IRREGULAR_PLURALS = {
    "Wolf": "Wolves",
    "Knife": "Knives",
}


def _pluralize(noun: str) -> str:
    if noun in _IRREGULAR_PLURALS:
        return _IRREGULAR_PLURALS[noun]
    return noun + "s"


def gang_name(rng: random.Random) -> str:
    return f"The {rng.choice(GANG_ADJECTIVES)} {_pluralize(rng.choice(GANG_NOUNS))}"


# --- Cult / embedded faction names --------------------------------------------

CULT_OPENERS = (
    "Children", "Daughters", "Sons", "Witnesses", "Apostles", "Keepers",
    "Hands", "Mouths", "Eyes",
)
CULT_OBJECTS = (
    "Hollow Sun", "Long Silence", "Wound", "Burning Wheel", "Last Garden",
    "Drowned Saint", "Patient Static", "Open Door", "Cinder Mother",
    "Rusted Crown", "Quiet Below", "Salt Tongue",
)


def cult_name(rng: random.Random) -> str:
    return f"{rng.choice(CULT_OPENERS)} of the {rng.choice(CULT_OBJECTS)}"


# --- Generic "outfit" name for non-cult embedded factions ---------------------
# Tinkers, Fixers, Hostkeepers, Whispers don't run cults - they run shops,
# back-rooms, salons, networks. Give them named outfits.

OUTFIT_PATTERNS = (
    "{leader}'s {place}",
    "The {adj} {place}",
    "{place} on {road}",
)
OUTFIT_PLACES = (
    "Workshop", "Backroom", "Stillhouse", "Stall", "Parlor", "Halfway-House",
    "Slaughterhouse", "Switchboard", "Cellar", "Lockup",
)
OUTFIT_ROADS = (
    "Ninth Street", "the Long Road", "Gallows Hill", "Smoke Lane",
    "the Drowned Mile", "Saltback Road",
)
OUTFIT_ADJ = GANG_ADJECTIVES  # reuse the wasteland-adjective list


def outfit_name(rng: random.Random, leader_first_name: str | None = None) -> str:
    pattern = rng.choice(OUTFIT_PATTERNS)
    if "{leader}" in pattern and not leader_first_name:
        # Fall back to a non-leader pattern if no leader is supplied.
        pattern = rng.choice(("The {adj} {place}", "{place} on {road}"))
    return pattern.format(
        leader=(leader_first_name or "").split()[0] if leader_first_name else "",
        adj=rng.choice(OUTFIT_ADJ),
        place=rng.choice(OUTFIT_PLACES),
        road=rng.choice(OUTFIT_ROADS),
    )
