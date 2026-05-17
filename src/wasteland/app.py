"""Pygame app: init, main loop, scene dispatch."""

from __future__ import annotations

import pygame

from . import config
from .scenes.base import Scene
from .scenes.title import TitleScene


def run(seed: int) -> None:
    pygame.init()
    try:
        screen = pygame.display.set_mode((config.WINDOW_WIDTH, config.WINDOW_HEIGHT))
        pygame.display.set_caption(config.TITLE)
        clock = pygame.time.Clock()

        scene: Scene = TitleScene(seed)
        running = True
        while running:
            dt_ms = clock.tick(config.FPS)

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    break
                scene.handle_event(event)

            if scene.quit:
                running = False
                break

            if scene.next_scene is not None:
                scene = scene.next_scene
                continue

            scene.update(dt_ms)
            scene.draw(screen)
            pygame.display.flip()
    finally:
        pygame.quit()
