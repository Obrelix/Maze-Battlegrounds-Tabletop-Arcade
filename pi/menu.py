# pi/menu.py
# Menu screen renderers ported from docs/js/renderer.js
# (renderMenu, renderPlayerSetup, renderHighScores, drawOverlays)

import math
import time

from config import LOGICAL_W, LOGICAL_H, COLORS, DIFFICULTIES
from hud import draw_text, draw_char, draw_digit


# ---------------------------------------------------------------------------
# Menu colour palettes (match JS menuColors array)
# ---------------------------------------------------------------------------
_MENU_COLORS = ['#08ffff', '#ff00ff', '#00ff88', '#8888ff']
_MENU_OPTIONS = ['SINGLE PLAYER', 'LOCAL MULTI', 'HIGH SCORES']


# ---------------------------------------------------------------------------
# Main menu
# ---------------------------------------------------------------------------

def render_menu(renderer, state) -> None:
    """
    Render the main menu screen.
    Draws the 3 game mode options with blinking selection arrows.
    Mirrors JS renderMenu().
    """
    # Background
    for y in range(LOGICAL_H):
        for x in range(LOGICAL_W):
            renderer.set_pixel_no_cam(x, y, (17, 17, 17))

    blink = int(time.time() * 2) % 2 == 0

    draw_text(renderer, 'SELECT MODE', 43, 3, '#ffffff', use_camera=False)

    center = 43 + (len('SELECT MODE') * 4 - 1) // 2
    menu_start_y = 13
    menu_spacing = 10

    options = _MENU_OPTIONS
    colors = _MENU_COLORS[:len(options)]

    for idx, option in enumerate(options):
        option_len = len(option) * 4
        is_selected = state.menu_selection == idx
        color = colors[idx] if is_selected else '#888888'
        x = center - option_len // 2

        if blink and is_selected:
            draw_text(renderer, '→', x - 6, menu_start_y + idx * menu_spacing, '#ffffff', use_camera=False)
            draw_text(renderer, '←', x + option_len - 1, menu_start_y + idx * menu_spacing, '#ffffff', use_camera=False)
        draw_text(renderer, option, x, menu_start_y + idx * menu_spacing, color, use_camera=False)

    # Control hints
    draw_text(renderer, '↑↓', 13, 50, '#61ca5d', use_camera=False)
    draw_text(renderer, 'CHANGE', 5, 56, '#61ca5d', use_camera=False)
    draw_text(renderer, 'START', 105, 50, '#bb4e4e', use_camera=False)
    draw_text(renderer, 'SELECT', 103, 56, '#bb4e4e', use_camera=False)


# ---------------------------------------------------------------------------
# Player setup
# ---------------------------------------------------------------------------

def render_player_setup(renderer, state) -> None:
    """
    Render the player setup screen.
    Shows difficulty selector (single only), color preview, and name entry.
    Mirrors JS renderPlayerSetup().
    """
    for y in range(LOGICAL_H):
        for x in range(LOGICAL_W):
            renderer.set_pixel_no_cam(x, y, (17, 17, 17))

    ps = state.player_setup
    p_id = ps['active_player'] + 1
    player_color_obj = COLORS[ps['color_idx']]
    player_color = player_color_obj.hex
    difficulty_obj = DIFFICULTIES[ps['difficulty_idx']]

    preview_x = 65
    blink = int(time.time() * 5) % 2 == 0
    is_multi = state.game_mode == 'MULTI'
    progress_text = 'MULTI PLAYER' if is_multi else 'SINGLE PLAYER'
    preview_color_y = 24
    preview_name_y = 34

    # Header
    text_x = 43 if is_multi else 39
    draw_text(renderer, progress_text, text_x, 3, '#ffffff', use_camera=False)

    if is_multi:
        draw_text(renderer, f'PLAYER {p_id}', 52, 11, player_color, use_camera=False)
        preview_color_y = 24
        preview_name_y = 36
    else:
        # Difficulty selector
        draw_text(renderer, 'DIFF:', 43, 16, '#888888', use_camera=False)
        diff_color = '#555555' if (blink and ps['phase'] == 'DIFFICULTY') else difficulty_obj.hex
        draw_text(renderer, difficulty_obj.name, preview_x, 16, diff_color, use_camera=False)

    # Color preview — 7x7 block
    draw_text(renderer, 'COLOR:', 39, preview_color_y + 1, '#888888', use_camera=False)
    block_color = (85, 85, 85) if (blink and ps['phase'] == 'COLOR') else player_color_obj.rgb
    for bx in range(7):
        for by in range(7):
            renderer.set_pixel_no_cam(preview_x + bx, preview_color_y + by, block_color)
    # Color name to right of block
    name_color = '#555555' if (blink and ps['phase'] == 'COLOR') else player_color
    draw_text(renderer, player_color_obj.name, preview_x + 11, preview_color_y + 1, name_color, use_camera=False)

    # Name entry — 3 chars with underline
    draw_text(renderer, 'NAME:', 43, preview_name_y, '#888888', use_camera=False)
    char_spacing = 6
    for i in range(3):
        ch = chr(ps['name_chars'][i])
        is_active = (i == ps['name_char_idx']) and ps['phase'] == 'NAME'
        display_color = player_color if is_active else '#555555'
        draw_text(renderer, ch, preview_x + i * char_spacing, preview_name_y, display_color, use_camera=False)
        if is_active and blink:
            ux = preview_x + i * char_spacing
            for dot in range(3):
                renderer.set_pixel_no_cam(ux + dot, preview_name_y + 7, player_color_obj.rgb)

    # Control hints
    draw_text(renderer, '↑↓', 13, 50, '#61ca5d', use_camera=False)
    draw_text(renderer, 'CHANGE', 5, 56, '#61ca5d', use_camera=False)
    draw_text(renderer, '←', 99, 50, '#bb4e4e', use_camera=False)
    draw_text(renderer, '→', 118, 50, '#bb4e4e', use_camera=False)
    draw_text(renderer, 'PREV NEXT', 94, 56, '#bb4e4e', use_camera=False)


# ---------------------------------------------------------------------------
# High scores
# ---------------------------------------------------------------------------

def render_high_scores(renderer, state) -> None:
    """
    Render the high scores screen.
    Shows top 8 scores with rank colours, or 'NO SCORES YET'.
    Mirrors JS renderHighScores() / renderLeaderboard().
    """
    for y in range(LOGICAL_H):
        for x in range(LOGICAL_W):
            renderer.set_pixel_no_cam(x, y, (17, 17, 17))

    draw_text(renderer, 'HIGH SCORES', 38, 2, '#ffff00', use_camera=False)

    scores = state.high_scores or []

    if not scores:
        draw_text(renderer, 'NO SCORES YET', 35, 20, '#888888', use_camera=False)
        draw_text(renderer, 'PLAY A GAME', 42, 30, '#666666', use_camera=False)
    else:
        for idx, entry in enumerate(scores[:8]):
            y_pos = 10 + idx * 6
            rank_color = '#ffff00' if idx == 0 else ('#ff8800' if idx == 1 else '#888888')
            name_color = entry.get('win_color', '#ffffff')
            opp_color = entry.get('opp_color', '#888888')

            draw_text(renderer, f'{idx + 1}.', 5, y_pos, rank_color, use_camera=False)
            display_name = (entry.get('name') or '???')[:3].upper()
            draw_text(renderer, display_name, 14, y_pos, name_color, use_camera=False)
            draw_text(renderer, 'VS', 29, y_pos, '#666666', use_camera=False)
            opp_name = (entry.get('opponent') or '???')[:9]
            draw_text(renderer, opp_name, 40, y_pos, opp_color, use_camera=False)
            score = round((entry.get('score', 0) - entry.get('opp_score', 0)) * entry.get('multiplier', 1))
            draw_text(renderer, str(score), 110, y_pos, rank_color, use_camera=False)

    blink = int(time.time() * 2) % 2 == 0
    if blink:
        draw_text(renderer, 'ANY:BACK', 44, 57, '#666666', use_camera=False)


# ---------------------------------------------------------------------------
# Game overlays (pause, game over, round over, attract mode)
# ---------------------------------------------------------------------------

def render_game_overlay(renderer, state) -> None:
    """
    Render overlays shown during PLAYING state:
      - Attract mode indicator
      - Pause menu (RESUME / RESTART / QUIT)
      - Game over (win message + scrolling taunt)
      - Round over (score message)
    Mirrors JS drawOverlays() overlay sections.
    """
    blink = int(time.time() * 2) % 2 == 0

    if state.is_attract_mode:
        if int(time.time() * 0.833) % 2 == 0:   # ~1200ms cycle
            draw_text(renderer, 'DEMO MODE', 48, 25, '#ff0000', use_camera=False)
            draw_text(renderer, 'PRESS ANY BUTTON', 34, 35, '#ffff00', use_camera=False)

    if state.is_paused:
        # Semi-transparent overlay — darken every pixel by overwriting with dim black
        for y in range(LOGICAL_H):
            for x in range(LOGICAL_W):
                renderer.set_pixel_no_cam(x, y, (0, 0, 0))

        draw_text(renderer, 'PAUSED', 52, 10, '#ffffff', use_camera=False)

        is_online = getattr(state, 'game_mode', '') == 'ONLINE'
        options = ['RESUME', 'QUIT'] if is_online else ['RESUME', 'RESTART', 'QUIT']
        center = 52 + (len('PAUSED') * 4 - 1) // 2
        menu_start_y = 24
        menu_spacing = 10

        for idx, option in enumerate(options):
            opt_len = len(option) * 4
            is_sel = state.pause_menu_selection == idx
            color = '#ffff00' if is_sel else '#888888'
            x = center - opt_len // 2
            if blink and is_sel:
                draw_text(renderer, '→', x - 6, menu_start_y + idx * menu_spacing, '#ffffff', use_camera=False)
                draw_text(renderer, '←', x + opt_len, menu_start_y + idx * menu_spacing, '#ffffff', use_camera=False)
            draw_text(renderer, option, x, menu_start_y + idx * menu_spacing, color, use_camera=False)

        draw_text(renderer, '↑↓', 13, 50, '#61ca5d', use_camera=False)
        draw_text(renderer, 'CHANGE', 5, 56, '#61ca5d', use_camera=False)
        draw_text(renderer, 'BOOM', 104, 50, '#bb4e4e', use_camera=False)
        draw_text(renderer, 'SELECT', 100, 56, '#bb4e4e', use_camera=False)

    elif state.is_game_over or state.is_round_over:
        # Dim overlay
        for y in range(LOGICAL_H):
            for x in range(LOGICAL_W):
                renderer.set_pixel_no_cam(x, y, (0, 0, 0))

        msgs = state.messages
        if state.is_game_over:
            win_color = msgs.get('win_color') or '#ffffff'
            taunt_color = msgs.get('round_color') or '#ffff00'
            if blink:
                draw_text(renderer, msgs.get('win', ''), 49, 8, win_color, use_camera=False)
            # Scrolling taunt — use state.scroll_x for horizontal scroll offset
            taunt_text = msgs.get('taunt', '')
            if taunt_text:
                draw_text(renderer, taunt_text, state.scroll_x, 29, taunt_color, use_camera=False)
            if blink:
                draw_text(renderer, 'PRESS ANY TO RESET', 30, 52, '#6f6deb', use_camera=False)
        else:
            draw_text(renderer, 'ROUND OVER', 46, 8, '#ffffff', use_camera=False)
            round_msg = msgs.get('round', '')
            round_color = msgs.get('round_color') or '#ffffff'
            draw_text(renderer, round_msg, state.scroll_x, 29, round_color, use_camera=False)
            if blink:
                draw_text(renderer, 'PRESS ANY BUTTON', 34, 52, '#ffff00', use_camera=False)
