import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

fig, ax = plt.subplots(figsize=(7, 4.5))
ax.set(xlim=(0, 10), ylim=(0, 6), aspect="equal")
ax.axis("off")

ax.add_patch(Rectangle((1, 1), 2, 2, color="purple"))
ax.add_patch(Rectangle((4, 1), 3, 1, color="yellowgreen"))
ax.add_patch(Circle((3, 4.5), 0.7, color="orange"))
ax.add_patch(Circle((8, 4), 1, color="royalblue"))
plt.show()
