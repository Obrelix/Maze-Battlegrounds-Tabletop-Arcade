# pi/classes.py
# Game entity classes ported from docs/js/classes.js
# SoundFX is browser-only (Web Audio API) and is intentionally omitted.

import random as _random
from config import MAX_MINES, MAX_ENERGY, BASE_SPEED, TIMING


class Cell:
    """Maze cell — mirrors JS Cell class."""
    __slots__ = ('c', 'r', 'walls', 'visited', 'parent', 'bfs_visited', 'gCost')

    def __init__(self, c: int, r: int) -> None:
        self.c = c
        self.r = r
        self.walls = [True, True, True, True]  # [N, E, S, W]
        self.visited = False
        self.parent = None
        self.bfs_visited = False
        self.gCost = float('inf')  # A* cost — reset before each pathfinding call


class Camera:
    """Camera with shake effect — mirrors JS Camera class."""
    __slots__ = ('x', 'y', 'shake_strength', 'shake_damp')

    def __init__(self) -> None:
        self.x = 0.0
        self.y = 0.0
        self.shake_strength = 0.0
        self.shake_damp = 0.9

    def shake(self, amount: float) -> None:
        """Set shake strength (matches JS camera.shake(amount))."""
        self.shake_strength = amount

    def update(self) -> None:
        """Advance shake one frame — matches JS Camera.update()."""
        if self.shake_strength > 0.5:
            self.x = (_random.random() - 0.5) * self.shake_strength
            self.y = (_random.random() - 0.5) * self.shake_strength
            self.shake_strength *= self.shake_damp
        else:
            self.x = 0.0
            self.y = 0.0
            self.shake_strength = 0.0


class Player:
    """
    Player entity — mirrors JS Player class.

    Constructor arguments:
      id       -- integer player id (required)
      name     -- display name string (default 'CPU')
      color    -- color value / Color object (default None)
      controls -- input map dict (default None)
      x, y     -- initial position (default 0.0)
      size     -- hitbox size (default 2.0)
    """
    # Use __slots__ to keep attribute layout explicit and lean.
    __slots__ = (
        'id', 'name', 'color', 'controls',
        'size', 'score', 'goal_c', 'goal_r',
        'x', 'y',
        # Per-round state (reset by reset_state)
        'mines_left', 'last_mine_time', 'last_boost_time',
        'trail', 'boost_energy', 'boost_cooldown',
        'portal_cooldown', 'portal_invuln_frames',
        'shield_active', 'current_speed', 'prev_detonate_key',
        'beam_pixels', 'beam_idx',
        'is_charging', 'charge_start_time',
        'glitch_start_time', 'stun_start_time',
        'bot_path', 'bot_next_cell', 'bot_retarget_timer',
        'force_unstuck_timer', 'stuck_counter',
        'is_dead', 'ai',
        # AI memory
        'last_pos', 'last_dir', 'unstuck_dir',
        'ai_mental_model', 'ai_frame_counter',
        'confusion_timer', 'confused_dir',
        'direction_history', '_suggested_mine_pos',
    )

    def __init__(
        self,
        id: int,
        name: str = 'CPU',
        color=None,
        controls=None,
        x: float = 0.0,
        y: float = 0.0,
        size: float = 2.0,
    ) -> None:
        self.id = id
        self.name = name
        self.color = color
        self.controls = controls
        self.size = size
        self.score = 0
        self.goal_c = 0
        self.goal_r = 0
        self.x = x
        self.y = y
        self.reset_state()

    def reset_state(self) -> None:
        """
        Reset all per-round state.  Score is intentionally NOT reset.
        Mirrors JS Player.resetState().
        """
        self.mines_left = MAX_MINES
        self.last_mine_time = 0
        self.last_boost_time = 0
        self.trail = []
        self.boost_energy = MAX_ENERGY
        self.boost_cooldown = 0
        self.portal_cooldown = 0
        self.portal_invuln_frames = 0
        self.shield_active = False
        self.current_speed = BASE_SPEED
        self.prev_detonate_key = False
        self.beam_pixels = []
        self.beam_idx = 0
        self.is_charging = False
        self.charge_start_time = None  # None = not currently charging
        self.glitch_start_time = 0
        self.stun_start_time = 0
        self.bot_path = []
        self.bot_next_cell = None
        self.bot_retarget_timer = 0
        self.force_unstuck_timer = 0
        self.stuck_counter = 0
        self.is_dead = False
        self.ai = None
        # AI memory
        self.last_pos = {'x': 0.0, 'y': 0.0}
        self.last_dir = {'x': 0.0, 'y': 0.0}
        self.unstuck_dir = {'x': 0.0, 'y': 0.0}
        self.ai_mental_model = None
        self.ai_frame_counter = 0
        self.confusion_timer = 0
        self.confused_dir = None
        self.direction_history = []
        self._suggested_mine_pos = None

    # ------------------------------------------------------------------
    # Timing helpers — all mirror the JS equivalents
    # ------------------------------------------------------------------

    def glitch_remaining(self, frame: int) -> int:
        """Frames remaining in current glitch effect."""
        time_diff = frame - self.glitch_start_time
        return TIMING.GLITCH_DURATION - time_diff

    def glitch_is_active(self, frame: int) -> bool:
        """True if player is currently glitching."""
        if self.glitch_start_time != 0:
            time_diff = frame - self.glitch_start_time
            return time_diff < TIMING.GLITCH_DURATION
        return False

    def stun_remaining(self, frame: int) -> int:
        """Frames remaining in current stun."""
        time_diff = frame - self.stun_start_time
        return TIMING.STUN_DURATION - time_diff

    def stun_is_active(self, frame: int) -> bool:
        """True if player is currently stunned."""
        if self.stun_start_time != 0:
            time_diff = frame - self.stun_start_time
            return time_diff < TIMING.STUN_DURATION
        return False

    def charge_is_ready(self, frame: int) -> bool:
        """True if charged beam has been held for CHARGE_DURATION frames.

        Note: charge_start_time=None means charging hasn't begun.
        When charge_start_time is an integer (including 0), the elapsed
        frame count is evaluated arithmetically, matching the test spec.
        """
        if self.charge_start_time is not None:
            time_diff = frame - self.charge_start_time
            return time_diff >= TIMING.CHARGE_DURATION
        return False
