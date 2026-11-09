from nicegui import ui

feld = ui.label('Hallo 5RA!').style('background-color: purple; color: white; padding: 24px')
ui.button('Grün', on_click=lambda: feld.style('background-color: green'))
ui.button('Lila', on_click=lambda: feld.style('background-color: purple'))
