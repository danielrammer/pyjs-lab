"""Build the bilingual default catalog and annotated private solutions."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).parent
entries = json.loads((root / "learn-defaults.json").read_text(encoding="utf-8"))
solutions = json.loads((root / "learn-solutions.json").read_text(encoding="utf-8"))
collision_description = (
    "Erweitere den Ball aus der Framerate-Aufgabe um Kollisionen: Zeichne ein langes, "
    "schmales Viereck, das um etwa 20 Grad geneigt ist. Ziehe den Ball über die Plattform "
    "und lasse ihn fallen. Er soll an der schrägen Fläche und ihren Kanten abprallen, "
    "statt hindurchzufallen. Verwende jetzt eine Geschwindigkeit für x und y; nach dem "
    "Aufprall bewegt sich der Ball auch seitlich. Ziehen pausiert die Physik und setzt "
    "beide Geschwindigkeiten auf 0. Boden und Seitenränder begrenzen die Bewegung. "
    "Hinweis: Drehe den Ballpunkt in die ungedrehten Koordinaten des Vierecks, suche den "
    "nächsten Punkt auf dessen Oberfläche und spiegle die Geschwindigkeit an der "
    "Kollisionsrichtung. Dämpfe jeden Aufprall. Kleine Physik-Teilschritte verhindern "
    "Durchfallen bei niedrigen FPS. Teste Mitte, Kanten und Ecken der Plattform."
)
for prefix, language, extension in [("", "python", "py"), ("js-", "javascript", "js")]:
    identity = prefix + "collision"
    if not any(row["id"] == identity for row in entries):
        position = next(i + 1 for i, row in enumerate(entries) if row["id"] == prefix + "framerate")
        entries.insert(position, dict(id=identity, title="Ball: schräge Plattform und Kollisionen",
                                     description=collision_description, level="Experten", language=language))
    solutions[identity] = (root / "examples" / f"collision.{extension}").read_text(encoding="utf-8")

# Only unchanged solutions receive the added comments during an existing installation's upgrade.
fingerprint_file = root / "learn-comments-upgrade.json"
if not fingerprint_file.exists():
    fingerprint_file.write_text(json.dumps({key: hashlib.sha256(value.encode()).hexdigest()
                                           for key, value in solutions.items()}, indent=2) + "\n", encoding="utf-8")

comments = {
    "hello": ("print() bzw. console.log() gibt Texte und Zahlen aus.", "print() or console.log() displays text and numbers."),
    "about": ("Variablen speichern Werte, die du später wieder verwenden kannst.", "Variables store values that you can use again later."),
    "score": ("Verändere die Punktezahl schrittweise und gib das Endergebnis aus.", "Change the score step by step and display the final result."),
    "calculator": ("Die beiden Zahlen werden mit +, - und * verrechnet.", "Calculate with the two numbers using +, - and *."),
    "level": ("Lies die Punkte ein und prüfe zuerst, ob die Eingabe gültig ist.", "Read the score and first check whether the input is valid."),
    "password": ("Vergleiche die Eingabe mit dem Testpasswort.", "Compare the input with the test password."),
    "countdown": ("Die Schleife zählt rückwärts; der letzte Bereichswert ist ausgeschlossen.", "The loop counts backwards; the final range endpoint is excluded."),
    "even": ("% liefert den Divisionsrest: Rest 0 bei Division durch 2 bedeutet gerade.", "% gives the remainder: a remainder of 0 when dividing by 2 means even."),
    "grades": ("Prüfe die Notengrenzen von der höchsten zur niedrigsten Punktzahl.", "Check grade thresholds from the highest to the lowest score."),
    "guessing": ("Wiederhole die Eingabe, bis die geheime Zahl gefunden wurde.", "Repeat the input until the secret number is found."),
    "function": ("return gibt den berechneten Wert an den Aufrufer zurück.", "return sends the calculated value back to the caller."),
    "codebreaker": ("Vergleiche erst die Positionen, dann die übrigen passenden Ziffern.", "Compare positions first, then count the remaining matching digits."),
    "shapes": ("Canvas verwendet Pixel: x zeigt nach rechts, y nach unten.", "Canvas uses pixels: x points right and y points down."),
    "drag-circles": ("Drücken wählt einen Kreis; Bewegen verschiebt ihn; Loslassen beendet das Ziehen.", "Press selects a circle; move repositions it; release ends the drag."),
    "rotate-rectangle": ("Leere die Zeichenfläche und zeichne das Viereck mit dem neuen Winkel.", "Clear the canvas and draw the rectangle with its new angle."),
    "bouncing-ball": ("Diese erste Simulation verwendet einen festen Zeitschritt von 0.05 Sekunden.", "This first simulation uses a fixed time step of 0.05 seconds."),
    "framerate": ("dt ist die tatsächlich vergangene Zeit in Sekunden, kein fester Frame-Abstand.", "dt is the actual elapsed time in seconds, not a fixed frame interval."),
    "collision": ("Der Ball prallt an der Oberfläche des gedrehten Vierecks ab.", "The ball bounces off the surface of the rotated rectangle."),
}

# JavaScript's initial ball already receives elapsed time from its animation loop.
for identity, code in list(solutions.items()):
    base = identity.removeprefix("js-")
    if base not in comments:
        continue
    de, _ = comments[base]
    if identity == "js-bouncing-ball":
        de = "canvas.animate() liefert den Zeitschritt dt; Schwerkraft und Bewegung nutzen ihn."
    prefix = "//" if identity.startswith("js-") else "#"
    header = f"{prefix} {de}\n"
    if not code.startswith(header):
        solutions[identity] = header + code

titles = {
    "hello": "Hello Python", "about": "About Me", "score": "Score Counter",
    "calculator": "Mini Calculator", "level": "Level Check", "password": "Password Check",
    "countdown": "Countdown", "even": "Even or Odd?", "grades": "Grade Calculator",
    "guessing": "Guess the Number", "function": "Your Own Function", "codebreaker": "Codebreaker",
    "shapes": "Draw Shapes", "drag-circles": "Drag Circles", "rotate-rectangle": "Rotate a Rectangle",
    "bouncing-ball": "Ball with Gravity", "framerate": "Ball: Different Frame Rates",
    "collision": "Ball: Tilted Platform and Collisions",
}
descriptions = {
    "hello": "Display your name, a text and a number using {print}.",
    "about": "Store your name, age and hobby in three variables and display them.",
    "score": "Start with 10 points. Add 5, subtract 3 and display the result.",
    "calculator": "Create a = 12 and b = 4. Calculate the sum, difference and product.",
    "level": "Ask for a score using {input}. Display LEVEL UP for at least 10 points, otherwise TRY AGAIN. Use if/else. Accept only non-negative whole numbers; show a clear message for other inputs. Test 9, 10 and 12 points.",
    "password": "Ask for a test password using {input}. Display ACCESS GRANTED for `{password}`, otherwise ACCESS DENIED.",
    "countdown": "Display the numbers from 10 down to 1 using {loop}.",
    "even": "Use `%` to check whether a number is even or odd. Hint: look at the remainder when dividing by 2.",
    "grades": "Convert a score (0–100) to school grades using {branches}. Choose reasonable thresholds.",
    "guessing": "Let the user guess a number. Display TOO HIGH, TOO LOW or CORRECT. Repeat until the correct answer is entered.",
    "function": "Write `double(x)`, which doubles a number and returns the result using `return`.",
    "codebreaker": "Build a Codebreaker game: the computer chooses four different digits from 0 to 9; a leading zero is allowed. After each guess, show the guess and two counts: digits in the correct position and correct digits in a different position. Example: secret 4271, guess 1234 → 1 correct position (2) and 2 correct digits elsewhere (1 and 4). Keep the real secret hidden until the end. Start with 0123, try previously untested digits, then rearrange them based on the feedback. Allow at most 10 valid guesses; wrong length, non-digits and repeated digits do not use an attempt. Win when the code matches; reveal the secret after 10 valid wrong guesses.",
    "shapes": "Draw two coloured rectangles and two circles in Graphics on one canvas. Use different colours and sizes. Keep all shapes fully visible. Display the drawing with Run. {shapes}",
    "drag-circles": "Draw two circles. Press a circle to select only that circle, drag it with the mouse or a finger, and release it at its new position. The centre may follow the pointer directly; a simple hit check is enough. Clicking outside the circles must move nothing. Keep both circles inside the canvas. Hint: press → move → release, without enabling Pan or Zoom.",
    "rotate-rectangle": "Draw a coloured rectangle and an angle slider from 0 to 360 degrees. Changing the slider rotates the rectangle around its centre. It must not drift; 360 degrees must look like 0 degrees. {rotate}",
    "bouncing-ball": "Turn a circle into a ball: draw a ball and a floor. Drag the ball upwards with the mouse or a finger. Pause physics while dragging. On release, gravity makes it fall and bounce off the floor. Each bounce becomes smaller until it rests. Picking it up again resets its falling speed to 0. A simple simulation is enough: vertical speed only, no throwing and no collisions with other balls. Update speed and position with the time step; reverse the direction at the floor and damp it by 0.75. {ball}",
    "framerate": "Extend the previous ball simulation to handle different frame rates so the ball falls at roughly the same speed at 10, 30 and 60 frames per second. Use elapsed time dt in seconds: velocity += gravity * dt; position += velocity * dt. Add an FPS slider (10–60) and compare drops from the same height. Lower FPS may look less smooth, but must not simply slow the motion down. Keep the clock running while dragging and prevent huge position jumps after long browser pauses. Small differences at impact are acceptable in this simple simulation. canvas.animate() already supplies dt and caps long pauses. {fps}",
    "collision": "Extend the ball from the frame-rate challenge with collisions. Draw a long, thin rectangle tilted by about 20 degrees. Drag the ball above the platform and let it fall. It must bounce off the sloped surface and its edges instead of passing through. Use both x and y velocity; after impact the ball also moves sideways. Dragging pauses physics and resets both velocities to 0. The floor and side walls bound the motion. Hint: transform the ball into the rectangle's unrotated coordinates, find the nearest surface point, then reflect its velocity along the collision direction. Dampen each bounce. Small physics substeps prevent tunnelling at low FPS. Test the middle, edges and corners of the platform.",
}
for row in entries:
    base = row["id"].removeprefix("js-")
    if base not in titles:
        continue
    js = row["language"] == "javascript"
    row["title_en"] = "Hello JavaScript" if js and base == "hello" else titles[base]
    row["description_en"] = descriptions[base].format(
        print="`console.log()`" if js else "`print()`",
        input="`prompt()` and `Number()`" if js and base == "level" else "`prompt()`" if js else "`input()` and `int()`" if base == "level" else "`input()`",
        password="javascript123" if js else "python123",
        loop="a `for` loop" if js else "`for` and `range()`",
        branches="if/else if/else" if js else "if/elif/else",
        shapes="Use graphics.canvas(), fillRect(), arc() and fill()." if js else "Import Canvas from pyjs_canvas. Use canvas.rectangle() and canvas.circle(); coordinates are pixels and y points down.",
        rotate="Use translate(), rotate(), save() and restore()." if js else "Use canvas.rectangle(..., angle=angle) and canvas.slider().",
        ball="Use graphics.canvas() and canvas.animate()." if js else "Use Canvas from pyjs_canvas and canvas.animate(update, fps=20). This first version uses a fixed 0.05-second step; the next challenge improves it.",
        fps="Accumulate frame time until the selected FPS interval has elapsed." if js else "Use canvas.set_fps() to set the frame rate.",
    )

phrases = {
    de: en for de, en in comments.values()
}
phrases.update({
    "Wie viele Punkte hast du?": "How many points do you have?",
    "Testpasswort:": "Test password:",
    "Gib eine ganze Zahl ein:": "Enter a whole number:",
    "Punkte (0–100):": "Score (0–100):",
    "Rate eine Zahl von 1 bis 100:": "Guess a number from 1 to 100:",
    "canvas.animate() liefert den Zeitschritt dt; Schwerkraft und Bewegung nutzen ihn.": "canvas.animate() supplies dt; gravity and movement use that time step.",
    "Drei Variablen speichern Informationen über dich.": "Three variables store information about you.",
    "Gib Text und eine Zahl aus.": "Display some text and a number.",
    "Der Endwert von range() wird nicht mitgezählt.": "The final endpoint of range() is excluded.",
    "Beispielgrenzen: 90 / 80 / 65 / 50 Punkte.": "Example thresholds: 90 / 80 / 65 / 50 points.",
    "Vier verschiedene Ziffern; der Textcode kann mit 0 beginnen.": "Four different digits; the text code may start with 0.",
    "Pixel-Koordinaten: nach unten positiv.": "Pixel coordinates: down is positive.",
    "Das Viereck dreht sich um seinen Mittelpunkt.": "The rectangle rotates around its centre.",
    "Drehe den Ball gedanklich zurück: Das Viereck liegt dann gerade.": "Transform the ball back: the rectangle is now axis-aligned.",
    "Suche den nächstgelegenen Punkt auf dem geraden Viereck.": "Find the nearest point on the axis-aligned rectangle.",
    "Falls der Mittelpunkt innen liegt: über die nächste Seite hinausschieben.": "If the centre is inside, push it out through the nearest side.",
    "Liegt der Mittelpunkt innen, verwende die nächstgelegene Seite.": "If the centre is inside, use the nearest side.",
    "Drehe die Kollisionsrichtung wieder in die Canvas-Koordinaten.": "Transform the collision direction back into canvas coordinates.",
    "Nur abprallen, wenn sich der Ball auf die Oberfläche zubewegt.": "Bounce only if the ball is moving towards the surface.",
    "Kleine Teilschritte verhindern das Durchfallen bei niedrigen Frameraten.": "Small substeps prevent tunnelling at low frame rates.",
    "Mein Name ist Alex.": "My name is Alex.", "Ich lerne Python.": "I am learning Python.",
    "Ich lerne JavaScript.": "I am learning JavaScript.", "Alter:": "Age:", "Musik": "Music",
    "Punkte:": "Points:", "Summe:": "Sum:", "Differenz:": "Difference:", "Produkt:": "Product:",
    "Wie viele Punkte hast du? ": "How many points do you have? ",
    "Bitte eine ganze Zahl eingeben.": "Please enter a whole number.",
    "Punkte dürfen nicht negativ sein.": "Points must not be negative.", "Abgebrochen.": "Cancelled.",
    "Testpasswort: ": "Test password: ", "ZUGANG ERLAUBT": "ACCESS GRANTED", "ZUGANG VERWEIGERT": "ACCESS DENIED",
    "Gib eine ganze Zahl ein: ": "Enter a whole number: ", "Die Zahl ist gerade.": "The number is even.",
    "Die Zahl ist ungerade.": "The number is odd.", "Punkte (0–100): ": "Score (0–100): ",
    "Bitte Punkte zwischen 0 und 100 eingeben.": "Please enter a score between 0 and 100.",
    "Note ": "Grade ", "Rate eine Zahl von 1 bis 100: ": "Guess a number from 1 to 100: ",
    "ZU HOCH": "TOO HIGH", "ZU NIEDRIG": "TOO LOW", "RICHTIG": "CORRECT",
    "Codebreaker: Errate vier verschiedene Ziffern von 0 bis 9.": "Codebreaker: Guess four different digits from 0 to 9.",
    "Codebreaker: Vier verschiedene Ziffern von 0 bis 9.": "Codebreaker: Four different digits from 0 to 9.",
    "Richtige Position = Ziffer und Platz stimmen.": "Correct position = both digit and position match.",
    "Andere Position = Ziffer stimmt, Platz stimmt nicht.": "Other position = the digit matches but its position does not.",
    "Beginne z. B. mit 0123. Nutze dann die Rückmeldungen.": "Start with 0123, for example. Then use the feedback.",
    "Beginne z. B. mit 0123.": "Start with 0123, for example.",
    "Versuch ": "Attempt ", "Vier verschiedene Ziffern.": "Four different digits.",
    "Bitte genau 4 Ziffern (0–9) eingeben. Kein Versuch verbraucht.": "Please enter exactly 4 digits (0–9). No attempt used.",
    "Keine Ziffer darf doppelt vorkommen. Kein Versuch verbraucht.": "Each digit must be different. No attempt used.",
    "Tipp:": "Guess:", "Tipp ": "Guess ", "CODE GEKNACKT!": "CODE CRACKED!",
    "Richtige Position:": "Correct position:", "Richtige Ziffer, falsche Position:": "Correct digit, wrong position:",
    "richtige Position;": "correct position;", "richtige Ziffer an anderer Position.": "correct digit in another position.",
    "Verloren! Der Code war:": "You lost! The code was:",
    "Ziehe einen Kreis mit der Maus oder dem Finger.": "Drag a circle with the mouse or your finger.",
    "Drehe das Viereck mit dem Winkel-Regler.": "Rotate the rectangle with the angle slider.",
    "Ziehe den Ball hoch und lasse ihn los: Er fällt und springt.": "Drag the ball upwards and release it: it falls and bounces.",
    '"Winkel"': '"Angle"', '"Formen"': '"Shapes"',
    '"Ball und schräge Plattform"': '"Ball and tilted platform"',
})
english = json.loads((root / "learn-solutions-en.json").read_text(encoding="utf-8"))
for identity, code in solutions.items():
    if identity.removeprefix("js-").startswith("basics-"):
        continue
    for de, en in sorted(phrases.items(), key=lambda pair: len(pair[0]), reverse=True):
        code = code.replace(de, en)
    english[identity] = code

for name, value in [("learn-defaults.json", entries), ("learn-solutions.json", solutions), ("learn-solutions-en.json", english)]:
    (root / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
