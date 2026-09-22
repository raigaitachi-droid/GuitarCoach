"""Color constants for Guitar Trainer's friendly practice UI."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Theme:
    """All UI colors for a theme."""

    # Background
    bg: tuple[int, int, int]

    # Lane backgrounds (alternating)
    lane_bg_even: tuple[int, int, int]
    lane_bg_odd: tuple[int, int, int]
    lane_line: tuple[int, int, int]

    # Hit zone
    hit_zone: tuple[int, int, int]

    # Note text and border
    note_text: tuple[int, int, int]
    note_border: tuple[int, int, int]

    # Menu
    menu_bg: tuple[int, int, int]
    menu_item: tuple[int, int, int]
    menu_selected: tuple[int, int, int]
    menu_selected_bg: tuple[int, int, int]
    menu_check: tuple[int, int, int]

    # HUD
    hud_text: tuple[int, int, int]
    hud_accent: tuple[int, int, int]

    # Feedback
    feedback_hit: tuple[int, int, int]
    feedback_close: tuple[int, int, int]
    feedback_miss: tuple[int, int, int]
    feedback_streak: tuple[int, int, int]

    # Precision Timing Meter
    timing_perfect: tuple[int, int, int]
    timing_good: tuple[int, int, int]
    timing_bad: tuple[int, int, int]
    timing_bar_bg: tuple[int, int, int]
    timing_needle: tuple[int, int, int]

    # Loop markers
    loop_marker: tuple[int, int, int]
    loop_marker_disabled: tuple[int, int, int]
    loop_region: tuple[int, int, int, int]          # RGBA
    loop_region_disabled: tuple[int, int, int, int]  # RGBA

    # Signal meter
    signal_hot: tuple[int, int, int]
    signal_warm: tuple[int, int, int]
    signal_cold: tuple[int, int, int]

    # Tuner
    tuner_in_tune: tuple[int, int, int]
    tuner_close: tuple[int, int, int]
    tuner_off: tuple[int, int, int]


DARK_THEME = Theme(
    bg=(13, 16, 23),
    lane_bg_even=(18, 23, 33),
    lane_bg_odd=(22, 28, 40),
    lane_line=(54, 68, 90),
    hit_zone=(0, 229, 190),  # vibrant electric mint laser
    note_text=(255, 255, 255),
    note_border=(8, 12, 18),
    menu_bg=(13, 16, 23),
    menu_item=(175, 188, 206),
    menu_selected=(255, 255, 255),
    menu_selected_bg=(28, 48, 68),
    menu_check=(46, 213, 115),
    hud_text=(226, 232, 240),
    hud_accent=(0, 229, 190),
    feedback_hit=(46, 213, 115),     # emerald hit
    feedback_close=(255, 177, 66),   # warm gold close
    feedback_miss=(255, 71, 87),     # neon coral miss
    feedback_streak=(255, 211, 42),  # sunburst gold
    timing_perfect=(46, 213, 115),
    timing_good=(255, 177, 66),
    timing_bad=(255, 71, 87),
    timing_bar_bg=(25, 33, 47),
    timing_needle=(255, 255, 255),
    loop_marker=(0, 210, 255),
    loop_marker_disabled=(0, 75, 100),
    loop_region=(0, 210, 255, 28),
    loop_region_disabled=(0, 75, 100, 15),
    signal_hot=(46, 213, 115),
    signal_warm=(255, 177, 66),
    signal_cold=(58, 69, 88),
    tuner_in_tune=(46, 213, 115),
    tuner_close=(255, 177, 66),
    tuner_off=(255, 71, 87),
)

LIGHT_THEME = Theme(
    bg=(242, 244, 248),
    lane_bg_even=(234, 237, 244),
    lane_bg_odd=(227, 231, 239),
    lane_line=(182, 191, 204),
    hit_zone=(20, 30, 45),
    note_text=(255, 255, 255),
    note_border=(60, 70, 85),
    menu_bg=(242, 244, 248),
    menu_item=(75, 85, 100),
    menu_selected=(15, 23, 42),
    menu_selected_bg=(210, 225, 248),
    menu_check=(22, 163, 74),
    hud_text=(30, 41, 59),
    hud_accent=(14, 116, 144),
    feedback_hit=(22, 163, 74),
    feedback_close=(217, 119, 6),
    feedback_miss=(220, 38, 38),
    feedback_streak=(202, 138, 4),
    timing_perfect=(22, 163, 74),
    timing_good=(217, 119, 6),
    timing_bad=(220, 38, 38),
    timing_bar_bg=(210, 218, 230),
    timing_needle=(15, 23, 42),
    loop_marker=(14, 116, 144),
    loop_marker_disabled=(148, 163, 184),
    loop_region=(14, 116, 144, 35),
    loop_region_disabled=(148, 163, 184, 15),
    signal_hot=(22, 163, 74),
    signal_warm=(217, 119, 6),
    signal_cold=(160, 172, 188),
    tuner_in_tune=(22, 163, 74),
    tuner_close=(217, 119, 6),
    tuner_off=(220, 38, 38),
)

_THEMES = {"dark": DARK_THEME, "light": LIGHT_THEME}
_current_theme: Theme = DARK_THEME
_current_theme: Theme = DARK_THEME


def set_theme(name: str) -> None:
    """Set the active theme by name ('dark' or 'light')."""
    global _current_theme
    _current_theme = _THEMES.get(name, DARK_THEME)


def get_theme() -> Theme:
    """Return the active theme."""
    return _current_theme


def get_theme_name() -> str:
    """Return the name of the active theme."""
    if _current_theme is LIGHT_THEME:
        return "light"
    return "dark"


def cycle_theme() -> str:
    """Cycle to the next theme. Returns the new theme name."""
    if _current_theme is DARK_THEME:
        set_theme("light")
        return "light"
    set_theme("dark")
    return "dark"


# Friendly high-contrast palette, keyed 1-6: 1=high E, 6=low E.
# The colors are deliberately softer than the old arcade palette.
STRING_COLORS: dict[int, tuple[int, int, int]] = {
    1: (255, 107, 129),   # 1st string (High E) - radiant coral
    2: (255, 192, 72),    # 2nd string (B) - warm gold marigold
    3: (46, 204, 113),    # 3rd string (G) - electric jade
    4: (54, 162, 235),    # 4th string (D) - sky azure
    5: (165, 94, 234),    # 5th string (A) - royal amethyst
    6: (245, 120, 60),    # 6th string (Low E) - sunset amber
}


def dimmed(color: tuple[int, int, int], factor: float = 0.4) -> tuple[int, int, int]:
    """Darken a color by multiplying each channel by factor."""
    return (
        int(color[0] * factor),
        int(color[1] * factor),
        int(color[2] * factor),
    )
