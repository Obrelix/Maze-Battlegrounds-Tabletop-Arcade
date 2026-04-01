# pi/renderer.py
# LED matrix renderer with hardware/mock support.
# Mirrors the drawing primitives used in docs/js/renderer.js.

from config import LOGICAL_W, LOGICAL_H, hex_to_rgb

# ---------------------------------------------------------------------------
# Hardware availability flag
# ---------------------------------------------------------------------------
HAS_MATRIX = False
try:
    from rgbmatrix import RGBMatrix, RGBMatrixOptions, graphics  # type: ignore
    HAS_MATRIX = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Mock classes — used when rgbmatrix is unavailable
# ---------------------------------------------------------------------------

class MockCanvas:
    """In-memory pixel buffer that mirrors the rgbmatrix FrameCanvas API."""

    def __init__(self, width=LOGICAL_W, height=LOGICAL_H):
        self.width = width
        self.height = height
        self._pixels: dict = {}

    def SetPixel(self, x: int, y: int, r: int, g: int, b: int) -> None:  # noqa: N802
        if 0 <= x < self.width and 0 <= y < self.height:
            self._pixels[(x, y)] = (r, g, b)

    def Clear(self) -> None:  # noqa: N802
        self._pixels.clear()


class MockMatrix:
    """Minimal stand-in for RGBMatrix."""

    def __init__(self, width=LOGICAL_W, height=LOGICAL_H):
        self.width = width
        self.height = height
        self._canvas = MockCanvas(width, height)

    def CreateFrameCanvas(self):  # noqa: N802
        return MockCanvas(self.width, self.height)

    def SwapOnVSync(self, canvas):  # noqa: N802
        # Copy pixels from the new canvas to the backing store so tests can
        # inspect the last rendered frame via matrix._canvas.
        self._canvas._pixels = dict(canvas._pixels)
        return canvas


# ---------------------------------------------------------------------------
# Renderer
# ---------------------------------------------------------------------------

class Renderer:
    """
    Manages the LED matrix and provides drawing primitives.

    Parameters
    ----------
    use_hardware : bool
        When True (default), attempt to initialise a real RGBMatrix.
        When False, always use the mock implementation.
    """

    def __init__(self, use_hardware: bool = True):
        self._cam_x: int = 0
        self._cam_y: int = 0

        if use_hardware and HAS_MATRIX:
            options = RGBMatrixOptions()
            options.rows = 64
            options.cols = 128
            options.chain_length = 1
            options.parallel = 1
            options.hardware_mapping = 'adafruit-hat'
            options.gpio_slowdown = 4
            options.brightness = 80
            options.disable_hardware_pulsing = True
            self._matrix = RGBMatrix(options=options)
        else:
            self._matrix = MockMatrix(LOGICAL_W, LOGICAL_H)

        self._canvas = self._matrix.CreateFrameCanvas()

    # ------------------------------------------------------------------
    # Frame management
    # ------------------------------------------------------------------

    def begin_frame(self) -> None:
        """Clear the off-screen canvas to black."""
        self._canvas.Clear()

    def end_frame(self) -> None:
        """Swap the off-screen canvas to the display."""
        self._canvas = self._matrix.SwapOnVSync(self._canvas)

    # ------------------------------------------------------------------
    # Camera
    # ------------------------------------------------------------------

    def set_camera(self, cam_x: float, cam_y: float) -> None:
        """Set the integer pixel offset applied by set_pixel."""
        self._cam_x = int(cam_x)
        self._cam_y = int(cam_y)

    # ------------------------------------------------------------------
    # Pixel drawing
    # ------------------------------------------------------------------

    def set_pixel(self, x: int, y: int, color) -> None:
        """Draw a pixel with the current camera offset applied."""
        px = int(x) + self._cam_x
        py = int(y) + self._cam_y
        if 0 <= px < LOGICAL_W and 0 <= py < LOGICAL_H:
            r, g, b = self.parse_color(color)
            self._canvas.SetPixel(px, py, r, g, b)

    def set_pixel_no_cam(self, x: int, y: int, color) -> None:
        """Draw a pixel without applying the camera offset (for HUD elements)."""
        px = int(x)
        py = int(y)
        if 0 <= px < LOGICAL_W and 0 <= py < LOGICAL_H:
            r, g, b = self.parse_color(color)
            self._canvas.SetPixel(px, py, r, g, b)

    # ------------------------------------------------------------------
    # Color parsing
    # ------------------------------------------------------------------

    def parse_color(self, color_input) -> tuple:
        """
        Convert a variety of color representations to an (r, g, b) tuple.

        Accepts:
          - (r, g, b) tuple / list
          - '#rrggbb' or '#rrggbbaa' hex string
          - A Color object (has .rgb attribute)
          - An integer 0xRRGGBB
        """
        if isinstance(color_input, (tuple, list)) and len(color_input) >= 3:
            return (int(color_input[0]), int(color_input[1]), int(color_input[2]))
        if isinstance(color_input, str):
            return hex_to_rgb(color_input)
        if hasattr(color_input, 'rgb'):
            return color_input.rgb
        if isinstance(color_input, int):
            r = (color_input >> 16) & 0xFF
            g = (color_input >> 8) & 0xFF
            b = color_input & 0xFF
            return (r, g, b)
        # Fallback: white
        return (255, 255, 255)

    # ------------------------------------------------------------------
    # Drawing primitives
    # ------------------------------------------------------------------

    def fill_rect(self, x: int, y: int, w: int, h: int, color) -> None:
        """Draw a filled rectangle using the current camera offset."""
        r, g, b = self.parse_color(color)
        for dy in range(h):
            for dx in range(w):
                px = int(x) + dx + self._cam_x
                py = int(y) + dy + self._cam_y
                if 0 <= px < LOGICAL_W and 0 <= py < LOGICAL_H:
                    self._canvas.SetPixel(px, py, r, g, b)

    def alpha_blend(self, fg, alpha: float, bg=(0, 0, 0)) -> tuple:
        """
        Alpha-blend foreground *fg* over background *bg*.

        Parameters
        ----------
        fg    : colour accepted by parse_color
        alpha : float in [0.0, 1.0]
        bg    : colour accepted by parse_color (default black)

        Returns
        -------
        (r, g, b) blended tuple
        """
        fr, fg_, fb = self.parse_color(fg)
        br, bg_, bb = self.parse_color(bg)
        a = max(0.0, min(1.0, alpha))
        r = int(fr * a + br * (1.0 - a))
        g = int(fg_ * a + bg_ * (1.0 - a))
        b = int(fb * a + bb * (1.0 - a))
        return (r, g, b)
