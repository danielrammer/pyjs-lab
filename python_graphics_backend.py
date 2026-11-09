"""Matplotlib backend for PYJS: browser display, navigation and Python widgets."""
import base64
import io

import _pyjs_graphics as display
from matplotlib.backend_bases import (
    FigureManagerBase, KeyEvent, LocationEvent, MouseEvent, NavigationToolbar2, TimerBase, _Backend,
)
from matplotlib.backends.backend_agg import FigureCanvasAgg
from PIL import Image
from pyodide.ffi import create_proxy
from pyodide.ffi.wrappers import clear_timeout, set_timeout, clear_interval, set_interval


class TimerPYJS(TimerBase):
    def __init__(self, canvas, *args, **kwargs):
        self._canvas = canvas
        self._handle = None
        super().__init__(*args, **kwargs)

    def _timer_start(self):
        self._timer_stop()
        if not self._canvas._closed:
            self._handle = set_interval(self._tick, self.interval)

    def _timer_stop(self):
        if self._handle is not None:
            clear_interval(self._handle)
            self._handle = None

    def _timer_set_interval(self):
        if self._handle is not None:
            self._timer_start()

    def _tick(self):
        if self._canvas._closed:
            self.stop()
            return
        if self.single_shot:
            self.stop()
        try:
            self._on_timer()
        except Exception:
            self.stop()
            import traceback
            traceback.print_exc()


class FigureCanvasPYJS(FigureCanvasAgg):
    # Draw the whole figure, including widgets, after a change.
    supports_blit = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._identity = "pyjs-figure-" + str(id(self))
        self._shown = False
        self._closed = False
        self._timer = None
        self._animation_timers = []
        self._callback = create_proxy(self._event)

    def show(self):
        if self._closed:
            return
        if not self._shown:
            self._shown = True
            display.add_figure(self._identity, self.manager.get_window_title(), self._callback)
        self.draw()

    def draw(self):
        if self._closed:
            return
        super().draw()
        if not self._shown:
            return
        width, height = self.get_width_height()
        image = Image.frombytes("RGBA", (width, height), bytes(self.buffer_rgba()))
        with io.BytesIO() as buffer:
            image.save(buffer, format="PNG")
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        display.draw_figure(self._identity, encoded, width, height)

    def draw_idle(self, *args, **kwargs):
        if self._timer is None and not self._closed:
            self._timer = set_timeout(self._draw_pending, 0)

    def _draw_pending(self):
        self._timer = None
        self.draw()

    def destroy(self):
        if self._closed:
            return
        self._closed = True
        for timer in self._animation_timers:
            timer.stop()
        self._animation_timers.clear()
        if self._timer is not None:
            clear_timeout(self._timer)
            self._timer = None
        display.remove_figure(self._identity)
        self._callback.destroy()

    def new_timer(self, interval=None, callbacks=None):
        timer = TimerPYJS(self, interval=interval, callbacks=callbacks)
        self._animation_timers.append(timer)
        return timer

    def _event(self, name, x=0, y=0, button=1, key="", step=0):
        if self._closed:
            return
        if name in ("home", "back", "forward", "pan", "zoom"):
            getattr(self.toolbar, name)()
            display.set_mode(self._identity, self.toolbar.mode.name.lower())
            return
        width, height = self.get_width_height()
        x, y = float(x) * width, (1 - float(y)) * height
        if name in ("key_press_event", "key_release_event"):
            event = KeyEvent(name, self, str(key), x, y)
        elif name in ("figure_enter_event", "figure_leave_event"):
            event = LocationEvent(name, self, x, y)
        else:
            mouse_button = int(button) if int(button) > 0 else None
            event = MouseEvent(name, self, x, y, button=mouse_button, key=str(key) or None, step=float(step))
        self.callbacks.process(name, event)
        display.set_mode(self._identity, self.toolbar.mode.name.lower())


class NavigationToolbarPYJS(NavigationToolbar2):
    def set_message(self, message):
        display.set_message(self.canvas._identity, str(message))

    def set_cursor(self, cursor):
        display.set_cursor(self.canvas._identity, int(cursor))

    def draw_rubberband(self, event, x0, y0, x1, y1):
        width, height = self.canvas.get_width_height()
        display.draw_rubberband(self.canvas._identity, x0 / width, 1 - y0 / height, x1 / width, 1 - y1 / height)

    def remove_rubberband(self):
        display.remove_rubberband(self.canvas._identity)

    def save_figure(self, *args):
        display.download_figure(self.canvas._identity)


class FigureManagerPYJS(FigureManagerBase):
    def __init__(self, canvas, num):
        super().__init__(canvas, num)
        self._title = f"Figure {num}"
        self.toolbar = NavigationToolbarPYJS(canvas)

    def show(self):
        self.canvas.show()

    def destroy(self):
        self.canvas.destroy()

    def set_window_title(self, title):
        self._title = str(title)

    def get_window_title(self):
        return self._title


FigureCanvasPYJS.manager_class = FigureManagerPYJS


@_Backend.export
class _BackendPYJS(_Backend):
    FigureCanvas = FigureCanvasPYJS
    FigureManager = FigureManagerPYJS

    @staticmethod
    def show(*args, **kwargs):
        from matplotlib._pylab_helpers import Gcf
        for manager in Gcf.get_all_fig_managers():
            manager.show()


def configure():
    import matplotlib
    matplotlib.use("module://pyjs_graphics_backend", force=True)
    from matplotlib import pyplot
    pyplot.ioff()


def prepare_run():
    from matplotlib import pyplot
    pyplot.close("all")


def finish_run():
    show()
