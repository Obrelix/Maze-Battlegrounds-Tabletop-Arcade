# pi/input_handler.py
# USB gamepad and keyboard input polling via pygame.
# Ported from docs/js/input.js

import time

from config import TIMING, GAMEPAD_BUTTONS, GAMEPAD_THRESH

# ---------------------------------------------------------------------------
# Pygame import (optional — graceful mock when unavailable)
# ---------------------------------------------------------------------------
try:
    import pygame as _pygame
    _HAS_PYGAME = True
except ImportError:
    _pygame = None  # type: ignore
    _HAS_PYGAME = False

# ---------------------------------------------------------------------------
# Keyboard scancode mapping
# ---------------------------------------------------------------------------
# Maps the config key names to pygame key constants (K_* values).
# These are evaluated lazily so that we don't fail at import time when pygame
# is unavailable.
_KEY_MAP = None

def _build_key_map():
    """Build key name → pygame constant mapping on first use."""
    global _KEY_MAP
    if _KEY_MAP is not None or not _HAS_PYGAME:
        return
    K = _pygame
    _KEY_MAP = {
        # P1 keys
        'KeyW':         K.K_w,
        'KeyS':         K.K_s,
        'KeyA':         K.K_a,
        'KeyD':         K.K_d,
        'KeyR':         K.K_r,
        'KeyF':         K.K_f,
        'KeyE':         K.K_e,
        'KeyG':         K.K_g,
        'Space':        K.K_SPACE,
        # P2 keys
        'ArrowUp':      K.K_UP,
        'ArrowDown':    K.K_DOWN,
        'ArrowLeft':    K.K_LEFT,
        'ArrowRight':   K.K_RIGHT,
        'KeyI':         K.K_i,
        'KeyK':         K.K_k,
        'KeyO':         K.K_o,
        'KeyL':         K.K_l,
        'Enter':        K.K_RETURN,
        # Shared
        'KeyStart':     K.K_ESCAPE,   # mapped per spec; also escape → P1 start
        'KeySelect':    K.K_BACKSPACE,
    }

# P1 / P2 action → config key name mappings (matches CONTROLS_P1 / P2 in config.py)
_P1_KEYS = {
    'up':     'KeyW',
    'down':   'KeyS',
    'left':   'KeyA',
    'right':  'KeyD',
    'shield': 'KeyR',
    'beam':   'KeyF',
    'mine':   'KeyE',
    'boost':  'KeyG',
    'boom':   'Space',
    'start':  'KeyStart',
    'select': 'KeySelect',
}

_P2_KEYS = {
    'up':     'ArrowUp',
    'down':   'ArrowDown',
    'left':   'ArrowLeft',
    'right':  'ArrowRight',
    'shield': 'KeyI',
    'beam':   'KeyK',
    'mine':   'KeyO',
    'boost':  'KeyL',
    'boom':   'Enter',
    'start':  'KeyStart',
    'select': 'KeySelect',
}

_ACTIONS = ('up', 'down', 'left', 'right', 'shield', 'beam', 'mine', 'boost', 'boom', 'start', 'select')

def _empty_input() -> dict:
    return {a: False for a in _ACTIONS} | {'start_pressed': False}


# ---------------------------------------------------------------------------
# InputHandler
# ---------------------------------------------------------------------------

class InputHandler:
    """
    Polls keyboard and up to two USB gamepads each frame.

    Usage
    -----
    handler = InputHandler()
    p1, p2, any_input = handler.poll()
    ...
    handler.cleanup()
    """

    def __init__(self):
        self.last_input_time: float = time.monotonic()
        # Previous start-button state for edge detection (per player index)
        self._prev_start: list = [False, False]

        if _HAS_PYGAME:
            _pygame.init()
            # Pygame on Linux requires a display surface to pump joystick events.
            # Create a tiny hidden surface (works even with SDL_VIDEODRIVER=dummy).
            try:
                _pygame.display.set_mode((1, 1))
            except Exception:
                pass
            _pygame.joystick.init()
            _build_key_map()
            # Initialise up to two joysticks
            self._joysticks = []
            for i in range(min(_pygame.joystick.get_count(), 2)):
                j = _pygame.joystick.Joystick(i)
                j.init()
                self._joysticks.append(j)
        else:
            self._joysticks = []

    # ------------------------------------------------------------------

    def poll(self) -> tuple:
        """
        Process pending events and return current input state.

        Returns
        -------
        (p1_input, p2_input, any_input) where each p*_input is a dict
        with keys: up, down, left, right, shield, beam, mine, boost, boom,
                   start, select, start_pressed
        and any_input is True if any control is active.
        """
        if not _HAS_PYGAME:
            return _empty_input(), _empty_input(), False

        # Drain the event queue (required for joystick state to update)
        for event in _pygame.event.get():
            if event.type == _pygame.QUIT:
                pass  # Let the caller decide what to do

        keys = _pygame.key.get_pressed()

        p1 = self._keyboard_input(keys, _P1_KEYS)
        p2 = self._keyboard_input(keys, _P2_KEYS)

        # Escape key → P1 start
        if _KEY_MAP and keys[_pygame.K_ESCAPE]:
            p1['start'] = True

        # Merge gamepad input
        if len(self._joysticks) >= 1:
            self._merge_gamepad(p1, self._joysticks[0])
        if len(self._joysticks) >= 2:
            self._merge_gamepad(p2, self._joysticks[1])

        # Edge-detect start/select buttons (both work as pause)
        for idx, inp in enumerate((p1, p2)):
            cur_start = inp['start'] or inp.get('select', False)
            inp['start_pressed'] = cur_start and not self._prev_start[idx]
            self._prev_start[idx] = cur_start

        # Track last input time
        any_input = any(
            v for v in list(p1.values()) + list(p2.values())
            if isinstance(v, bool) and v
        )
        if any_input:
            self.last_input_time = time.monotonic()

        return p1, p2, any_input

    # ------------------------------------------------------------------

    def _keyboard_input(self, keys, key_map: dict) -> dict:
        """Build an input dict from the current keyboard state."""
        inp = _empty_input()
        if _KEY_MAP is None:
            return inp
        for action, key_name in key_map.items():
            pygame_key = _KEY_MAP.get(key_name)
            if pygame_key is not None and keys[pygame_key]:
                inp[action] = True
        return inp

    def _merge_gamepad(self, inp: dict, joy) -> None:
        """Merge joystick state into *inp* dict (in-place)."""
        # D-pad via hat
        if joy.get_numhats() > 0:
            hat_x, hat_y = joy.get_hat(0)
            if hat_x < 0:
                inp['left'] = True
            elif hat_x > 0:
                inp['right'] = True
            if hat_y > 0:
                inp['up'] = True
            elif hat_y < 0:
                inp['down'] = True

        # Analog stick (axis 0 = X, axis 1 = Y)
        if joy.get_numaxes() >= 2:
            ax = joy.get_axis(0)
            ay = joy.get_axis(1)
            if ax < -GAMEPAD_THRESH:
                inp['left'] = True
            elif ax > GAMEPAD_THRESH:
                inp['right'] = True
            if ay < -GAMEPAD_THRESH:
                inp['up'] = True
            elif ay > GAMEPAD_THRESH:
                inp['down'] = True

        # Buttons
        num_buttons = joy.get_numbuttons()
        for action, btn_idx in GAMEPAD_BUTTONS.items():
            if btn_idx < num_buttons and joy.get_button(btn_idx):
                inp[action] = True

    # ------------------------------------------------------------------

    def is_idle(self) -> bool:
        """Return True if no input has been received for IDLE_THRESHOLD ms."""
        elapsed_ms = (time.monotonic() - self.last_input_time) * 1000
        return elapsed_ms > TIMING.IDLE_THRESHOLD

    def cleanup(self) -> None:
        """Release pygame resources."""
        if _HAS_PYGAME:
            _pygame.quit()
