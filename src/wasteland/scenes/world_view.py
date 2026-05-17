"""World-view scene: render the generated hex map and the factions on it.

Layout:
    +-------------------------------------------+--------------------+
    | hex map (left ~720px)                     | sidebar (~300px)   |
    |                                           | seed + turn        |
    |                                           | player block       |
    |                                           | moves              |
    |                                           | selected hex info  |
    |                                           | event log          |
    +-------------------------------------------+--------------------+

Pressing Esc returns to the title screen.
"""

from __future__ import annotations

import hashlib
import random
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
from ..engine.moves import Move, available_moves
from ..engine.turn import end_turn
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


def _wrap(text: str, fnt: pygame.font.Font, max_px: int) -> list[str]:
    """Greedy word-wrap to fit max_px pixels per line."""
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        candidate = w if not cur else cur + " " + w
        if fnt.size(candidate)[0] <= max_px:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


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


@dataclass
class _MoveButton:
    move: Move
    rect: pygame.Rect
    enabled: bool
    veto_reason: str
    hovered: bool = False


@dataclass
class _ActionButton:
    """For non-Move sidebar actions like End Turn."""
    label: str
    rect: pygame.Rect
    hovered: bool = False


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

        # Resolution RNG. Persists across moves so a single click is repeatable
        # but the session as a whole feels live. Seeded off the world seed so
        # a fresh game on the same seed plays out the same if the same Moves
        # are chosen in the same order.
        self._rng = random.Random(world.seed ^ 0xA9CE)

        # Sidebar interactive elements, rebuilt each draw.
        self._move_buttons: list[_MoveButton] = []
        self._end_turn_btn: _ActionButton | None = None

    # ------------------------------------------------------------------ events

    def handle_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            from .title import TitleScene
            self.next_scene = TitleScene(self.world.seed)
            return
        if event.type == pygame.MOUSEMOTION:
            for btn in self._move_buttons:
                btn.hovered = btn.rect.collidepoint(event.pos)
            if self._end_turn_btn is not None:
                self._end_turn_btn.hovered = self._end_turn_btn.rect.collidepoint(event.pos)
            return
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            mx, my = event.pos
            if mx >= _MAP_AREA_W:
                self._handle_sidebar_click((mx, my))
                return
            h = _pixel_to_hex(mx, my, (self.camera.origin_x, self.camera.origin_y), _HEX_SIZE)
            if self.world.hex_map.in_bounds(h):
                self.selected = h
            else:
                self.selected = None

    def _handle_sidebar_click(self, pos: tuple[int, int]) -> None:
        for btn in self._move_buttons:
            if btn.rect.collidepoint(pos):
                if btn.enabled:
                    self._perform_move(btn.move)
                return
        if self._end_turn_btn is not None and self._end_turn_btn.rect.collidepoint(pos):
            self._perform_end_turn()

    # --------------------------------------------------------- resolution

    def _perform_move(self, move: Move) -> None:
        player = self.world.player
        if player is None:
            return
        if self.world.actions_left < move.action_cost:
            return
        allowed, _ = move.can_attempt(self.world, player)
        if not allowed:
            return
        self.world.actions_left -= move.action_cost
        result = move.resolve(self.world, player, self._rng)
        self.world.event_log.extend(result.entries)

    def _perform_end_turn(self) -> None:
        from ..engine.turn import end_turn as _end_turn
        entries = _end_turn(self.world, self._rng)
        self.world.event_log.extend(entries)

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
        y = 12

        # --- header
        draw_text(surface, config.TITLE, (x, y),
                  size=config.FONT_SIZE_HEADING, color=config.COLOR_BONE)
        y += 32
        draw_text(surface, f"seed {self.world.seed}", (x, y),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
        y += 16
        draw_text(surface, f"turn {self.world.turn}    maelstrom {self.world.maelstrom}/100",
                  (x, y), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)
        y += 20

        # --- player block
        player = self.world.player
        if player is not None:
            y = self._draw_faction_block(surface, x, y, player, header="YOU")
            y += 4

        # --- moves panel
        if player is not None:
            y = self._draw_moves_panel(surface, x, y, player)

        # --- selected hex (compact when there's not much vertical space left)
        log_height_reserved = 130
        end_turn_height = 50
        max_y_for_hex = rect.height - log_height_reserved - end_turn_height
        if self.selected is not None and y < max_y_for_hex - 60:
            tile = self.world.hex_map.get(self.selected)
            if tile is not None:
                self._draw_hex_block(surface, x, y, tile)

        # --- event log (anchored to the bottom-of-log area)
        log_top = rect.height - log_height_reserved - end_turn_height
        self._draw_event_log(surface, x, log_top, log_height_reserved)

        # --- End Turn button + Esc footer
        self._draw_end_turn(surface, rect, end_turn_height)

    def _draw_moves_panel(self, surface: pygame.Surface, x: int, y: int, player: Faction) -> int:
        budget_color = config.COLOR_ACCENT if self.world.actions_left > 0 else config.COLOR_DIM
        draw_text(surface, f"ACTIONS  {self.world.actions_left}",
                  (x, y), size=config.FONT_SIZE_SMALL, color=budget_color)
        y += 18
        deck = player.fortune
        comp = deck.composition()
        draw_text(
            surface,
            f"deck: {comp['strong']}S {comp['mixed']}M {comp['bitter']}B  "
            f"({deck.remaining} left)",
            (x, y), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM,
        )
        y += 18

        # Move buttons. Rebuilt every frame so enable/disable reflects current state.
        self._move_buttons = []
        button_w = _SIDEBAR_W - 32
        button_h = 30
        for move in available_moves(player):
            allowed, reason = move.can_attempt(self.world, player)
            enabled = (
                allowed
                and self.world.actions_left >= move.action_cost
            )
            if not allowed:
                veto = reason
            elif self.world.actions_left < move.action_cost:
                veto = "no actions left"
            else:
                veto = ""
            rect = pygame.Rect(x, y, button_w, button_h)
            btn = _MoveButton(move=move, rect=rect, enabled=enabled, veto_reason=veto)
            self._move_buttons.append(btn)
            self._draw_move_button(surface, btn)
            y += button_h + 4
        return y + 6

    def _draw_move_button(self, surface: pygame.Surface, btn: _MoveButton) -> None:
        if btn.enabled:
            bg = config.COLOR_BUTTON_HOVER if btn.hovered else config.COLOR_BUTTON
            border = config.COLOR_BUTTON_BORDER
            text_color = config.COLOR_FG
            sub_color = config.COLOR_DIM
        else:
            bg = (28, 26, 23)
            border = (60, 56, 50)
            text_color = config.COLOR_DIM
            sub_color = (90, 84, 76)
        pygame.draw.rect(surface, bg, btn.rect, border_radius=2)
        pygame.draw.rect(surface, border, btn.rect, width=1, border_radius=2)
        # Label
        label_surf = font(config.FONT_SIZE_BODY).render(btn.move.name, True, text_color)
        surface.blit(label_surf, label_surf.get_rect(midleft=(btn.rect.left + 8, btn.rect.centery - 6)))
        # Sub-line: stat + cost OR veto reason
        if btn.enabled:
            sub = f"{btn.move.stat}  ·  {btn.move.action_cost} action"
        else:
            sub = btn.veto_reason or "unavailable"
        sub_surf = font(config.FONT_SIZE_SMALL).render(sub, True, sub_color)
        surface.blit(sub_surf, sub_surf.get_rect(midleft=(btn.rect.left + 8, btn.rect.centery + 8)))

    def _draw_event_log(self, surface: pygame.Surface, x: int, top: int, height: int) -> None:
        draw_text(surface, "LOG", (x, top),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_ACCENT)
        line_h = 14
        max_lines = max(0, (height - 20) // line_h)
        entries = self.world.event_log[-max_lines:]
        ly = top + 18
        # Wrap each entry to the sidebar width.
        wrap_px = _SIDEBAR_W - 32
        small = font(config.FONT_SIZE_SMALL)
        for entry in entries:
            color = {
                "move": config.COLOR_BONE,
                "outcome": config.COLOR_FG,
                "snag": (200, 130, 120),
                "system": config.COLOR_DIM,
            }.get(entry.kind.value, config.COLOR_FG)
            for line in _wrap(entry.text, small, wrap_px):
                surface.blit(small.render(line, True, color), (x, ly))
                ly += line_h
                if ly > top + height - line_h:
                    return

    def _draw_end_turn(self, surface: pygame.Surface, rect: pygame.Rect, height: int) -> None:
        button_w = _SIDEBAR_W - 32
        button_h = 30
        bx = rect.left + 16
        by = rect.height - height
        button_rect = pygame.Rect(bx, by, button_w, button_h)
        self._end_turn_btn = _ActionButton(label="End Turn", rect=button_rect)
        bg = config.COLOR_BUTTON_HOVER if self._end_turn_btn.hovered else config.COLOR_BUTTON
        pygame.draw.rect(surface, bg, button_rect, border_radius=2)
        pygame.draw.rect(surface, config.COLOR_ACCENT, button_rect, width=1, border_radius=2)
        label_surf = font(config.FONT_SIZE_BODY).render("End Turn", True, config.COLOR_BONE)
        surface.blit(label_surf, label_surf.get_rect(center=button_rect.center))
        # Esc footer beneath.
        footer_y = button_rect.bottom + 4
        draw_text(surface, "Esc: back to title",
                  (bx, footer_y), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM)

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
