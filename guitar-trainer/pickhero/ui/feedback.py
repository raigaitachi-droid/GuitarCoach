"""Visual feedback for note matching.

Manages color effects, streak counter, and accuracy stats overlay.
"""

from __future__ import annotations

from dataclasses import dataclass

import pygame

from pickhero.audio.note_utils import midi_to_name
from pickhero.matcher import MatchResult, MatchType
from pickhero.tabs.timeline import NoteEvent
from pickhero.ui.colors import dimmed, get_theme

EFFECT_DURATION_MS = 500.0


def _match_color(match_type: MatchType) -> tuple[int, int, int]:
    """Get the feedback color for a match type from the active theme."""
    t = get_theme()
    return {
        MatchType.HIT: t.feedback_hit,
        MatchType.CLOSE: t.feedback_close,
        MatchType.WRONG: t.feedback_miss,
        MatchType.MISS: t.feedback_miss,
    }.get(match_type, t.hud_text)


@dataclass
class _FeedbackEffect:
    """A timed visual effect on a note."""
    note_key: tuple[float, int]  # (timestamp_ms, string)
    match_type: MatchType
    start_ms: float


class FeedbackRenderer:
    """Manages visual feedback effects for matched notes."""

    def __init__(self):
        self._effects: dict[tuple[float, int], _FeedbackEffect] = {}
        self._streak = 0
        self._latest_result: MatchResult | None = None
        self._latest_result_ms = 0.0

    @property
    def streak(self) -> int:
        return self._streak

    def add_results(self, results: list[MatchResult], playback_ms: float) -> None:
        """Create visual effects from match results and update streak."""
        for result in results:
            self._latest_result = result
            self._latest_result_ms = playback_ms
            for event in result.matched_events:
                key = (event.timestamp_ms, event.string)
                self._effects[key] = _FeedbackEffect(
                    note_key=key,
                    match_type=result.match_type,
                    start_ms=playback_ms,
                )

            # Update streak
            if result.match_type == MatchType.HIT:
                self._streak += 1
            elif result.match_type in (MatchType.MISS, MatchType.CLOSE, MatchType.WRONG):
                self._streak = 0

    def draw_live_feedback(
        self,
        surface: pygame.Surface,
        font: pygame.font.Font,
        detail_font: pygame.font.Font,
        center_x: int,
        y: int,
        playback_ms: float,
    ) -> None:
        """Draw modern floating feedback badge with a precision timing needle meter."""
        result = self._latest_result
        if result is None or playback_ms - self._latest_result_ms > 1300.0:
            return

        t = get_theme()
        color = _match_color(result.match_type)
        time_elapsed = playback_ms - self._latest_result_ms
        # Smooth fade out in the last 300ms
        alpha = 255 if time_elapsed < 1000.0 else int(255 * (1.0 - (time_elapsed - 1000.0) / 300.0))
        alpha = max(0, min(255, alpha))

        if result.match_type == MatchType.HIT:
            if result.timing_error_ms is not None and abs(result.timing_error_ms) <= 25.0:
                headline = "PERFECT"
            else:
                headline = "GOOD"
        elif result.match_type == MatchType.CLOSE:
            headline = "CLOSE"
        elif result.match_type == MatchType.WRONG:
            headline = "WRONG NOTE"
        else:
            headline = "MISSED"

        # Build detail text
        details = []
        if result.expected_midi is not None:
            details.append(f"Exp {midi_to_name(result.expected_midi)}")
        if result.detected_midi is not None and result.match_type != MatchType.MISS:
            details.append(f"Played {midi_to_name(result.detected_midi)}")
        if result.timing_error_ms is not None and result.match_type in (MatchType.HIT, MatchType.CLOSE, MatchType.WRONG):
            sgn = "+" if result.timing_error_ms > 0 else ""
            details.append(f"{sgn}{result.timing_error_ms:.0f}ms {result.timing_label}")

        headline_surf = font.render(headline, True, color)
        detail_str = "  •  ".join(details)
        detail_surf = detail_font.render(detail_str, True, (215, 225, 238)) if details else None

        card_w = max(210, headline_surf.get_width() + 40)
        if detail_surf:
            card_w = max(card_w, detail_surf.get_width() + 32)
        has_meter = result.timing_error_ms is not None and result.match_type != MatchType.MISS
        card_h = 58 if has_meter else 44

        # Render floating card surface with alpha
        card_surf = pygame.Surface((card_w, card_h), pygame.SRCALPHA)
        # Background
        pygame.draw.rect(card_surf, (14, 18, 26, min(alpha, 235)), (0, 0, card_w, card_h), border_radius=12)
        # Glow border
        border_col = (*color, min(alpha, 200))
        pygame.draw.rect(card_surf, border_col, (0, 0, card_w, card_h), width=1, border_radius=12)

        # Draw headline
        card_surf.blit(headline_surf, (card_w // 2 - headline_surf.get_width() // 2, 6))

        # Draw detail text
        if detail_surf:
            card_surf.blit(detail_surf, (card_w // 2 - detail_surf.get_width() // 2, 28))

        # Draw precision timing meter bar if timing info exists
        if has_meter and result.timing_error_ms is not None:
            meter_w = min(150, card_w - 40)
            meter_h = 4
            meter_x = (card_w - meter_w) // 2
            meter_y = 48
            # Bar background
            pygame.draw.rect(card_surf, (35, 43, 58, alpha), (meter_x, meter_y, meter_w, meter_h), border_radius=2)
            # Center target notch (0ms)
            center_bar_x = meter_x + meter_w // 2
            pygame.draw.line(card_surf, (0, 229, 190, alpha), (center_bar_x, meter_y - 2), (center_bar_x, meter_y + meter_h + 2), 2)
            # Needle position (-100ms to +100ms mapped to 0..meter_w)
            clamped_err = max(-100.0, min(100.0, result.timing_error_ms))
            needle_offset = (clamped_err / 100.0) * (meter_w / 2)
            needle_x = int(center_bar_x + needle_offset)
            # Draw needle dot / diamond
            needle_color = (*color, alpha)
            pygame.draw.circle(card_surf, needle_color, (needle_x, meter_y + meter_h // 2), 4)

        surface.blit(card_surf, (center_x - card_w // 2, y))

    def get_note_color(
        self,
        event: NoteEvent,
        base_color: tuple[int, int, int],
        playback_ms: float,
        is_past: bool,
    ) -> tuple[int, int, int]:
        """Get the display color for a note event."""
        key = (event.timestamp_ms, event.string)
        effect = self._effects.get(key)
        if effect is not None:
            elapsed = playback_ms - effect.start_ms
            color = _match_color(effect.match_type)
            if elapsed <= EFFECT_DURATION_MS:
                return color
            # Effect expired but state is permanent — still show color (dimmed)
            return dimmed(color, 0.6)

        return dimmed(base_color) if is_past else base_color

    def draw_streak(self, surface: pygame.Surface, font: pygame.font.Font,
                    x: int, y: int) -> None:
        """Draw streak counter as a sleek glowing pill badge if streak >= 3."""
        if self._streak < 3:
            return
        t = get_theme()
        text = f"★ {self._streak}x STREAK"
        surf = font.render(text, True, t.feedback_streak)
        pad_x, pad_y = 14, 4
        pill_rect = pygame.Rect(
            x - surf.get_width() // 2 - pad_x,
            y - pad_y,
            surf.get_width() + pad_x * 2,
            surf.get_height() + pad_y * 2,
        )
        # Translucent dark pill background
        pill_surf = pygame.Surface((pill_rect.width, pill_rect.height), pygame.SRCALPHA)
        pygame.draw.rect(pill_surf, (22, 28, 38, 220), (0, 0, pill_rect.width, pill_rect.height), border_radius=12)
        pygame.draw.rect(pill_surf, (*t.feedback_streak, 180), (0, 0, pill_rect.width, pill_rect.height), width=1, border_radius=12)
        surface.blit(pill_surf, pill_rect.topleft)
        surface.blit(surf, (x - surf.get_width() // 2, y))

    def draw_stats(self, surface: pygame.Surface, stats: dict,
                   font: pygame.font.Font, x: int, y: int) -> None:
        """Draw accuracy stats as a sleek studio card (top-right area)."""
        t = get_theme()
        acc = stats["accuracy_percent"]
        acc_color = t.feedback_hit if acc >= 80 else (t.feedback_close if acc >= 60 else t.feedback_miss)
        line1 = f"ACCURACY  {acc:.0f}%"
        line2 = f"Hits {stats['hits']}  •  Close {stats['close']}  •  Miss {stats['misses']}"

        surf1 = font.render(line1, True, acc_color)
        surf2 = font.render(line2, True, (155, 170, 190))

        card_w = max(surf1.get_width(), surf2.get_width()) + 24
        card_h = surf1.get_height() + surf2.get_height() + 14
        card_rect = pygame.Rect(x - card_w, y - 4, card_w, card_h)

        card_surf = pygame.Surface((card_w, card_h), pygame.SRCALPHA)
        pygame.draw.rect(card_surf, (15, 20, 30, 200), (0, 0, card_w, card_h), border_radius=10)
        pygame.draw.rect(card_surf, (45, 58, 78, 160), (0, 0, card_w, card_h), width=1, border_radius=10)
        surface.blit(card_surf, card_rect.topleft)

        surface.blit(surf1, (card_rect.right - surf1.get_width() - 12, card_rect.y + 6))
        surface.blit(surf2, (card_rect.right - surf2.get_width() - 12, card_rect.y + surf1.get_height() + 8))

    def cleanup(self, playback_ms: float) -> None:
        """Remove expired effects."""
        expired = [
            key for key, eff in self._effects.items()
            if playback_ms - eff.start_ms > EFFECT_DURATION_MS * 2
        ]
        for key in expired:
            del self._effects[key]

    def reset(self) -> None:
        """Clear all effects and streak."""
        self._effects.clear()
        self._streak = 0
        self._latest_result = None
        self._latest_result_ms = 0.0
