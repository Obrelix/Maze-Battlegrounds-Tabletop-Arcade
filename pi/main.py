#!/usr/bin/env python3
# pi/main.py
# Main game loop and state machine for the Maze Battlegrounds LED matrix game.
# Ported from docs/js/main.js
#
# Usage:
#   python3 main.py          # hardware mode (real LED matrix)
#   python3 main.py --mock   # mock/dev mode (no hardware required)

import argparse
import math
import signal
import sys
import time

from config import (
    FIXED_STEP, COLORS, DIFFICULTIES, TIMING, GAME_TIME,
    LOGICAL_W, hsl_to_rgb, CELL_SIZE, MAZE_OFFSET_X, COLS, ROWS,
)
from renderer import Renderer
from input_handler import InputHandler
from state import GameState, reset_state_for_match, save_high_scores, should_spawn_ammo_crate
from classes import Player
from grid import init_maze, create_ammo_crate, clear_los_cache, grid_index
from mechanics import (
    apply_player_actions,
    update_projectiles,
    check_beam_collisions,
    check_beam_actions,
    check_mines_actions,
    check_portal_actions,
    check_crate,
    resolve_round,
    update_mines,
)
from effects import update_particles, check_boost_trail, shake_camera
from hud import render_hud
from menu import render_menu, render_player_setup, render_high_scores, render_game_overlay
from seeded_random import seeded_random
from ai.controller import get_cpu_input
from ai.difficulty import set_difficulty, get_dynamic_difficulty, set_active_config

# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------
_running = True


def _signal_handler(sig, frame):
    global _running
    _running = False


signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)


# ---------------------------------------------------------------------------
# Match / round management
# ---------------------------------------------------------------------------

def start_new_match(state: GameState) -> None:
    """
    Reset match state and set difficulty, then start first round.
    Mirrors JS startGame().
    """
    reset_state_for_match(state)
    ps = state.player_setup
    chosen = DIFFICULTIES[ps['difficulty_idx']].name

    if chosen == 'DYNAMIC':
        set_difficulty('INTERMEDIATE')
        state.difficulty = 'DYNAMIC'
    else:
        state.difficulty = chosen
        set_difficulty(chosen)

    start_new_round(state)


def start_new_round(state: GameState, maze_seed=None) -> None:
    """
    Generate a new maze and place players at start positions.
    Mirrors JS initMaze() + round reset logic.
    """
    # Apply dynamic difficulty between rounds
    if state.difficulty == 'DYNAMIC' and state.players[0] and state.players[1]:
        p0, p1 = state.players
        human_score = p0.score if p0.name != 'CPU' else p1.score
        cpu_score = p0.score if p0.name == 'CPU' else p1.score
        total_rounds = p0.score + p1.score
        new_cfg = get_dynamic_difficulty(human_score, cpu_score, total_rounds)
        set_active_config(new_cfg)

    maze, portals, game_time, max_game_time = init_maze(seed=maze_seed)
    state.maze = maze
    state.portals = portals
    state.game_time = game_time
    state.max_game_time = max_game_time
    state.mines = []
    state.particles = []
    state.projectiles = []
    state.ammo_crate = None
    state.ammo_last_take_time = -999
    state.frame_count = 0
    state.is_round_over = False
    state.is_game_over = False
    state.death_timer = 0
    state.victim_idx = -1
    state.is_paused = False
    state.is_draw = False
    state.scroll_x = LOGICAL_W
    state.camera.shake_strength = 0.0
    state.portal_reverse_colors = False

    # Reset per-round player state
    for p in state.players:
        if p:
            p.reset_state()

    # Assign goal cells (P1 → bottom-right, P2 → top-left)
    if state.players[0]:
        state.players[0].goal_c = COLS - 1
        state.players[0].goal_r = ROWS - 1
        state.players[0].x = float(MAZE_OFFSET_X + 1)
        state.players[0].y = 1.0

    if state.players[1]:
        state.players[1].goal_c = 0
        state.players[1].goal_r = 0
        state.players[1].x = float(MAZE_OFFSET_X + (COLS - 1) * CELL_SIZE + 1)
        state.players[1].y = float((ROWS - 1) * CELL_SIZE + 1)


def _finalize_setup(state: GameState) -> None:
    """
    Extract name from nameChars, create players, start match.
    Mirrors JS finishPlayerSetup().
    """
    ps = state.player_setup
    name = ''.join(chr(c) for c in ps['name_chars']).strip() or 'AAA'
    name = name[:3]

    # Build player objects with chosen color
    p1_color = COLORS[ps['color_idx']]
    is_multi = state.game_mode == 'MULTI'

    if not is_multi:
        # Single player: P1 is human, P2 is CPU
        if not state.players[0] or state.players[0].name == 'CPU':
            state.players[0] = Player(0, name=name, color=p1_color)
        else:
            state.players[0].name = name
            state.players[0].color = p1_color
        if not state.players[1]:
            cpu_color = COLORS[1] if p1_color is not COLORS[1] else COLORS[0]
            state.players[1] = Player(1, name='CPU', color=cpu_color)
        state.screen = 'PLAYING'
        start_new_match(state)
    else:
        # Multi: set name for active player, continue to next or start
        active = ps['active_player']
        if active == 0:
            if not state.players[0]:
                state.players[0] = Player(0, name=name, color=p1_color)
            else:
                state.players[0].name = name
                state.players[0].color = p1_color
            # Move to player 2 setup
            ps['active_player'] = 1
            ps['color_idx'] = 1 % len(COLORS)
            ps['name_char_idx'] = 0
            ps['name_chars'] = [65, 65, 65]
            ps['phase'] = 'COLOR'
            state.input_delay = 20
        else:
            # P2 done
            p2_color = COLORS[ps['color_idx']]
            if not state.players[1]:
                state.players[1] = Player(1, name=name, color=p2_color)
            else:
                state.players[1].name = name
                state.players[1].color = p2_color
            state.screen = 'PLAYING'
            start_new_match(state)


# ---------------------------------------------------------------------------
# Input dispatch (state machine handlers)
# ---------------------------------------------------------------------------

def handle_menu_input(state: GameState, p1: dict, p2: dict) -> None:
    """Handle input on the MENU screen."""
    num_options = 3  # SINGLE PLAYER, LOCAL MULTI, HIGH SCORES

    if p1['up']:
        state.menu_selection = (state.menu_selection - 1 + num_options) % num_options
        state.input_delay = 20
        return

    if p1['down']:
        state.menu_selection = (state.menu_selection + 1) % num_options
        state.input_delay = 20
        return

    if p1['boom'] or p1['beam'] or p1['start']:
        state.input_delay = 20
        sel = state.menu_selection
        if sel == 0:
            state.game_mode = 'SINGLE'
            _init_player_setup(state)
        elif sel == 1:
            state.game_mode = 'MULTI'
            _init_player_setup(state)
        elif sel == 2:
            state.screen = 'HIGHSCORES'


def _init_player_setup(state: GameState) -> None:
    """Transition to PLAYER_SETUP screen with fresh setup state."""
    reset_state_for_match(state)
    is_multi = state.game_mode == 'MULTI'
    state.player_setup = {
        'active_player': 0,
        'difficulty_idx': 2,
        'color_idx': 0,
        'name_char_idx': 0,
        'name_chars': [65, 65, 65],
        'phase': 'COLOR' if is_multi else 'DIFFICULTY',
        'is_done': False,
    }
    state.screen = 'PLAYER_SETUP'
    state.input_delay = 20


def handle_highscore_input(state: GameState, p1: dict, p2: dict) -> None:
    """Any key returns to menu."""
    any_key = any(p1[k] for k in ('up', 'down', 'left', 'right', 'boom', 'beam', 'start', 'shield', 'boost'))
    if any_key:
        state.screen = 'MENU'
        state.menu_selection = 0
        state.input_delay = 20


def handle_setup_input(state: GameState, p1: dict, p2: dict) -> None:
    """Handle input on the PLAYER_SETUP screen (phase-based)."""
    ps = state.player_setup
    is_multi = state.game_mode == 'MULTI'
    # Choose input source
    inp = p1 if ps['active_player'] == 0 else p2

    NAME_INPUT_DELAY = 7

    if ps['phase'] == 'DIFFICULTY' and ps['active_player'] == 0 and not is_multi:
        if inp['left']:
            ps['difficulty_idx'] = (ps['difficulty_idx'] - 1 + len(DIFFICULTIES)) % len(DIFFICULTIES)
            state.input_delay = 20
        elif inp['right']:
            ps['difficulty_idx'] = (ps['difficulty_idx'] + 1) % len(DIFFICULTIES)
            state.input_delay = 20
        elif inp['down'] or inp['boom'] or inp['beam'] or inp['start']:
            ps['phase'] = 'COLOR'
            state.input_delay = 20

    elif ps['phase'] == 'COLOR':
        if inp['left']:
            ps['color_idx'] = (ps['color_idx'] - 1 + len(COLORS)) % len(COLORS)
            state.input_delay = 20
        elif inp['right']:
            ps['color_idx'] = (ps['color_idx'] + 1) % len(COLORS)
            state.input_delay = 20
        elif inp['down'] or inp['boom'] or inp['beam'] or inp['start']:
            ps['phase'] = 'NAME'
            ps['name_char_idx'] = 0
            ps['name_chars'] = ps.get('name_chars') or [65, 65, 65]
            state.input_delay = 20
        elif inp['up']:
            if ps['active_player'] == 1:
                ps['active_player'] = 0
                ps['color_idx'] = 0
                ps['phase'] = 'COLOR'
                state.input_delay = 20
            elif not is_multi:
                ps['phase'] = 'DIFFICULTY'
                state.input_delay = 20

    elif ps['phase'] == 'NAME':
        if inp['up']:
            ps['name_chars'][ps['name_char_idx']] += 1
            if ps['name_chars'][ps['name_char_idx']] > 90:
                ps['name_chars'][ps['name_char_idx']] = 65
            state.input_delay = NAME_INPUT_DELAY
        elif inp['down']:
            ps['name_chars'][ps['name_char_idx']] -= 1
            if ps['name_chars'][ps['name_char_idx']] < 65:
                ps['name_chars'][ps['name_char_idx']] = 90
            state.input_delay = NAME_INPUT_DELAY
        elif inp['right'] or inp['boom'] or inp['beam'] or inp['start']:
            if ps['name_char_idx'] < 2:
                ps['name_char_idx'] += 1
                state.input_delay = 20
            else:
                _finalize_setup(state)
        elif inp['left']:
            if ps['name_char_idx'] > 0:
                ps['name_char_idx'] -= 1
                state.input_delay = 20
            else:
                ps['phase'] = 'COLOR'
                state.input_delay = 20


def handle_playing_input(state: GameState, p1: dict, p2: dict) -> None:
    """
    Handle input while in PLAYING state.
    Returns early if paused (only pause menu navigation continues).
    """
    # Pause toggle
    if p1.get('start_pressed') or p2.get('start_pressed'):
        state.is_paused = not state.is_paused
        state.input_delay = 20
        return

    if state.is_paused:
        _handle_pause_input(state, p1, p2)
        return

    # Round over / game over — any key to continue
    if state.is_round_over or state.is_game_over:
        any_key = any(p1[k] for k in ('up', 'down', 'left', 'right', 'boom', 'beam', 'boost'))
        if any_key:
            if state.is_game_over:
                state.screen = 'MENU'
                state.is_attract_mode = False
            else:
                start_new_round(state)
        return

    # Attract mode: any input breaks out
    if state.is_attract_mode:
        any_key = any(p1[k] for k in ('up', 'down', 'left', 'right', 'boom', 'beam', 'start', 'shield', 'boost'))
        if any_key:
            state.is_attract_mode = False
            state.screen = 'MENU'
            state.input_delay = 20
        return


def _handle_pause_input(state: GameState, p1: dict, p2: dict) -> None:
    """Navigate pause menu and execute selected option."""
    options = ['RESUME', 'RESTART', 'QUIT']

    if p1['up']:
        state.pause_menu_selection = (state.pause_menu_selection - 1 + len(options)) % len(options)
        state.input_delay = 10
    elif p1['down']:
        state.pause_menu_selection = (state.pause_menu_selection + 1) % len(options)
        state.input_delay = 10
    elif p1['boom'] or p1['beam'] or p1['start']:
        sel = options[state.pause_menu_selection]
        if sel == 'RESUME':
            state.is_paused = False
        elif sel == 'RESTART':
            state.is_paused = False
            start_new_round(state)
        elif sel == 'QUIT':
            state.is_paused = False
            state.screen = 'MENU'
        state.input_delay = 20


# ---------------------------------------------------------------------------
# Sudden death
# ---------------------------------------------------------------------------

def _handle_sudden_death(state: GameState) -> None:
    """Spawn random mines every 50 frames in sudden death."""
    if state.game_time > TIMING.SUDDEN_DEATH_TIME:
        return
    MAX_MINES = 12
    if len(state.mines) >= MAX_MINES:
        return
    if state.frame_count % 50 != 0:
        return

    rx = int(seeded_random() * (COLS - 2)) + 1
    ry = int(seeded_random() * (ROWS - 2)) + 1
    mine_x = float(MAZE_OFFSET_X + rx * CELL_SIZE)
    mine_y = float(ry * CELL_SIZE)

    for p in state.players:
        if p and abs(p.x - mine_x) < CELL_SIZE * 2 and abs(p.y - mine_y) < CELL_SIZE * 2:
            return
    for m in state.mines:
        if abs(m['x'] - mine_x) < CELL_SIZE * 1.5 and abs(m['y'] - mine_y) < CELL_SIZE * 1.5:
            return

    state.mines.append({
        'x': mine_x, 'y': mine_y,
        'active': True,
        'dropped_at': state.frame_count,
        'vis_x': 0, 'vis_y': 0,
        'owner': -1,
    })


# ---------------------------------------------------------------------------
# Wall color helper
# ---------------------------------------------------------------------------

def _get_wall_color(state: GameState) -> tuple:
    """Return (r,g,b) colour based on remaining game time (green→cyan→blue)."""
    ratio = max(0.0, min(1.0, state.game_time / state.max_game_time)) if state.max_game_time > 0 else 0.0
    hue = int(ratio * 180)
    return hsl_to_rgb(hue, 100, 50)


# ---------------------------------------------------------------------------
# Game render
# ---------------------------------------------------------------------------

def render_playing(renderer, state: GameState) -> None:
    """
    Render the PLAYING state: maze walls, goals, portals, ammo crate,
    mines, projectiles, players, particles, HUD, overlays.
    Mirrors JS renderGame().
    """
    renderer.begin_frame()

    wall_color = _get_wall_color(state)
    fc = state.frame_count

    # Camera shake
    cam = state.camera
    renderer.set_camera(int(cam.x), int(cam.y))

    # Maze walls
    for cell in state.maze:
        x = cell.c * CELL_SIZE + MAZE_OFFSET_X
        y = cell.r * CELL_SIZE

        draw_corner = cell.walls[0] or cell.walls[3]
        if not draw_corner:
            left = grid_index(state.maze, cell.c - 1, cell.r)
            top = grid_index(state.maze, cell.c, cell.r - 1)
            if left and left.walls[0]:
                draw_corner = True
            if top and top.walls[3]:
                draw_corner = True

        if draw_corner:
            renderer.set_pixel(x, y, wall_color)
        if cell.walls[0]:
            renderer.set_pixel(x + 1, y, wall_color)
            renderer.set_pixel(x + 2, y, wall_color)
        if cell.walls[3]:
            renderer.set_pixel(x, y + 1, wall_color)
            renderer.set_pixel(x, y + 2, wall_color)

        # Right border cells
        if cell.c == COLS - 1:
            if cell.walls[1] or cell.walls[0]:
                renderer.set_pixel(x + 3, y, wall_color)
            if cell.walls[1]:
                renderer.set_pixel(x + 3, y + 1, wall_color)
                renderer.set_pixel(x + 3, y + 2, wall_color)
        # Bottom border cells
        if cell.r == ROWS - 1:
            if cell.walls[2] or cell.walls[3]:
                renderer.set_pixel(x, y + 3, wall_color)
            if cell.walls[2]:
                renderer.set_pixel(x + 1, y + 3, wall_color)
                renderer.set_pixel(x + 2, y + 3, wall_color)
        if cell.c == COLS - 1 and cell.r == ROWS - 1:
            renderer.set_pixel(x + 3, y + 3, wall_color)

    # Goals — blink every 12 frames
    gc = (255, 255, 255) if (fc // 12) % 2 == 0 else (68, 68, 68)
    for p in state.players:
        if p:
            gx = MAZE_OFFSET_X + p.goal_c * CELL_SIZE + 1
            gy = p.goal_r * CELL_SIZE + 1
            renderer.set_pixel(gx, gy, gc)
            renderer.set_pixel(gx + 1, gy, gc)
            renderer.set_pixel(gx, gy + 1, gc)
            renderer.set_pixel(gx + 1, gy + 1, gc)

    # Portals — rotating center animation
    if (fc % 30) == 0:
        state.portal_reverse_colors = not state.portal_reverse_colors
    for idx, portal in enumerate(state.portals or []):
        tx = int(portal['x'] - 1.5)
        ty = int(portal['y'] - 1.5)
        # Use cyan/blue alternating
        out_color = (0, 170, 255) if ((idx == 0) != state.portal_reverse_colors) else (0, 0, 255)
        perimeter = [(1, 0), (2, 0), (0, 1), (3, 1), (0, 2), (3, 2), (1, 3), (2, 3)]
        for dx, dy in perimeter:
            renderer.set_pixel(tx + dx, ty + dy, out_color)
        center_seq = [(1, 1), (2, 1), (2, 2), (1, 2)]
        tick = fc // 6
        active_idx = tick % 4
        for ci, (cdx, cdy) in enumerate(center_seq):
            if ci == active_idx:
                renderer.set_pixel(tx + cdx, ty + cdy, (255, 255, 255))
            elif ci == (active_idx - 1) % 4:
                renderer.set_pixel(tx + cdx, ty + cdy, (96, 96, 96))
            else:
                renderer.set_pixel(tx + cdx, ty + cdy, (0, 0, 0))

    # Ammo crate — rotating single LED
    if state.ammo_crate:
        atx = state.ammo_crate['x']
        aty = state.ammo_crate['y']
        crate_seq = [(0, 1), (1, 1), (1, 0), (0, 0)]
        tick = fc // 6
        active_idx = tick % 4
        for ci, (cdx, cdy) in enumerate(crate_seq):
            col = (255, 255, 255) if ci == active_idx else (0, 255, 21)
            renderer.set_pixel(atx + cdx, aty + cdy, col)

    # Mines — flash red/dark
    for m in state.mines:
        color = (255, 0, 0) if (m.get('active') and fc % 12 < 6) else (68, 68, 68)
        renderer.set_pixel(m['x'] + m.get('vis_x', 0), m['y'] + m.get('vis_y', 0), color)

    # Projectiles — rectangular beam shape
    import math as _math
    for proj in state.projectiles:
        vx, vy = proj.get('vx', 0), proj.get('vy', 0)
        mag = _math.hypot(vx, vy)
        if mag == 0:
            continue
        from config import C_BEAM_LENGTH, C_BEAM_WIDTH
        nx, ny = vx / mag, vy / mag
        px_n, py_n = -ny, nx
        half_len = C_BEAM_LENGTH / 2
        half_w = C_BEAM_WIDTH / 2
        scan_r = half_len + 3
        min_x = int(proj['x'] - scan_r)
        max_x = int(proj['x'] + scan_r)
        min_y = int(proj['y'] - scan_r)
        max_y = int(proj['y'] + scan_r)
        proj_color = (255, 255, 255) if fc % 4 < 2 else renderer.parse_color(proj.get('color', '#ffffff'))
        for py in range(min_y, max_y + 1):
            for bx in range(min_x, max_x + 1):
                ddx = bx - proj['x']
                ddy = py - proj['y']
                dist_len = abs(ddx * nx + ddy * ny)
                dist_w = abs(ddx * px_n + ddy * py_n)
                if dist_len <= half_len and dist_w <= half_w:
                    renderer.set_pixel(bx, py, proj_color)

    # Players
    for p in state.players:
        if not p or p.is_dead:
            continue

        # Beam trail (fade out)
        for k in range(min(8, len(p.beam_pixels))):
            i = int(p.beam_idx) - k
            if 0 <= i < len(p.beam_pixels):
                bp = p.beam_pixels[i]
                renderer.set_pixel(int(bp['x']), int(bp['y']), p.color)

        # Charge aura
        if p.is_charging and p.charge_start_time is not None:
            r_frac = min(1.0, (fc - p.charge_start_time) / TIMING.CHARGE_DURATION)
            h = int((1 - r_frac) * 120)
            cc = hsl_to_rgb(h, 100, 50)
            sx, sy = int(p.x) - 1, int(p.y) - 1
            perim = [(1, 0), (2, 0), (3, 1), (3, 2), (2, 3), (1, 3), (0, 2), (0, 1)]
            n = int(8 * r_frac)
            for i in range(n):
                renderer.set_pixel(sx + perim[i][0], sy + perim[i][1], cc)

        # Shield
        if p.shield_active:
            sx, sy = int(p.x) - 1, int(p.y) - 1
            perim = [(1, 0), (2, 0), (3, 1), (3, 2), (2, 3), (1, 3), (0, 2), (0, 1)]
            for dx, dy in perim:
                renderer.set_pixel(sx + dx, sy + dy, (136, 136, 255))

        # Boost trail
        from config import BASE_SPEED
        if p.boost_energy > 0 and p.current_speed > BASE_SPEED:
            p_color = renderer.parse_color(p.color)
            for trail_pt in p.trail:
                renderer.set_pixel(int(trail_pt['x']), int(trail_pt['y']), p_color)

        # Glitch / stun
        import random as _random
        if p.glitch_is_active(fc) or p.stun_is_active(fc):
            rx = _random.randint(-1, 1)
            ry = _random.randint(-1, 1)
            _draw_player_body(renderer, p.x + rx, p.y + ry, (255, 0, 0))
            cx = _random.randint(-1, 1)
            cy = _random.randint(-1, 1)
            _draw_player_body(renderer, p.x + cx, p.y + cy, (0, 255, 255))
            if _random.random() > 0.8:
                _draw_player_body(renderer, p.x, p.y, (255, 255, 255))
            if p.stun_is_active(fc):
                flash = (68, 68, 68) if (fc // 2) % 2 == 0 else (255, 255, 255)
                _draw_player_body(renderer, p.x, p.y, flash)
        else:
            p_col = p.color
            if p.boost_energy < 25 and (fc // 6) % 2 == 0:
                p_col = '#555555'
            _draw_player_body(renderer, p.x, p.y, p_col)

    # Particles
    for part in state.particles:
        renderer.set_pixel(int(part['x']), int(part['y']), part['color'])

    # Reset camera for HUD
    renderer.set_camera(0, 0)

    # HUD
    render_hud(renderer, state, wall_color)

    # Overlays (pause, game over, round over, attract)
    render_game_overlay(renderer, state)

    renderer.end_frame()


def _draw_player_body(renderer, x, y, color) -> None:
    """Draw 2×2 player body sprite."""
    renderer.set_pixel(int(x), int(y), color)
    renderer.set_pixel(int(x) + 1, int(y), color)
    renderer.set_pixel(int(x), int(y) + 1, color)
    renderer.set_pixel(int(x) + 1, int(y) + 1, color)


# ---------------------------------------------------------------------------
# Main game loop
# ---------------------------------------------------------------------------

def run(mock: bool = False) -> None:
    """
    Fixed-timestep main loop.
    Uses accumulator pattern; caps delta to 0.25 s to prevent spiral of death.
    """
    global _running

    renderer = Renderer(use_hardware=not mock)
    input_handler = InputHandler()
    state = GameState()

    # Ensure players exist (CPU vs CPU for attract mode bootstrap)
    state.players[0] = Player(0, name='CPU', color=COLORS[0])
    state.players[1] = Player(1, name='CPU', color=COLORS[1])

    IDLE_THRESHOLD_S = TIMING.IDLE_THRESHOLD / 1000.0

    last_time = time.monotonic()
    accumulator = 0.0

    while _running and state.running:
        now = time.monotonic()
        delta = now - last_time
        last_time = now

        # Cap delta to avoid spiral of death
        if delta > 0.25:
            delta = 0.25
        accumulator += delta

        # Poll input once per real-time tick
        p1, p2, any_input = input_handler.poll()

        # Fixed-step update loop
        while accumulator >= FIXED_STEP:
            accumulator -= FIXED_STEP
            _update(state, p1, p2, any_input, input_handler, mock)

        # Render
        _render(renderer, state)

        # Frame pacing — sleep remaining time in step
        elapsed = time.monotonic() - now
        sleep_time = FIXED_STEP - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

    # Cleanup
    input_handler.cleanup() if hasattr(input_handler, 'cleanup') else None
    state.running = False


def _update(state: GameState, p1: dict, p2: dict, any_input: bool,
            input_handler: InputHandler, mock: bool) -> None:
    """
    Single fixed-timestep update — mirrors JS update().
    """
    IDLE_THRESHOLD_S = TIMING.IDLE_THRESHOLD / 1000.0

    # Input delay countdown
    if state.input_delay > 0:
        state.input_delay -= 1

    screen = state.screen

    # Update frame counter (always)
    state.frame_count += 1
    clear_los_cache(state.frame_count)

    if state.input_delay > 0 and screen not in ('MENU', 'PLAYING'):
        return

    # ---- Screen dispatch ----
    if screen == 'MENU':
        # Attract mode trigger
        idle_s = time.monotonic() - input_handler.last_input_time
        if idle_s > IDLE_THRESHOLD_S and not state.is_attract_mode:
            state.is_attract_mode = True
            state.game_mode = 'MULTI'
            state.players[0] = Player(0, name='CPU', color=COLORS[0])
            state.players[1] = Player(1, name='CPU', color=COLORS[1])
            _init_player_setup(state)
            state.player_setup['difficulty_idx'] = 3  # INSANE
            _finalize_setup(state)
            return

        if state.input_delay == 0:
            handle_menu_input(state, p1, p2)
        update_particles(state)
        return

    if screen == 'PLAYER_SETUP':
        if state.input_delay == 0:
            handle_setup_input(state, p1, p2)
        return

    if screen == 'HIGHSCORES':
        if state.input_delay == 0:
            handle_highscore_input(state, p1, p2)
        return

    # ---- PLAYING ----
    if screen != 'PLAYING':
        return

    if state.input_delay == 0:
        handle_playing_input(state, p1, p2)

    # Attract mode breaks on any input
    if state.is_attract_mode and any_input:
        state.is_attract_mode = False
        state.screen = 'MENU'
        state.input_delay = 20
        return

    if state.is_paused:
        return

    # Scroll for game-over/round-over messages
    if state.is_game_over or state.is_round_over:
        update_particles(state)
        state.scroll_x -= 0.5
        msg = state.messages
        msg_len = len(msg.get('taunt', '') if state.is_game_over else msg.get('round', ''))
        if state.scroll_x < -(msg_len * 4.5):
            state.scroll_x = float(LOGICAL_W)

        if state.is_attract_mode:
            state.demo_reset_timer = getattr(state, 'demo_reset_timer', 0) - 1
            if state.demo_reset_timer <= 0:
                if state.is_game_over:
                    start_new_match(state)
                else:
                    start_new_round(state)
        return

    # Death timer countdown
    if state.death_timer > 0:
        state.death_timer -= 1
        update_projectiles(state)
        update_particles(state)
        if state.death_timer <= 0:
            _finalize_round(state)
        return

    # Normal gameplay
    update_projectiles(state)

    # Handle timeout
    if state.game_time is not None and state.game_time <= 0:
        resolve_round(state, None, 'TIMEOUT')
        return

    if state.game_time is not None:
        state.game_time -= 1

    _handle_sudden_death(state)

    # Update mines arm status + ammo crate spawning
    if should_spawn_ammo_crate(state):
        state.ammo_crate = create_ammo_crate(state.maze)
    update_mines(state)

    check_beam_collisions(state)

    # Per-player actions
    for idx, p in enumerate(state.players):
        if p is None:
            continue
        check_crate(state, p)
        check_portal_actions(state, p)
        check_boost_trail(p)
        check_beam_actions(state, p, idx)
        check_mines_actions(state, p)

        # Determine input
        if state.is_attract_mode:
            opponent = state.players[(idx + 1) % 2]
            cmd = get_cpu_input(p, opponent, state)
        elif state.game_mode == 'SINGLE':
            if idx == 0:
                cmd = p1
            else:
                opponent = state.players[0]
                cmd = get_cpu_input(p, opponent, state)
        else:
            # LOCAL MULTI
            cmd = p1 if idx == 0 else p2

        apply_player_actions(state, p, cmd)

    update_particles(state)

    # Update camera shake
    state.camera.update()


def _finalize_round(state: GameState) -> None:
    """Finalize a round after death timer expires."""
    if state.is_draw:
        resolve_round(state, None, 'DRAW')
    else:
        winner_idx = 1 if state.victim_idx == 0 else 0
        resolve_round(state, winner_idx, 'COMBAT')


def _render(renderer: Renderer, state: GameState) -> None:
    """Dispatch rendering based on current screen."""
    screen = state.screen

    # render_playing manages its own begin/end_frame; all other screens share one.
    if screen == 'PLAYING':
        render_playing(renderer, state)
        return

    renderer.begin_frame()
    renderer.set_camera(0, 0)

    if screen == 'MENU':
        render_menu(renderer, state)
    elif screen == 'PLAYER_SETUP':
        render_player_setup(renderer, state)
    elif screen == 'HIGHSCORES':
        render_high_scores(renderer, state)

    renderer.end_frame()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Maze Battlegrounds LED Matrix Game')
    parser.add_argument('--mock', action='store_true',
                        help='Run in mock mode (no hardware required)')
    args = parser.parse_args()
    run(mock=args.mock)
