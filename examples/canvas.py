from pyjs_canvas import Canvas

canvas = Canvas(600, 300, "Bewegter Ball")
x = 40
richtung = 1

def zeichnen():
    canvas.clear("#f4f0f8")
    canvas.circle(x, 150, 25, "purple")

def bewegen(dt):
    global x, richtung
    x += richtung * 160 * dt
    if x >= 575:
        x = 575
        richtung = -1
    elif x <= 25:
        x = 25
        richtung = 1
    zeichnen()

zeichnen()
canvas.animate(bewegen)
