import asyncio
from nicegui import ui

feld = ui.label('Hallo 5RA!').style('background-color: purple; color: white; padding: 24px')
with ui.row():
    ui.button('Grün', on_click=lambda: feld.style('background-color: green'))
    ui.button('Lila', on_click=lambda: feld.style('background-color: purple'))

balken = ui.linear_progress(value=0)

async def animieren():
    start.disable()
    try:
        for schritt in range(101):
            balken.set_value(schritt / 100)
            await asyncio.sleep(0.02)
    finally:
        start.enable()

start = ui.button('Animation starten', on_click=animieren)
