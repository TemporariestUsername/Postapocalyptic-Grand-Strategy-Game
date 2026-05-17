"""World-view scene: render the generated hex map and the factions on it.

Layout:
    +-------------------------------------------+--------------------+
    | hex map (left ~720px)                     | sidebar (~300px)   |
    |                                           | seed + turn        |
    |                                           | player block       |
    |                                           | selected hex info  |
    |                                           | embedded list      |
    |                                           | threats            |
    +-------------------------------------------+--------------------+

Phase 2 is render + select-hex. No turn advancement, no actions, no AI.
Pressing Esc returns to the title screen.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import pygame

from .. import config
from ..core.faction import (
    ARCHETYPE_CLASS,
    Archetype,
    ArchetypeClass,
    Faction,
)
from ..core.hex import Hex, SQRT3, corners, to_pixel
from ..core.world import World
from ..procgen.map_gen import (
    HexMap,
    TERRAIN_DEEP_WILDS,
    TERRAIN_FERTILE,
    TERRAIN_IRRADIATED,
    TERRAIN_RUINS,
    TERRAIN_WASTES,
)
from ..ui.text import draw_text, font
from .base import Scene


# Bleak palette, terrain -> fill color.
_TERRAIN_COLOR = {
    TERRAIN_WASTES:      (90, 78, 64),
    TERRAIN_RUINS:       (74, 70, 64),
    TERRAIN_FERTILE:     (98, 110, 70),
    TERRAIN_IRRADIATED:  (130, 86, 86),
    TERRAIN_DEEP_WILDS:  (54, 50, 44),
}

_HEX_SIZE = 22
_SIDEBAR_W = 300
_MAP_AREA_W = config.WINDOW_WIDTH - _SIDEBAR_W
_MAP_AREA_H = config.WINDOW_HEIGHT


def _archetype_glyph(a: Archetype) -> str:
    return {
        Archetype.BOSS: "B",
        Archetype.ROADLORD: "R",
        Archetype.WARHOUND: "W",
        Archetype.PROPHET: "p",
        Archetype.TINKER: "t",
        Archetype.WHISPER: "w",
        Archetype.FIXER: "f",
        Archetype.HOSTKEEPER: "h",
    }[a]


def _archetype_color(a: Archetype) -> tuple[int, int, int]:
    if ARCHETYPE_CLASS[a] is ArchetypeClass.TERRITORIAL:
        return config.COLOR_BONE
    if ARCHETYPE_CLASS[a] is ArchetypeClass.MOBILE:
        return config.COLOR_ACCENT
    return (170, 200, 230)  # cool blue for embedded


@dataclass
class _Camera:
    """Pre-computed map-to-screen offset to center the hex map in the map area."""
    origin_x: float
    origin_y: float


def _compute_camera(hex_map: HexMap) -> _Camera:
    """Center the map's bounding box inside the map area."""
    if not hex_map.tiles:
        return _Camera(_MAP_AREA_W / 2, _MAP_AREA_H / 2)
    # Compute the pixel-space bounding box of all tile centers.
    xs, ys = [], []
    for tile in hex_map.tiles.values():
        x, y = to_pixel(tile.hex, _HEX_SIZE, (0, 0))
        xs.append(x)
        ys.append(y)
    pad = _HEX_SIZE + 4
    min_x, max_x = min(xs) - pad, max(xs) + pad
    min_y, max_y = min(ys) - pad, max(ys) + pad
    map_w = max_x - min_x
    map_h = max_y - min_y
    # Offset so that the bounding box is centered in the map area.
    origin_x = (_MAP_AREA_W - map_w) / 2 - min_x
    origin_y = (_MAP_AREA_H - map_h) / 2 - min_y
    return _Camera(origin_x, origin_y)


def _pixel_to_hex(px: float, py: float, origin: tuple[float, float], size: float) -> Hex:
    """Invert pointy-top axial transform; round to nearest hex."""
    ox, oy = origin
    x = (px - ox) / size
    y = (py - oy) / size
    # Fractional axial
    q = (SQRT3 / 3 * x - 1 / 3 * y)
    r = (2 / 3 * y)
    # Convert to cube and round.
    cx, cz = q, r
    cy = -cx - cz
    rx, ry, rz = round(cx), round(cy), round(cz)
    dx, dy, dz = abs(rx - cx), abs(ry - cy), abs(rz - cz)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return Hex(int(rx), int(rz))


class WorldViewScene(Scene):
    def __init__(self, world: World) -> None:
        super().__init__()
        self.world = world
        self.camera = _compute_camera(world.hex_map)
        self.selected: Hex | None = None
        # Map each hex with a faction to that faction's index for fast lookup.
        self.factions_at_hex: dict[tuple[int, int], list[int]] = {}
        self.factions_in_hold: dict[str, list[int]] = {}
        for idx, f in enumerate(world.factions):
            if f.location_hex is not None:
                self.factions_at_hex.setdefault((f.location_hex.q, f.location_hex.r), []).append(idx)
            for host in f.host_holds:
                self.factions_in_hold.setdefault(host, []).append(idx)

    # ------------------------------------------------------------------ events

    def handle_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            from .title import TitleScene
            self.next_scene = TitleScene(self.world.seed)
            return
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            mx, my = event.pos
            if mx < _MAP_AREA_W:
                h = _pixel_to_hex(mx, my, (self.camera.origin_x, self.camera.origin_y), _HEX_SIZE)
                if self.world.hex_map.in_bounds(h):
                    self.selected = h
                else:
                    self.selected = None

    # ------------------------------------------------------------------ update

    def update(self, dt_ms: int) -> None:
        pass

    # ------------------------------------------------------------------ draw

    def draw(self, surface: pygame.Surface) -> None:
        surface.fill(config.COLOR_BG)
        self._draw_map(surface)
        self._draw_sidebar(surface)

    def _draw_map(self, surface: pygame.Surface) -> None:
        origin = (self.camera.origin_x, self.camera.origin_y)
        # 1. Fill terrain hexes.
        for (q, r), tile in self.world.hex_map.tiles.items():
            center = to_pixel(Hex(q, r), _HEX_SIZE, origin)
            pts = corners(center, _HEX_SIZE)
            fill = _TERRAIN_COLOR[tile.terrain]
            pygame.draw.polygon(surface, fill, pts)
            pygame.draw.polygon(surface, (24, 22, 20), pts, 1)

        # 2. Overlay roads as a polyline. Drawn between hex centers.
        for road in self.world.hex_map.roads:
            if len(road) < 2:
                continue
            centers = [to_pixel(h, _HEX_SIZE, origin) for h in road]
            pygame.draw.lines(
                surface,
                (160, 140, 110),
                False,
                [(int(x), int(y)) for x, y in centers],
                3,
            )

        # 3. Selected-hex highlight (drawn under faction markers).
        if self.selected is not None and self.world.hex_map.in_bounds(self.selected):
            center = to_pixel(self.selected, _HEX_SIZE, origin)
            pts = corners(center, _HEX_SIZE + 2)
            pygame.draw.polygon(surface, config.COLOR_ACCENT, pts, 3)

        # 4. Faction markers - one per hex. Embedded factions don't appear on
        #    the map (they live inside holds); they show in the sidebar when
        #    the host hex is selected.
        for (q, r), indices in self.factions_at_hex.items():
            # Pick the most-significant occupant for the glyph: player > Boss > Mobile.
            sorted_idx = sorted(
                indices,
                key=lambda i: (
                    0 if self.world.factions[i].is_player else 1,
                    0 if self.world.factions[i].archetype is Archetype.BOSS else 1,
                ),
            )
            f = self.world.factions[sorted_idx[0]]
            center = to_pixel(Hex(q, r), _HEX_SIZE, origin)
            color = _archetype_color(f.archetype)
            if f.is_player:
                # Player gets a heavier ring.
                pygame.draw.circle(surface, config.COLOR_ACCENT, (int(center[0]), int(center[1])), 13, 2)
            # Inner filled disc, then glyph letter.
            pygame.draw.circle(surface, (20, 18, 16), (int(center[0]), int(center[1])), 10)
            pygame.draw.circle(surface, color, (int(center[0]), int(center[1])), 10, 2)
            glyph = _archetype_glyph(f.archetype)
            glyph_surf = font(config.FONT_SIZE_SMALL).render(glyph, True, color)
            glyph_rect = glyph_surf.get_rect(center=(int(center[0]), int(center[1])))
            surface.blit(glyph_surf, glyph_rect)

            # If this hex hosts a Boss, draw the hold name beneath the marker.
            if f.archetype is Archetype.BOSS:
                name_surf = font(config.FONT_SIZE_SMALL).render(
                    f.name, True, config.COLOR_BONE
                )
                name_rect = name_surf.get_rect(center=(int(center[0]), int(center[1]) + 22))
                # subtle dark background for readability
                bg_rect = name_rect.inflate(6, 2)
                bg = pygame.Surface(bg_rect.size, pygame.SRCALPHA)
                bg.fill((10, 9, 8, 180))
                surface.blit(bg, bg_rect)
                surface.blit(name_surf, name_rect)

    # ----------------------------------------------------------------- sidebar

    def _draw_sidebar(self, surface: pygame.Surface) -> None:
        # Background panel.
        rect = pygame.Rect(_MAP_AREA_W, 0, _SIDEBAR_W, _MAP_AREA_H)
        pygame.draw.rect(surface, config.COLOR_BG_PANEL, rect)
        pygame.draw.line(surface, config.COLOR_BUTTON_BORDER,
                         (rect.left, 0), (rect.left, rect.height), 1)

        x = rect.left + 16
        y = 16

        # --- header
        draw_text(surface, config.TITLE, (x, y),
                  size=config.FONT_SIZE_HEADING, color=config.COLOR_BONE)
        y += 36
        draw_text(surface, f"seed {self.world.seed}", (x, y),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
        y += 18
        draw_text(surface, f"turn {self.world.turn}    maelstrom {self.world.maelstrom}/100",
                  (x, y), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
        y += 24

        # --- player block
        player = self.world.player
        if player is not None:
            y = self._draw_faction_block(surface, x, y, player, header="YOU")
            y += 6

        # --- selected hex
        if self.selected is not None:
            tile = self.world.hex_map.get(self.selected)
            if tile is not None:
                y = self._draw_hex_block(surface, x, y, tile)

        # --- footer
        footer_y = rect.height - 26
        draw_text(surface, "Esc: back to title",
                  (x, footer_y), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)

    def _draw_faction_block(
        self, surface: pygame.Surface, x: int, y: int, f: Faction, header: str
    ) -> int:
        draw_text(surface, header, (x, y),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_ACCENT)
        y += 18
        draw_text(surface, f.name, (x, y),
                  size=config.FONT_SIZE_BODY, color=config.COLOR_BONE)
        y += 22
        draw_text(surface, f"{f.archetype.value}   led by {f.leader_name}",
                  (x, y), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
        y += 18
        s = f.stats
        stats_line = (f"G{s.grit:+d}  M{s.menace:+d}  C{s.charm:+d}  "
                      f"I{s.insight:+d}  W{s.weird:+d}")
        draw_text(surface, stats_line, (x, y),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_FG)
        y += 18
        # Show one or two relevant resources only; the full bag is overwhelming.
        bag = f.resources
        key_resources = self._key_resources_for(f)
        line = "   ".join(f"{k}: {bag.get(k, 0)}" for k in key_resources)
        draw_text(surface, line, (x, y), size=config.FONT_SIZE_SMALL, color=config.COLOR_FG)
        y += 22
        return y

    def _key_resources_for(self, f: Faction) -> list[str]:
        cls = ARCHETYPE_CLASS[f.archetype]
        if cls is ArchetypeClass.TERRITORIAL:
            return ["stock", "people", "walls", "barter"]
        if cls is ArchetypeClass.MOBILE:
            return ["gas", "riders", "ammo", "barter"]
        return ["followers", "secrets", "cover", "barter"]

    def _draw_hex_block(self, surface: pygame.Surface, x: int, y: int, tile) -> int:
        draw_text(surface, f"HEX ({tile.q},{tile.r})", (x, y),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_ACCENT)
        y += 18
        draw_text(surface, f"{tile.terrain}, {tile.scarcity}",
                  (x, y), size=config.FONT_SIZE_BODY, color=config.COLOR_BONE)
        y += 22
        if tile.maelstrom_bias:
            draw_text(surface, f"maelstrom bias +{tile.maelstrom_bias}/turn",
                      (x, y), size=config.FONT_SIZE_SMALL, color=(180, 130, 130))
            y += 18

        # Factions located here.
        occupants = self.factions_at_hex.get((tile.q, tile.r), [])
        if occupants:
            draw_text(surface, "Faction here:", (x, y),
                      size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
            y += 18
            for idx in occupants:
                f = self.world.factions[idx]
                y = self._draw_faction_inline(surface, x, y, f)

        # Find the Boss at this hex (if any) to look up its hosted embeddeds.
        boss_idx = next(
            (i for i in occupants if self.world.factions[i].archetype is Archetype.BOSS),
            None,
        )
        if boss_idx is not None:
            boss = self.world.factions[boss_idx]
            embedded_indices = self.factions_in_hold.get(boss.name, [])
            visible = self._embedded_visible_to_player(boss, embedded_indices)
            if visible:
                draw_text(surface, "Inside the hold:", (x, y),
                          size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
                y += 18
                for idx in visible:
                    y = self._draw_faction_inline(surface, x, y, self.world.factions[idx])
            hidden_count = len(embedded_indices) - len(visible)
            if hidden_count > 0:
                draw_text(surface, f"  ({hidden_count} hidden)",
                          (x, y), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
                y += 18
        return y

    def _embedded_visible_to_player(self, host: Faction, indices: list[int]) -> list[int]:
        """Apply archetype-specific fog of war for embedded factions in a hold.

        Rules (Phase 2 lightweight version):
            - The player always sees themselves.
            - If the player is the Boss of this hold, embedded factions are
              hidden unless their Cover is exhausted (we don't model Heat yet,
              so 1 in 3 are revealed pseudo-randomly per generated faction).
            - If the player is an Embedded faction inside this same hold, they
              see other embeddeds in their host (cellmates know each other).
            - Otherwise, only Hostkeepers and Prophets (publicly-visible
              embeddeds) are shown.
        """
        player = self.world.player
        if player is None:
            return indices  # no fog rules with no player
        visible: list[int] = []
        for idx in indices:
            f = self.world.factions[idx]
            if f.is_player:
                visible.append(idx)
                continue
            if player is host:  # player IS the boss of this hold
                # Cover-driven visibility: deterministic per faction. Phase 3
                # replaces this with real Heat vs Cover.
                digest = hashlib.blake2b(
                    f"{self.world.seed}:{f.name}".encode("utf-8"),
                    digest_size=1,
                ).digest()[0]
                if digest % 3 == 0:
                    visible.append(idx)
                continue
            if player.archetype_class is ArchetypeClass.EMBEDDED and host.name in player.host_holds:
                visible.append(idx)
                continue
            if f.archetype in (Archetype.HOSTKEEPER, Archetype.PROPHET):
                visible.append(idx)
        return visible

    def _draw_faction_inline(self, surface: pygame.Surface, x: int, y: int, f: Faction) -> int:
        glyph = _archetype_glyph(f.archetype)
        color = _archetype_color(f.archetype)
        prefix_surf = font(config.FONT_SIZE_SMALL).render(f"  {glyph}  ", True, color)
        surface.blit(prefix_surf, (x, y))
        marker_w = prefix_surf.get_width()
        marker = " *" if f.is_player else "  "
        name_surf = font(config.FONT_SIZE_SMALL).render(
            f"{f.name}{marker}", True,
            config.COLOR_BONE if f.is_player else config.COLOR_FG,
        )
        surface.blit(name_surf, (x + marker_w, y))
        return y + 16
