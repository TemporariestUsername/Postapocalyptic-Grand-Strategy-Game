"""Title screen: name, subtitle, two buttons."""

from __future__ import annotations

from dataclasses import dataclass

import pygame

from .. import config
from ..ui.text import draw_text, font
from .base import Scene


@dataclass
class _Button:
    label: str
    rect: pygame.Rect
    hovered: bool = False


class TitleScene(Scene):
    def __init__(self, seed: int) -> None:
        super().__init__()
        self.seed = seed
        cx = config.WINDOW_WIDTH // 2
        button_w, button_h = 260, 56
        # Two buttons stacked. Spacing is generous - this is a title screen, not a HUD.
        self.new_game_btn = _Button(
            "New Game",
            pygame.Rect(cx - button_w // 2, 380, button_w, button_h),
        )
        self.quit_btn = _Button(
            "Quit",
            pygame.Rect(cx - button_w // 2, 460, button_w, button_h),
        )

    def handle_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.MOUSEMOTION:
            self.new_game_btn.hovered = self.new_game_btn.rect.collidepoint(event.pos)
            self.quit_btn.hovered = self.quit_btn.rect.collidepoint(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.new_game_btn.rect.collidepoint(event.pos):
                # Local import avoids a circular dependency at module load.
                from .archetype_select import ArchetypeSelectScene
                self.next_scene = ArchetypeSelectScene(self.seed)
            elif self.quit_btn.rect.collidepoint(event.pos):
                self.quit = True
        elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.quit = True

    def update(self, dt_ms: int) -> None:
        pass

    def draw(self, surface: pygame.Surface) -> None:
        surface.fill(config.COLOR_BG)

        cx = config.WINDOW_WIDTH // 2
        draw_text(surface, config.TITLE, (cx, 180),
                  size=config.FONT_SIZE_TITLE, color=config.COLOR_BONE, center=True)
        draw_text(surface, config.SUBTITLE, (cx, 240),
                  size=config.FONT_SIZE_SUBTITLE, color=config.COLOR_DIM, center=True)
        draw_text(surface, f"seed: {self.seed}", (cx, 280),
                  size=config.FONT_SIZE_SMALL, color=config.COLOR_DIM, center=True)

        for btn in (self.new_game_btn, self.quit_btn):
            self._draw_button(surface, btn)

        draw_text(
            surface,
            "Inspired by Apocalypse World (D. Vincent Baker). All names original.",
            (cx, config.WINDOW_HEIGHT - 30),
            size=config.FONT_SIZE_SMALL,
            color=config.COLOR_DIM,
            center=True,
        )

    def _draw_button(self, surface: pygame.Surface, btn: _Button) -> None:
        bg = config.COLOR_BUTTON_HOVER if btn.hovered else config.COLOR_BUTTON
        pygame.draw.rect(surface, bg, btn.rect, border_radius=2)
        pygame.draw.rect(surface, config.COLOR_BUTTON_BORDER, btn.rect, width=1, border_radius=2)
        text_surf = font(config.FONT_SIZE_HEADING).render(btn.label, True, config.COLOR_FG)
        text_rect = text_surf.get_rect(center=btn.rect.center)
        surface.blit(text_surf, text_rect)
