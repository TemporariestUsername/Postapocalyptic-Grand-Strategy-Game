"""Scene ABC. Subclasses implement handle_event/update/draw and may set
`next_scene` to ask the app to transition, or `quit` to ask it to shut down.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

import pygame


class Scene(ABC):
    def __init__(self) -> None:
        self.next_scene: Optional["Scene"] = None
        self.quit: bool = False

    @abstractmethod
    def handle_event(self, event: pygame.event.Event) -> None: ...

    @abstractmethod
    def update(self, dt_ms: int) -> None: ...

    @abstractmethod
    def draw(self, surface: pygame.Surface) -> None: ...
