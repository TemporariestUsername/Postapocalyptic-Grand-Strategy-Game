"""Font helpers. We use pygame's default font - art direction is for later."""

from __future__ import annotations

from functools import lru_cache

import pygame

from .. import config


@lru_cache(maxsize=16)
def font(size: int) -> pygame.font.Font:
    return pygame.font.Font(None, size)


def draw_text(
    surface: pygame.Surface,
    text: str,
    pos: tuple[int, int],
    size: int = config.FONT_SIZE_BODY,
    color: tuple[int, int, int] = config.COLOR_FG,
    center: bool = False,
) -> pygame.Rect:
    rendered = font(size).render(text, True, color)
    rect = rendered.get_rect()
    if center:
        rect.center = pos
    else:
        rect.topleft = pos
    surface.blit(rendered, rect)
    return rect
