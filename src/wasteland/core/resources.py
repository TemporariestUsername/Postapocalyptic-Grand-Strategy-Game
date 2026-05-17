"""Resource definitions.

Universal resources are tracked by every faction. Class-specific resources
are tracked only by factions of that archetype class - a Boss never thinks
about Gas; a Roadlord never thinks about Walls.
"""

from __future__ import annotations

from enum import Enum


class Resource(str, Enum):
    # Universal
    BARTER = "barter"      # generic currency
    JUICE = "juice"        # reputation/influence
    HEAT = "heat"          # how much the world is watching you

    # Territorial (Boss)
    STOCK = "stock"        # food/water
    PEOPLE = "people"      # population
    AMMO = "ammo"
    WALLS = "walls"        # fortification

    # Mobile (Roadlord, Warhound)
    GAS = "gas"
    RIDERS = "riders"      # gang members under arms

    # Embedded (Prophet, Tinker, Whisper, Fixer, Hostkeeper)
    FOLLOWERS = "followers"  # cult flock / customers / marks
    SECRETS = "secrets"      # leverage
    COVER = "cover"          # opposite of Heat at the embedded scale


UNIVERSAL_RESOURCES = (Resource.BARTER, Resource.JUICE, Resource.HEAT)
TERRITORIAL_RESOURCES = (Resource.STOCK, Resource.PEOPLE, Resource.AMMO, Resource.WALLS)
MOBILE_RESOURCES = (Resource.GAS, Resource.RIDERS, Resource.AMMO)
EMBEDDED_RESOURCES = (Resource.FOLLOWERS, Resource.SECRETS, Resource.COVER)
