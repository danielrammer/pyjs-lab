# Python graphics: change the curve with the slider below the plot.
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider

x = np.linspace(0, 2 * np.pi, 300)
fig, ax = plt.subplots(figsize=(7, 5))
fig.subplots_adjust(bottom=0.25)
line, = ax.plot(x, np.sin(x), color="#8b49b6", linewidth=3)
ax.set(title="Play with a sine wave", xlabel="x", ylabel="y", ylim=(-3, 3))
ax.grid(alpha=0.25)

slider_ax = fig.add_axes([0.2, 0.08, 0.65, 0.04])
amplitude = Slider(slider_ax, "Amplitude", 0.1, 3, valinit=1)

def update(value):
    line.set_ydata(value * np.sin(x))
    fig.canvas.draw_idle()

amplitude.on_changed(update)
print("Drag the amplitude slider, or use Pan and Zoom above the plot.")
plt.show()
