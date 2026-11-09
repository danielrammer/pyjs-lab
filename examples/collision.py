from pyjs_canvas import Canvas
from math import cos, sin, radians, hypot

canvas = Canvas(600, 360, "Ball und schräge Plattform")
radius = 21
x, y = 300, canvas.height - radius
vx = vy = 0
holding = False

# Das Viereck dreht sich um seinen Mittelpunkt.
cx, cy = 300, 230
width, height = 260, 18
angle = -20
c, s = cos(radians(angle)), sin(radians(angle))

def draw():
    canvas.clear()
    canvas.rectangle(cx-width/2, cy-height/2, width, height,
                     "purple", angle=angle)
    canvas.rectangle(0, canvas.height-2, canvas.width, 2, "gray")
    canvas.circle(x, y, radius, "royalblue")

def press(px, py):
    global holding, vx, vy
    if hypot(x-px, y-py) <= radius:
        holding = True
        vx = vy = 0

def move(px, py):
    global x, y
    if holding:
        x = max(radius, min(canvas.width-radius, px))
        y = max(radius, min(canvas.height-radius, py))
        draw()

def release(px, py):
    global holding
    holding = False

def collide_rectangle():
    global x, y, vx, vy
    # Drehe den Ball gedanklich zurück: Das Viereck liegt dann gerade.
    dx, dy = x-cx, y-cy
    lx, ly = dx*c+dy*s, -dx*s+dy*c
    hx, hy = width/2, height/2

    # Suche den nächstgelegenen Punkt auf dem geraden Viereck.
    qx = max(-hx, min(hx, lx))
    qy = max(-hy, min(hy, ly))
    nx, ny = lx-qx, ly-qy
    distance = hypot(nx, ny)
    if distance >= radius:
        return
    if distance > 0:
        nx, ny = nx/distance, ny/distance
        overlap = radius-distance
    else:
        # Falls der Mittelpunkt innen liegt: über die nächste Seite hinausschieben.
        gap_x, gap_y = hx-abs(lx), hy-abs(ly)
        if gap_x < gap_y:
            nx, ny = (1 if lx >= 0 else -1), 0
            overlap = radius+gap_x
        else:
            nx, ny = 0, (1 if ly >= 0 else -1)
            overlap = radius+gap_y

    # Drehe die Kollisionsrichtung wieder in die Canvas-Koordinaten.
    nx, ny = nx*c-ny*s, nx*s+ny*c
    x += nx*overlap
    y += ny*overlap

    # Nur abprallen, wenn sich der Ball auf die Oberfläche zubewegt.
    speed = vx*nx+vy*ny
    if speed < 0:
        vx -= 1.7*speed*nx
        vy -= 1.7*speed*ny

def update(dt):
    global x, y, vx, vy
    if holding:
        return
    # Kleine Teilschritte verhindern das Durchfallen bei niedrigen Frameraten.
    steps = max(1, int(dt/0.01)+1)
    step = dt/steps
    for _ in range(steps):
        vy += 588*step
        x += vx*step
        y += vy*step
        collide_rectangle()
        if x < radius:
            x, vx = radius, abs(vx)*0.7
        elif x > canvas.width-radius:
            x, vx = canvas.width-radius, -abs(vx)*0.7
        if y > canvas.height-radius:
            y = canvas.height-radius
            vy = -abs(vy)*0.7
            vx *= 0.98
            if abs(vy) < 25:
                vy = 0
    draw()

canvas.on("press", press)
canvas.on("move", move)
canvas.on("release", release)
canvas.animate(update, fps=60)
draw()
