# pi/hud.py
# HUD and text rendering helpers, ported from docs/js/renderer.js
# (the drawText / drawDigit / drawChar / renderPlayerHUD / renderHUD functions).

import math

from config import (
    BITMAP_FONT, BITMAP_FONT_WIDE, DIGIT_MAP,
    MAX_ENERGY, MAX_MINES,
    hsl_to_rgb,
)


# ---------------------------------------------------------------------------
# Low-level glyph drawing
# ---------------------------------------------------------------------------

def draw_text(renderer, text: str, x: int, y: int, color, use_camera: bool = True) -> None:
    """
    Draw *text* starting at (x, y) using the bitmap font.

    Character widths
    ----------------
    - Wide chars (←, →) : 5×5 pixels, advance 6 px
    - Space              : advance 3 px (no pixels drawn)
    - Normal             : 3×5 pixels, advance 4 px
    """
    draw_fn = renderer.set_pixel if use_camera else renderer.set_pixel_no_cam
    r, g, b = renderer.parse_color(color)
    cx = x
    for ch in text.upper():
        if ch in BITMAP_FONT_WIDE:
            glyph = BITMAP_FONT_WIDE[ch]
            for p, bit in enumerate(glyph):
                if bit:
                    draw_fn(cx + (p % 5), y + (p // 5), (r, g, b))
            cx += 6
        elif ch == ' ':
            cx += 3
        elif ch in BITMAP_FONT:
            glyph = BITMAP_FONT[ch]
            for p, bit in enumerate(glyph):
                if bit:
                    draw_fn(cx + (p % 3), y + (p // 3), (r, g, b))
            cx += 4
        # Unknown characters are silently skipped


def draw_digit(renderer, x: int, y: int, num: int, color,
               rotate_deg: int = 0, use_camera: bool = True) -> None:
    """
    Draw a single digit *num* (0-9) at (x, y) with optional rotation.

    Rotation values
    ---------------
    -90  : dx = row,     dy = 2 - col
     0   : dx = col,     dy = row
    +90  : dx = 4 - row, dy = col
    """
    glyph = DIGIT_MAP.get(int(num))
    if glyph is None:
        return
    draw_fn = renderer.set_pixel if use_camera else renderer.set_pixel_no_cam
    rgb = renderer.parse_color(color)
    for i, bit in enumerate(glyph):
        if bit:
            col = i % 3
            row = i // 3
            if rotate_deg == 90:
                dx = 4 - row
                dy = col
            elif rotate_deg == -90:
                dx = row
                dy = 2 - col
            else:
                dx = col
                dy = row
            draw_fn(x + dx, y + dy, rgb)


def draw_char(renderer, x: int, y: int, char: str, color,
              rotate_deg: int = 0, use_camera: bool = True) -> None:
    """
    Draw a single character at (x, y) with optional rotation.
    Wide glyphs (←, →) are drawn without rotation for simplicity.
    """
    ch = char.upper() if char not in ('←', '→') else char

    if ch in BITMAP_FONT_WIDE:
        glyph = BITMAP_FONT_WIDE[ch]
        draw_fn = renderer.set_pixel if use_camera else renderer.set_pixel_no_cam
        rgb = renderer.parse_color(color)
        for p, bit in enumerate(glyph):
            if bit:
                draw_fn(x + (p % 5), y + (p // 5), rgb)
        return

    glyph = BITMAP_FONT.get(ch)
    if glyph is None:
        return

    draw_fn = renderer.set_pixel if use_camera else renderer.set_pixel_no_cam
    rgb = renderer.parse_color(color)
    for i, bit in enumerate(glyph):
        if bit:
            col = i % 3
            row = i // 3
            if rotate_deg == 90:
                dx = 4 - row
                dy = col
            elif rotate_deg == -90:
                dx = row
                dy = 2 - col
            else:
                dx = col
                dy = row
            draw_fn(x + dx, y + dy, rgb)


# ---------------------------------------------------------------------------
# Player HUD
# ---------------------------------------------------------------------------

def render_player_hud(renderer, player, timer_str: str, wall_color, is_player1: bool) -> None:
    """
    Render HUD elements for a single player.

    Layout (x column is 0 for P1, 123 for P2):
    - Name chars at rows [0,4,8]  (P1) / [61,57,53] (P2), rotated ±90°
    - Mine count at row 13 (P1) / 48 (P2)
    - Energy bar rows 17-42 (P1) / 46-21 (P2)
    - Timer digits at rows [44,48,52] (P1) / [17,13,9] (P2)
    - Score digits at rows [57,61] (P1) / [4,0] (P2)
    """
    rotation = 90 if is_player1 else -90
    x = 0 if is_player1 else 123

    # --- Name (3 characters) ---
    name = (player.name or '   ')[:3].ljust(3)
    name_offsets = [0, 4, 8] if is_player1 else [61, 57, 53]
    player_color = player.color
    for i, ch in enumerate(name):
        draw_char(renderer, x, name_offsets[i], ch, player_color,
                  rotate_deg=rotation, use_camera=False)

    # --- Mine count ---
    mine_y = 13 if is_player1 else 48
    mine_ratio = (player.mines_left / MAX_MINES) if MAX_MINES > 0 else 0
    mine_hue = mine_ratio * 120  # 0=red, 120=green
    mine_color = hsl_to_rgb(mine_hue, 100, 50)
    draw_digit(renderer, x, mine_y, player.mines_left, mine_color,
               rotate_deg=rotation, use_camera=False)

    # --- Energy bar ---
    energy_ratio = player.boost_energy / MAX_ENERGY if MAX_ENERGY > 0 else 0
    energy_hue = energy_ratio * 120
    energy_color = hsl_to_rgb(energy_hue, 100, 50)
    bar_height = math.floor(energy_ratio * 26)
    for h in range(bar_height):
        for w in range(5):
            bar_y = (17 + h) if is_player1 else (46 - h)
            renderer.set_pixel_no_cam(x + w, bar_y, energy_color)

    # --- Timer digits ---
    timer_offsets = [44, 48, 52] if is_player1 else [17, 13, 9]
    for i, ch in enumerate(timer_str[:3]):
        digit = int(ch) if ch.isdigit() else 0
        draw_digit(renderer, x, timer_offsets[i], digit, wall_color,
                   rotate_deg=rotation, use_camera=False)

    # --- Score ---
    score_str = str(player.score).zfill(2)
    score_offsets = [57, 61] if is_player1 else [4, 0]
    for i, ch in enumerate(score_str[:2]):
        digit = int(ch) if ch.isdigit() else 0
        draw_digit(renderer, x, score_offsets[i], digit, player_color,
                   rotate_deg=rotation, use_camera=False)


def render_hud(renderer, state, wall_color) -> None:
    """Render the full HUD for both players."""
    game_time_secs = math.ceil(state.game_time / 60) if state.game_time else 0
    timer_str = str(game_time_secs).zfill(3)

    if state.players[0]:
        render_player_hud(renderer, state.players[0], timer_str, wall_color, True)
    if state.players[1]:
        render_player_hud(renderer, state.players[1], timer_str, wall_color, False)
