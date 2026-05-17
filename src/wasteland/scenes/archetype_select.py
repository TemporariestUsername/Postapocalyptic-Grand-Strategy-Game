"""Archetype select: list all 8 archetypes, grouped by class.

This scene exists specifically to make the "every faction type is playable"
constraint visible at the UI layer before any gameplay exists. Clicking any
archetype shows a placeholder panel and bounces back to the title screen.
"""

from __future__ import annotations

from dataclasses import dataclass

import pygame

from .. import config
from ..core.faction import (
    ARCHETYPE_CLASS,
    ARCHETYPE_PITCH,
    Archetype,
    ArchetypeClass,
)
from ..ui.text import draw_text, font
from .base import Scene


@dataclass
class _Row:
    archetype: Archetype
    rect: pygame.Rect
    hovered: bool = False


_CLASS_ORDER = (ArchetypeClass.TERRITORIAL, ArchetypeClass.MOBILE, ArchetypeClass.EMBEDDED)
_CLASS_TITLE = {
    ArchetypeClass.TERRITORIAL: "Territorial - you hold ground.",
    ArchetypeClass.MOBILE: "Mobile - you have no home, only a road.",
    ArchetypeClass.EMBEDDED: "Embedded - you live inside someone else's hold.",
}


class ArchetypeSelectScene(Scene):
    def __init__(self, seed: int) -> None:
        super().__init__()
        self.seed = seed
        self.selected: Archetype | None = None
        self.rows: list[_Row] = []
        self._layout()

    def _layout(self) -> None:
        # Group archetypes by class, ordered Territorial -> Mobile -> Embedded.
        # Each row: pill on the left with archetype name, pitch text to the right.
        # We compute y positions deterministically so the screen reads top-to-bottom.
        grouped: dict[ArchetypeClass, list[Archetype]] = {c: [] for c in _CLASS_ORDER}
        for a in Archetype:
            grouped[ARCHETYPE_CLASS[a]].append(a)

        y = 110
        row_h = 44
        row_w = 880
        x = (config.WINDOW_WIDTH - row_w) // 2
        for cls in _CLASS_ORDER:
            y += 40  # section header space
            for a in grouped[cls]:
                self.rows.append(_Row(a, pygame.Rect(x, y, row_w, row_h)))
                y += row_h + 6

    def handle_event(self, event: pygame.event.Event) -> None:
        if self.selected is not None:
            # In the "selected" sub-state, any click or key returns to the title.
            if event.type in (pygame.MOUSEBUTTONDOWN, pygame.KEYDOWN):
                from .title import TitleScene
                self.next_scene = TitleScene(self.seed)
            return

        if event.type == pygame.MOUSEMOTION:
            for row in self.rows:
                row.hovered = row.rect.collidepoint(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            for row in self.rows:
                if row.rect.collidepoint(event.pos):
                    self.selected = row.archetype
                    return
        elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            from .title import TitleScene
            self.next_scene = TitleScene(self.seed)

    def update(self, dt_ms: int) -> None:
        pass

    def draw(self, surface: pygame.Surface) -> None:
        surface.fill(config.COLOR_BG)
        cx = config.WINDOW_WIDTH // 2

        draw_text(surface, "Choose your kind of power",
                  (cx, 50), size=config.FONT_SIZE_HEADING, color=config.COLOR_BONE, center=True)
        draw_text(surface, "Every archetype is playable. They do not play the same game.",
                  (cx, 82), size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM, center=True)

        # Draw section headers ABOVE each group's first row.
        # We re-walk class order to keep the headers stable across re-renders.
        current_class: ArchetypeClass | None = None
        for row in self.rows:
            cls = ARCHETYPE_CLASS[row.archetype]
            if cls is not current_class:
                draw_text(
                    surface,
                    _CLASS_TITLE[cls],
                    (row.rect.left, row.rect.top - 26),
                    size=config.FONT_SIZE_BODY,
                    color=config.COLOR_ACCENT,
                )
                current_class = cls
            self._draw_row(surface, row)

        if self.selected is not None:
            self._draw_placeholder_panel(surface)

    def _draw_row(self, surface: pygame.Surface, row: _Row) -> None:
        bg = config.COLOR_BUTTON_HOVER if row.hovered else config.COLOR_BUTTON
        pygame.draw.rect(surface, bg, row.rect, border_radius=2)
        pygame.draw.rect(surface, config.COLOR_BUTTON_BORDER, row.rect, width=1, border_radius=2)

        name = row.archetype.value.upper()
        name_surf = font(config.FONT_SIZE_BODY).render(name, True, config.COLOR_BONE)
        surface.blit(name_surf, name_surf.get_rect(midleft=(row.rect.left + 16, row.rect.centery)))

        pitch = ARCHETYPE_PITCH[row.archetype]
        pitch_surf = font(config.FONT_SIZE_SMALL).render(pitch, True, config.COLOR_DIM)
        surface.blit(pitch_surf, pitch_surf.get_rect(midleft=(row.rect.left + 180, row.rect.centery)))

    def _draw_placeholder_panel(self, surface: pygame.Surface) -> None:
        w, h = 640, 220
        rect = pygame.Rect(
            (config.WINDOW_WIDTH - w) // 2,
            (config.WINDOW_HEIGHT - h) // 2,
            w, h,
        )
        pygame.draw.rect(surface, config.COLOR_BG_PANEL, rect, border_radius=4)
        pygame.draw.rect(surface, config.COLOR_ACCENT, rect, width=2, border_radius=4)
        assert self.selected is not None
        cx = rect.centerx
        draw_text(surface, self.selected.value.upper(),
                  (cx, rect.top + 36),
                  size=config.FONT_SIZE_HEADING, color=config.COLOR_BONE, center=True)
        draw_text(surface, ARCHETYPE_PITCH[self.selected],
                  (cx, rect.top + 80),
                  size=config.FONT_SIZE_BODY, color=config.COLOR_FG, center=True)
        draw_text(surface, "Not implemented yet. See docs/ROADMAP.md.",
                  (cx, rect.top + 130),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM, center=True)
        draw_text(surface, "[click or press any key to return]",
                  (cx, rect.bottom - 28),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM, center=True)
