"""Small Canvas drawing API for Python programs running in PYJS."""
import math
from time import perf_counter

import _pyjs_canvas as bridge
from pyodide.ffi import create_proxy
from pyodide.ffi.wrappers import clear_interval, set_interval

_canvases = {}
_serial = 0


class Canvas:
    """Pixel coordinates: x points right, y points down. Angles are degrees."""

    def __init__(self, width=600, height=360, title="Python Canvas"):
        global _serial
        if any(type(n) is not int or not 100 <= n <= 2000 for n in (width, height)):
            raise ValueError("Canvas dimensions must be integers between 100 and 2000.")
        _serial += 1
        self.width, self.height = width, height
        self._id = f"py-canvas-{_serial}"
        self._closed = False
        self._events = {}
        self._sliders = {}
        self._timer = None
        self._animation = None
        self._fps = 60
        self._proxy = create_proxy(self._event)
        self._ctx = bridge.create(self._id, str(title), width, height, self._proxy)
        _canvases[self._id] = self

    def clear(self, color=None):
        if self._closed:
            return
        self._ctx.clearRect(0, 0, self.width, self.height)
        if color is not None:
            self._ctx.fillStyle = str(color)
            self._ctx.fillRect(0, 0, self.width, self.height)
        bridge.present(self._id)

    def circle(self, x, y, radius, color="royalblue"):
        if self._closed:
            return
        if radius < 0:
            raise ValueError("Circle radius must not be negative.")
        ctx = self._ctx
        ctx.fillStyle = str(color)
        ctx.beginPath()
        ctx.arc(float(x), float(y), float(radius), 0, 2 * math.pi)
        ctx.fill()
        bridge.present(self._id)

    def rectangle(self, x, y, width, height, color="purple", angle=0):
        if self._closed:
            return
        ctx = self._ctx
        ctx.save()
        try:
            ctx.translate(float(x + width / 2), float(y + height / 2))
            ctx.rotate(math.radians(angle))
            ctx.fillStyle = str(color)
            ctx.fillRect(float(-width / 2), float(-height / 2), float(width), float(height))
        finally:
            ctx.restore()
        bridge.present(self._id)

    def on(self, event, callback):
        """Register press, move or release; callback receives x and y pixels."""
        if event not in ("press", "move", "release"):
            raise ValueError("Use press, move or release.")
        if not callable(callback):
            raise TypeError("The event callback must be callable.")
        self._events[event] = callback

    def slider(self, label, minimum, maximum, value, on_change, step=1):
        if self._closed:
            return
        if not all(math.isfinite(n) for n in (minimum, maximum, value, step)) or not minimum < maximum or step <= 0 or not minimum <= value <= maximum:
            raise ValueError("Invalid slider range or value.")
        if not callable(on_change):
            raise TypeError("The slider callback must be callable.")
        identity = str(len(self._sliders))
        self._sliders[identity] = on_change
        bridge.slider(self._id, identity, str(label), minimum, maximum, step, value)

    def animate(self, callback, fps=60):
        """Call callback(dt) repeatedly. dt is elapsed time in seconds."""
        if not callable(callback):
            raise TypeError("The animation callback must be callable.")
        self.stop()
        self._animation = callback
        self.set_fps(fps)

    def set_fps(self, fps):
        if not math.isfinite(fps) or not 1 <= fps <= 120:
            raise ValueError("FPS must be between 1 and 120.")
        self._fps = fps
        if self._timer is not None:
            clear_interval(self._timer)
            self._timer = None
        self._last_time = perf_counter()
        if self._animation is not None and not self._closed:
            self._timer = set_interval(self._tick, 1000 / fps)

    def _tick(self):
        if self._closed:
            return
        now = perf_counter()
        dt = min(now - self._last_time, 0.25)
        self._last_time = now
        try:
            self._animation(dt)
        except Exception:
            self.stop()
            import traceback
            traceback.print_exc()

    def _event(self, event, *args):
        if self._closed:
            return
        if event == "slider":
            self._sliders[str(args[0])](float(args[1]))
        elif event in self._events:
            self._events[event](*(float(n) for n in args))

    def stop(self):
        if self._timer is not None:
            clear_interval(self._timer)
            self._timer = None
        self._animation = None

    def close(self):
        if self._closed:
            return
        self._closed = True
        self.stop()
        bridge.close(self._id)
        self._proxy.destroy()
        self._events.clear()
        self._sliders.clear()
        self._ctx = None
        _canvases.pop(self._id, None)


def prepare_run():
    for canvas in list(_canvases.values()):
        canvas.close()
