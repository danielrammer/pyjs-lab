"""Author short, bilingual practice lessons and a safe catalog migration."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).parent
read = lambda name: json.loads((root / name).read_text(encoding="utf-8"))
entries, solutions, english = read("learn-defaults.json"), read("learn-solutions.json"), read("learn-solutions-en.json")
manifest_path = root / "learn-basics-upgrade.json"
manifest = read(manifest_path.name) if manifest_path.exists() else {"additions": {}, "descriptions": {}}
cases = []

translations = {
    "Blau": "Blue", "Grün": "Green", "Ich heiße ": "My name is ", " und bin ": " and I am ",
    "Gesamt:": "Total:", "Anteil:": "Share:", "Rest:": "Remainder:", "Name: ": "Name: ",
    "Hallo,": "Hello,", "Hallo!": "Hello!", "Alter: ": "Age: ", "Nächstes Jahr:": "Next year:",
    "Kühl.": "Cool.", "Tür offen.": "Door open.", "Tür zu.": "Door closed.",
    "Milch": "Milk", "Brot": "Bread", "Apfel": "Apple", "Wasser": "Water", "Saft": "Juice", "Tee": "Tea",
    "Ich übe!": "I am practising!", "Energie:": "Energy:", "Alter:": "Age:", "Fläche:": "Area:",
}
def translate(code):
    for de, en in sorted(translations.items(), key=lambda item: len(item[0]), reverse=True):
        code = code.replace(de, en)
    return code

def add(identity, after, title, title_en, description, description_en, py, js, output, comment, comment_en, answers=(), tags=()):
    for is_js in (False, True):
        prefix = "js-" if is_js else ""
        key, predecessor = prefix + "basics-" + identity, prefix + after
        replacements = {"<PRINT>": "console.log()" if is_js else "print()", "<INPUT>": "prompt()" if is_js else "input()",
                        "<NUMBER>": "Number()" if is_js else "int()", "<LOWER>": "toLowerCase()" if is_js else "lower()",
                        "<UPPER>": "toUpperCase()" if is_js else "upper()", "<TRIM>": "trim()" if is_js else "strip()",
                        "<LENGTH>": ".length" if is_js else "len()", "<APPEND>": "push()" if is_js else "append()"}
        de, en = description, description_en
        for old, new in replacements.items():
            de, en = de.replace(old, new), en.replace(old, new)
        marker = " ".join(f"[{tag.replace('LISTS', 'ARRAYS').replace('LIST METHODS', 'ARRAY METHODS').replace('DICTIONARIES', 'OBJECTS') if is_js else tag}]" for tag in tags)
        row = dict(id=key, title=title, title_en=title_en, description=de + (" " + marker if marker else ""),
                   description_en=en + (" " + marker if marker else ""), level="Grundlagen", language="javascript" if is_js else "python", visible=True)
        existing = next((i for i, entry in enumerate(entries) if entry["id"] == key), None)
        if existing is None:
            position = next(i + 1 for i, entry in enumerate(entries) if entry["id"] == predecessor)
            entries.insert(position, row)
        else:
            entries[existing] = row
        code, symbol = (js, "//") if is_js else (py, "#")
        solutions[key] = f"{symbol} {comment}\n{code.strip()}\n"
        english[key] = f"{symbol} {comment_en}\n{translate(code.strip())}\n"
        manifest["additions"][key] = predecessor
        cases.append(dict(id=key, answers=list(answers), output=output, output_en=[translate(value) for value in output]))

add("change-value", "about", "Lieblingsfarbe ändern", "Change Your Favourite Colour",
    "Speichere Blau in `colour` und gib den Wert aus. Ersetze den Wert durch Grün und gib ihn erneut aus. Verwende dieselbe Variable.",
    "Store Blue in `colour` and display it. Replace its value with Green and display it again. Use the same variable.",
    'colour = "Blau"\nprint(colour)\ncolour = "Grün"\nprint(colour)',
    'let colour = "Blau";\nconsole.log(colour);\ncolour = "Grün";\nconsole.log(colour);',
    ["Blau", "Grün"], "Eine Zuweisung ersetzt den alten Wert der Variable.", "Assignment replaces the variable's previous value.")
add("profile-message", "basics-change-value", "Mein Steckbrief als Satz", "My Profile as a Sentence",
    "Speichere Alex und 16 in `name` und `age`. Gib einen Satz aus, der beide Werte enthält. Python: Verwende einen f-String. JavaScript: Verwende einen Template-String mit Backticks.",
    "Store Alex and 16 in `name` and `age`. Display a sentence containing both values. Python: use an f-string. JavaScript: use a template string with backticks.",
    'name = "Alex"\nage = 16\nprint(f"Ich heiße {name} und bin {age}.")',
    'const name = "Alex";\nconst age = 16;\nconsole.log(`Ich heiße ${name} und bin ${age}.`);',
    ["Ich heiße Alex und bin 16."], "Platzhalter setzen die Variablen direkt in den Text ein.", "Placeholders insert variable values directly into the text.", tags=("STRING FORMATTING",))
add("shopping-total", "calculator", "Einkauf berechnen", "Calculate a Shopping Total",
    "Ein Heft kostet 2 Euro. Du kaufst 3 Hefte. Speichere Preis und Anzahl in Variablen, berechne den Gesamtpreis und gib ihn aus. Ändere danach die Anzahl auf 5 und teste erneut.",
    "One notebook costs 2 euros. You buy 3 notebooks. Store the price and quantity, calculate the total and display it. Then change the quantity to 5 and test again.",
    'price = 2\nquantity = 3\ntotal = price * quantity\nprint("Gesamt:", total)',
    'const price = 2;\nconst quantity = 3;\nconst total = price * quantity;\nconsole.log("Gesamt:", total);',
    ["Gesamt: 6"], "Preis mal Anzahl ergibt den Gesamtpreis.", "Price times quantity gives the total price.")
add("division-share", "basics-shopping-total", "Fair teilen", "Share Fairly",
    "Vier Personen teilen eine Rechnung von 22 Euro gleichmäßig. Speichere beide Zahlen, berechne mit `/` den Anteil pro Person und gib ihn aus. Erwartet: 5.5.",
    "Four people share a bill of 22 euros equally. Store both numbers, calculate each person's share using `/` and display it. Expected: 5.5.",
    'bill = 22\npeople = 4\nprint("Anteil:", bill / people)',
    'const bill = 22;\nconst people = 4;\nconsole.log("Anteil:", bill / people);',
    ["Anteil: 5.5"], "Division kann eine Zahl mit Nachkommastellen ergeben.", "Division can produce a number with a fractional part.", tags=("DIVISION",))
add("leftovers", "basics-division-share", "Was bleibt übrig?", "What Is Left Over?",
    "Verteile 17 Bonbons auf 5 Personen. Berechne mit `%`, wie viele Bonbons nach dem Verteilen gleicher Mengen übrig bleiben. Gib den Rest aus. Erwartet: 2.",
    "Share 17 sweets among 5 people. Use `%` to find how many remain after giving everyone the same amount. Display the remainder. Expected: 2.",
    'sweets = 17\npeople = 5\nprint("Rest:", sweets % people)',
    'const sweets = 17;\nconst people = 5;\nconsole.log("Rest:", sweets % people);',
    ["Rest: 2"], "% liefert den Rest einer Division.", "% returns the remainder of division.", tags=("MODULO",))
add("input-greeting", "basics-leftovers", "Begrüßung mit Eingabe", "Greeting with User Input",
    "Frage mit `<INPUT>` nach einem Namen. Speichere die Eingabe und begrüße die Person mit `<PRINT>`. Teste mit Alex und mit deinem eigenen Namen.",
    "Ask for a name using `<INPUT>`. Store the input and greet the person using `<PRINT>`. Test with Alex and with your own name.",
    'name = input("Name: ")\nprint("Hallo,", name)',
    'const name = prompt("Name: ");\nconsole.log("Hallo,", name);',
    ["Hallo, Alex"], "Die Eingabe wird als Text gespeichert und anschließend ausgegeben.", "Input is stored as text and then displayed.", answers=("Alex",), tags=("INPUT",))
add("birthday", "basics-input-greeting", "Alter nächstes Jahr", "Age Next Year",
    "Frage mit `<INPUT>` nach dem Alter. Wandle den Text mit `<NUMBER>` in eine Zahl um, addiere 1 und gib das Alter im nächsten Jahr aus. Teste mit 12. Verwende zunächst nur gültige ganze Zahlen.",
    "Ask for an age using `<INPUT>`. Convert the text to a number using `<NUMBER>`, add 1 and display the age next year. Test with 12. For now, enter valid whole numbers only.",
    'age = int(input("Alter: "))\nprint("Nächstes Jahr:", age + 1)',
    'const age = Number(prompt("Alter: "));\nconsole.log("Nächstes Jahr:", age + 1);',
    ["Nächstes Jahr: 13"], "Text muss vor einer Rechnung in eine Zahl umgewandelt werden.", "Convert input text to a number before calculating.", answers=("12",), tags=("TYPE CONVERSION",))
add("temperature", "basics-birthday", "Warm oder kühl?", "Warm or Cool?",
    "Setze `temperature = 28`. Bei mindestens 25 Grad gib Warm aus, sonst Kühl. Verwende `if/else` und den Vergleich `>=`. Teste danach mit 20 und mit genau 25 Grad.",
    "Set `temperature = 28`. Display Warm for at least 25 degrees, otherwise Cool. Use `if/else` and the `>=` comparison. Then test with 20 and exactly 25 degrees.",
    'temperature = 28\nif temperature >= 25:\n    print("Warm.")\nelse:\n    print("Kühl.")',
    'const temperature = 28;\nif (temperature >= 25) {\n  console.log("Warm.");\n} else {\n  console.log("Kühl.");\n}',
    ["Warm."], "Nur der passende Zweig der Bedingung wird ausgeführt.", "Only the matching branch of the condition runs.", tags=("COMPARISONS", "IF"))
add("door", "level", "Zwei Bedingungen", "Two Conditions",
    "Speichere in `has_key` und `is_member`, ob jemand einen Schlüssel hat und Mitglied ist. Verwende Wahrheitswerte: Python `True/False`, JavaScript `true/false`. Nur wenn beide Werte wahr sind, gib Tür offen aus, sonst Tür zu. Verbinde die Bedingungen mit Python `and` bzw. JavaScript `&&`. Teste alle vier Kombinationen.",
    "Store whether someone has a key and is a member in `has_key` and `is_member`. Use booleans: Python `True/False`, JavaScript `true/false`. Display Door open only when both are true, otherwise Door closed. Combine conditions using Python `and` or JavaScript `&&`. Test all four combinations.",
    'has_key = True\nis_member = True\nif has_key and is_member:\n    print("Tür offen.")\nelse:\n    print("Tür zu.")',
    'const has_key = true;\nconst is_member = true;\nif (has_key && is_member) {\n  console.log("Tür offen.");\n} else {\n  console.log("Tür zu.");\n}',
    ["Tür offen."], "Bei AND müssen beide Bedingungen wahr sein.", "With AND, both conditions must be true.", tags=("BOOLEANS", "AND"))
add("name-normalize", "password", "Namen aufräumen", "Clean Up a Name",
    "Speichere den Text `  ALEx  ` einschließlich der Leerzeichen. Entferne mit `<TRIM>` die äußeren Leerzeichen und wandle den Text mit `<LOWER>` in Kleinbuchstaben um. Gib alex aus. Gib danach mit `<UPPER>` die Großbuchstaben-Version aus.",
    "Store `  ALEx  ` including its spaces. Remove surrounding spaces using `<TRIM>` and convert to lowercase using `<LOWER>`. Display alex. Then display the uppercase version using `<UPPER>`.",
    'name = "  ALEx  "\nclean = name.strip().lower()\nprint(clean)\nprint(clean.upper())',
    'const name = "  ALEx  ";\nconst clean = name.trim().toLowerCase();\nconsole.log(clean);\nconsole.log(clean.toUpperCase());',
    ["alex", "ALEX"], "String-Methoden liefern einen neuen, bearbeiteten Text.", "String methods return a new, transformed text.", tags=("STRING METHODS",))
add("letters", "basics-name-normalize", "Erstes und letztes Zeichen", "First and Last Character",
    "Speichere Alex in `name`. Gib das erste Zeichen, das letzte Zeichen und die Textlänge aus. Die erste Position ist 0. Letztes Zeichen: Python `name[-1]`, JavaScript `name[name.length - 1]`. Für die Länge verwende `<LENGTH>`. Erwartet: A, x und 4.",
    "Store Alex in `name`. Display its first character, last character and length. The first position is 0. Last character: Python `name[-1]`, JavaScript `name[name.length - 1]`. Use `<LENGTH>` for the length. Expected: A, x and 4.",
    'name = "Alex"\nprint(name[0])\nprint(name[-1])\nprint(len(name))',
    'const name = "Alex";\nconsole.log(name[0]);\nconsole.log(name[name.length - 1]);\nconsole.log(name.length);',
    ["A\nx\n4"], "Positionen beginnen bei 0; die Länge zählt alle Zeichen.", "Positions start at 0; length counts all characters.", tags=("INDEXING", "LENGTH"))
add("snacks", "basics-letters", "Meine Einkaufsliste", "My Shopping List",
    "Erstelle `items` mit Milch, Brot und Apfel in eckigen Klammern. Gib den ersten Eintrag, den dritten Eintrag und die Anzahl der Einträge aus. Denk daran: Die erste Position ist 0.",
    "Create `items` containing Milk, Bread and Apple in square brackets. Display the first item, third item and item count. Remember: the first position is 0.",
    'items = ["Milch", "Brot", "Apfel"]\nprint(items[0])\nprint(items[2])\nprint(len(items))',
    'const items = ["Milch", "Brot", "Apfel"];\nconsole.log(items[0]);\nconsole.log(items[2]);\nconsole.log(items.length);',
    ["Milch\nApfel\n3"], "Eine Liste speichert mehrere Werte in einer festen Reihenfolge.", "A list or array stores multiple values in a defined order.", tags=("LISTS",))
add("list-edit", "basics-snacks", "Liste verändern", "Change a List",
    "Starte mit Wasser und Saft in `items`. Hänge mit `<APPEND>` Tee an. Ersetze dann den ersten Eintrag durch Milch. Gib den ersten und letzten Eintrag sowie die neue Anzahl aus. Erwartet: Milch, Tee, 3.",
    "Start with Water and Juice in `items`. Append Tea using `<APPEND>`. Replace the first item with Milk. Display the first and last items and the new count. Expected: Milk, Tea, 3.",
    'items = ["Wasser", "Saft"]\nitems.append("Tee")\nitems[0] = "Milch"\nprint(items[0])\nprint(items[-1])\nprint(len(items))',
    'const items = ["Wasser", "Saft"];\nitems.push("Tee");\nitems[0] = "Milch";\nconsole.log(items[0]);\nconsole.log(items[items.length - 1]);\nconsole.log(items.length);',
    ["Milch\nTee\n3"], "Anhängen verlängert die Liste; Ersetzen verändert einen vorhandenen Eintrag.", "Appending grows the list; replacement changes an existing item.", tags=("LIST METHODS",))
add("count-up", "basics-list-edit", "Von 1 bis 5", "Count from 1 to 5",
    "Gib mit einer `for`-Schleife die Zahlen 1 bis 5 aus, jede in einer eigenen Zeile. Python: Verwende `range(1, 6)`, weil die obere Grenze nicht mitgezählt wird. JavaScript: Starte bei 1 und wiederhole solange die Zahl `<= 5` ist.",
    "Use a `for` loop to display 1 through 5 on separate lines. Python: use `range(1, 6)`, because the upper endpoint is excluded. JavaScript: start at 1 and repeat while the number is `<= 5`.",
    'for number in range(1, 6):\n    print(number)',
    'for (let number = 1; number <= 5; number++) {\n  console.log(number);\n}',
    ["1\n2\n3\n4\n5"], "Die Schleife führt dieselbe Ausgabe für jede Zahl aus.", "The loop performs the same output for each number.", tags=("FOR",))
add("repeat-message", "basics-count-up", "Dreimal üben", "Practise Three Times",
    "Gib Ich übe! genau dreimal aus. Verwende eine `for`-Schleife statt drei einzelne Ausgabebefehle. Verändere danach die Wiederholungszahl auf 5.",
    "Display I am practising! exactly three times. Use a `for` loop instead of three separate output statements. Then change the repeat count to 5.",
    'for repeat in range(3):\n    print("Ich übe!")',
    'for (let repeat = 0; repeat < 3; repeat++) {\n  console.log("Ich übe!");\n}',
    ["Ich übe!\nIch übe!\nIch übe!"], "Die Anzahl der Schleifendurchläufe bestimmt die Wiederholungen.", "The number of loop iterations determines the repetitions.")
add("playlist", "countdown", "Playlist ausgeben", "Display a Playlist",
    "Speichere Rock, Pop und Jazz in `songs`. Gib alle Einträge mit einer Schleife aus. Python: `for song in songs`. JavaScript: `for (const song of songs)`. Hänge einen vierten Eintrag an und prüfe, ob er automatisch mit ausgegeben wird.",
    "Store Rock, Pop and Jazz in `songs`. Display every entry with a loop. Python: `for song in songs`. JavaScript: `for (const song of songs)`. Append a fourth entry and check that the loop displays it automatically.",
    'songs = ["Rock", "Pop", "Jazz"]\nfor song in songs:\n    print(song)',
    'const songs = ["Rock", "Pop", "Jazz"];\nfor (const song of songs) {\n  console.log(song);\n}',
    ["Rock\nPop\nJazz"], "Die Schleife nimmt jeden Eintrag der Reihe nach.", "The loop visits each entry in order.")
add("list-total", "basics-playlist", "Zahlen aufsummieren", "Add Up Numbers",
    "Speichere 2, 4, 6 und 8 in `numbers`. Starte `total` bei 0 und addiere in einer Schleife jeden Eintrag dazu. Gib erst nach der Schleife das Ergebnis 20 aus. Verwende keine eingebaute Summenfunktion.",
    "Store 2, 4, 6 and 8 in `numbers`. Start `total` at 0 and add each item in a loop. Display 20 after the loop. Do not use a built-in sum function.",
    'numbers = [2, 4, 6, 8]\ntotal = 0\nfor number in numbers:\n    total += number\nprint(total)',
    'const numbers = [2, 4, 6, 8];\nlet total = 0;\nfor (const number of numbers) {\n  total += number;\n}\nconsole.log(total);',
    ["20"], "total sammelt die Werte; die Ausgabe steht außerhalb der Schleife.", "total accumulates the values; output is outside the loop.")
add("multiplication", "basics-list-total", "Kleine Einmaleins-Tabelle", "A Small Times Table",
    "Gib die ersten fünf Aufgaben der 7er-Reihe aus: 1 x 7 = 7 bis 5 x 7 = 35. Verwende eine Schleife und berechne jedes Ergebnis. Speichere die 7 in einer Variable, damit du leicht die 3er-Reihe testen kannst.",
    "Display the first five entries of the 7 times table: 1 x 7 = 7 through 5 x 7 = 35. Use a loop and calculate each result. Store 7 in a variable so you can easily test the 3 times table.",
    'factor = 7\nfor number in range(1, 6):\n    print(f"{number} x {factor} = {number * factor}")',
    'const factor = 7;\nfor (let number = 1; number <= 5; number++) {\n  console.log(`${number} x ${factor} = ${number * factor}`);\n}',
    ["1 x 7 = 7", "5 x 7 = 35"], "Die Schleife kombiniert Zählen, Rechnen und Textformatierung.", "The loop combines counting, calculation and string formatting.")
add("energy", "grades", "Energie verbrauchen", "Use Up Energy",
    "Starte mit `energy = 3`. Solange die Energie größer als 0 ist, gib sie aus und verringere sie um 1. Verwende `while`. Gib danach Pause. aus. Wichtig: Ändere die Energie in der Schleife, damit sie endet.",
    "Start with `energy = 3`. While energy is greater than 0, display it and decrease it by 1. Use `while`. Display Pause. afterwards. Change energy inside the loop so it terminates.",
    'energy = 3\nwhile energy > 0:\n    print("Energie:", energy)\n    energy -= 1\nprint("Pause.")',
    'let energy = 3;\nwhile (energy > 0) {\n  console.log("Energie:", energy);\n  energy -= 1;\n}\nconsole.log("Pause.");',
    ["Energie: 3\nEnergie: 2\nEnergie: 1\nPause."], "Die Bedingung wird vor jedem Durchlauf erneut geprüft.", "The condition is checked again before each iteration.", tags=("WHILE",))
add("profile-card", "basics-energy", "Daten mit Namen", "Data with Named Keys",
    'Speichere Name Alex und Alter 16 gemeinsam in `profile`. Python: `{"name": "Alex", "age": 16}`. JavaScript: `{name: "Alex", age: 16}`. Gib beide Werte über ihre Schlüssel aus und ändere danach das Alter auf 17.',
    'Store Alex and age 16 together in `profile`. Python: `{"name": "Alex", "age": 16}`. JavaScript: `{name: "Alex", age: 16}`. Display both values by key, then change the age to 17.',
    'profile = {"name": "Alex", "age": 16}\nprint("Name:", profile["name"])\nprint("Alter:", profile["age"])\nprofile["age"] = 17\nprint("Alter:", profile["age"])',
    'const profile = {name: "Alex", age: 16};\nconsole.log("Name:", profile.name);\nconsole.log("Alter:", profile.age);\nprofile.age = 17;\nconsole.log("Alter:", profile.age);',
    ["Name: Alex", "Alter: 16", "Alter: 17"], "Schlüssel geben den gespeicherten Werten verständliche Namen.", "Keys give meaningful names to stored values.", tags=("DICTIONARIES",))
add("greet-function", "basics-profile-card", "Meine erste Funktion", "My First Function",
    "Schreibe eine Funktion `say_hello`, die Hallo! ausgibt. Rufe sie danach zweimal auf. Python: Beginne mit `def say_hello():`. JavaScript: Beginne mit `function say_hello()`. Die Ausgabe soll beim Aufrufen erfolgen.",
    "Write a function `say_hello` that displays Hello! Call it twice afterwards. Python: start with `def say_hello():`. JavaScript: start with `function say_hello()`. Output should happen when the function is called.",
    'def say_hello():\n    print("Hallo!")\n\nsay_hello()\nsay_hello()',
    'function say_hello() {\n  console.log("Hallo!");\n}\nsay_hello();\nsay_hello();',
    ["Hallo!\nHallo!"], "Die Definition beschreibt die Arbeit; erst der Aufruf führt sie aus.", "The definition describes the work; calling the function performs it.", tags=("FUNCTIONS",))
add("greet-person", "basics-greet-function", "Funktion mit Name", "A Function with a Name",
    "Schreibe `greet(name)`. Die Funktion soll die übergebene Person begrüßen. Rufe sie mit Alex und mit Sam auf. Verwende den Parameter statt eines fest eingebauten Namens.",
    "Write `greet(name)`. The function should greet the person passed to it. Call it with Alex and Sam. Use the parameter instead of a hard-coded name.",
    'def greet(name):\n    print("Hallo,", name)\n\ngreet("Alex")\ngreet("Sam")',
    'function greet(name) {\n  console.log("Hallo,", name);\n}\ngreet("Alex");\ngreet("Sam");',
    ["Hallo, Alex\nHallo, Sam"], "Der Parameter erhält bei jedem Aufruf den übergebenen Wert.", "The parameter receives the supplied value on each call.", tags=("PARAMETERS",))
add("rectangle-area", "function", "Fläche als Rückgabewert", "Area as a Return Value",
    "Schreibe `area(width, height)`, die Breite mal Höhe mit `return` zurückgibt. Gib die Ergebnisse von `area(3, 4)` und `area(2, 5)` außerhalb der Funktion aus. Erwartet: 12 und 10.",
    "Write `area(width, height)` that returns width times height using `return`. Display `area(3, 4)` and `area(2, 5)` outside the function. Expected: 12 and 10.",
    'def area(width, height):\n    return width * height\n\nprint(area(3, 4))\nprint(area(2, 5))',
    'function area(width, height) {\n  return width * height;\n}\nconsole.log(area(3, 4));\nconsole.log(area(2, 5));',
    ["12\n10"], "return liefert das Ergebnis; der Aufrufer entscheidet über die Ausgabe.", "return supplies the result; the caller decides how to display it.")

old_tags = {"hello": ["OUTPUT", "STRINGS"], "about": ["VARIABLES"], "score": ["OPERATORS"],
            "level": ["VALIDATION"], "grades": ["ELIF"], "guessing": ["RANDOM"], "function": ["RETURN"],
            "shapes": ["CANVAS"], "drag-circles": ["EVENTS"], "rotate-rectangle": ["SLIDERS"],
            "bouncing-ball": ["ANIMATION"], "framerate": ["DELTA TIME"], "collision": ["COLLISION"]}
for row in entries:
    base = row["id"].removeprefix("js-")
    if base not in old_tags:
        continue
    tags = old_tags[base]
    if row["language"] == "javascript" and base == "grades":
        tags = ["ELSE IF"]
    marker = " ".join(f"[{tag}]" for tag in tags)
    changes = manifest["descriptions"].setdefault(row["id"], {})
    for field in ("description", "description_en"):
        if not row[field].endswith(marker):
            old = row[field]
            row[field] += " " + marker
            before=changes.get(field, {}).get("before",hashlib.sha256(old.encode()).hexdigest())
            changes[field] = dict(before=before, value=row[field])

manifest.setdefault("starters", {})
graphics_ids = {"shapes", "drag-circles", "rotate-rectangle", "bouncing-ball", "framerate", "collision"}
for row in entries:
    base, is_js = row["id"].removeprefix("js-"), row["language"] == "javascript"
    if base not in graphics_ids and (is_js or base not in ("guessing", "codebreaker")):
        continue
    starters = {}
    hints = {}
    for locale in ("de", "en"):
        suffix = "" if locale == "de" else "_en"
        de = locale == "de"
        if base not in graphics_ids:
            code = "import random\n"
            hint = "Beginne mit `import random`." if de else "Start with `import random`."
        elif not is_js:
            code = "from pyjs_canvas import Canvas\n"
            if base == "collision":
                code += "from math import cos, sin, radians, hypot\n"
            code += "\ncanvas = Canvas(600, 360)\n"
            hint = "Der Startcode gibt `from pyjs_canvas import Canvas` und die Zeichenfläche vor." if de else "The starter supplies `from pyjs_canvas import Canvas` and the drawing surface."
            if base in ("drag-circles", "bouncing-ball", "framerate", "collision"):
                for event, comment_de, comment_en in [("press", "Figur auswählen und Ziehen beginnen", "Select a shape and start dragging"),
                                                      ("move", "Die ausgewählte Figur verschieben", "Move the selected shape"),
                                                      ("release", "Ziehen beenden", "End the drag")]:
                    code += f"\ndef {event}(x, y):\n    # TODO: {comment_de if de else comment_en}.\n    pass\n"
                code += '\ncanvas.on("press", press)\ncanvas.on("move", move)\ncanvas.on("release", release)\n'
                hint += " `canvas.on(\"press\", press)`, move und release sind bereits verbunden; die Funktionen erhalten Pixelkoordinaten x und y." if de else " `canvas.on(\"press\", press)`, move and release are wired up; functions receive pixel coordinates x and y."
            if base == "rotate-rectangle":
                code += f'\ndef rotate(angle):\n    # TODO: {"Viereck mit diesem Winkel neu zeichnen" if de else "Redraw the rectangle at this angle"}.\n    pass\n\ncanvas.slider("{"Winkel" if de else "Angle"}", 0, 360, 0, rotate)\nrotate(0)\n'
                hint += " Der Winkel-Regler ruft `rotate(angle)` auf." if de else " The angle slider calls `rotate(angle)`."
            if base in ("bouncing-ball", "framerate", "collision"):
                code += f'\ndef update(dt):\n    # TODO: {"Bewegung berechnen und den Ball neu zeichnen" if de else "Calculate movement and redraw the ball"}.\n    pass\n'
                if base == "framerate":
                    code += '\ncanvas.slider("FPS", 10, 60, 30, canvas.set_fps)\n'
                code += f'\ncanvas.animate(update, fps={20 if base == "bouncing-ball" else 30})\n'
                hint += " `canvas.animate()` ruft `update(dt)` auf; dt ist die vergangene Zeit in Sekunden." if de else " `canvas.animate()` calls `update(dt)`; dt is elapsed seconds."
        else:
            code = 'const canvas = graphics.canvas({width: 600, height: 360});\nconst ctx = canvas.getContext("2d");\n'
            hint = "Zeichenfläche und 2D-Kontext stehen bereits im Startcode." if de else "The starter already creates the canvas and its 2D context."
            if base in ("drag-circles", "bouncing-ball", "framerate", "collision"):
                code += '\nfunction point(event) {\n  const box = canvas.getBoundingClientRect();\n  return {x: (event.clientX-box.left)*canvas.width/box.width,\n          y: (event.clientY-box.top)*canvas.height/box.height};\n}\n'
                for event, comment_de, comment_en in [("press", "Figur auswählen und Ziehen beginnen", "Select a shape and start dragging"), ("move", "Die ausgewählte Figur verschieben", "Move the selected shape"), ("release", "Ziehen beenden", "End the drag")]:
                    code += f'\nfunction {event}(event) {{\n  const {{x, y}} = point(event);\n'
                    if event == "press":
                        code += '  canvas.setPointerCapture(event.pointerId);\n'
                    code += f'  // TODO: {comment_de if de else comment_en}.\n}}\n'
                code += '\ncanvas.addEventListener("pointerdown", press);\ncanvas.addEventListener("pointermove", move);\ncanvas.addEventListener("pointerup", release);\ncanvas.addEventListener("pointercancel", release);\n'
                hint += " pointerdown, pointermove und pointerup sind mit press, move und release verbunden. `point(event)` liefert Pixelkoordinaten." if de else " pointerdown, pointermove and pointerup are wired to press, move and release. `point(event)` supplies pixel coordinates."
            if base == "rotate-rectangle":
                code += f'\nfunction rotate(angle) {{\n  // TODO: {"Viereck mit diesem Winkel neu zeichnen" if de else "Redraw the rectangle at this angle"}.\n}}\ncanvas.slider({{label: "{"Winkel" if de else "Angle"}", min: 0, max: 360, value: 0, onChange: rotate}});\nrotate(0);\n'
                hint += " Der Winkel-Regler ruft `rotate(angle)` auf." if de else " The angle slider calls `rotate(angle)`."
            if base in ("bouncing-ball", "framerate", "collision"):
                if base == "framerate":
                    code += '\nlet fps = 30;\ncanvas.slider({label: "FPS", min: 10, max: 60, step: 1, value: 30, onChange: value => {fps = value;}});\n'
                code += f'\nfunction update(dt) {{\n  // TODO: {"Bewegung berechnen und den Ball neu zeichnen" if de else "Calculate movement and redraw the ball"}.\n}}\ncanvas.animate(update);\n'
                hint += " `canvas.animate()` ruft `update(dt)` mit der vergangenen Zeit in Sekunden auf." if de else " `canvas.animate()` calls `update(dt)` with elapsed seconds."
        starters["starter_code" + suffix] = code
        field = "description" + suffix
        old = row[field]
        if hint not in old:
            tags = ""
            # Keep introduction markers at the end of the assignment.
            import re
            match = re.search(r"(?: \[[A-Z ]+\])+$", old)
            if match:
                old, tags = old[:match.start()], match.group()
            row[field] = old + " " + hint + tags
            changes = manifest["descriptions"].setdefault(row["id"], {})
            before = changes.get(field, {}).get("before", hashlib.sha256((old+tags).encode()).hexdigest())
            changes[field] = dict(before=before, value=row[field])
        row.update(starters)
    manifest["starters"][row["id"]] = starters

level_changes={
    **{identity:"Aufbau" for identity in ("level","basics-door","basics-count-up","basics-repeat-message",
        "basics-playlist","basics-list-total","basics-multiplication","basics-energy","basics-profile-card",
        "basics-greet-function","basics-greet-person","basics-rectangle-area","function")},
    "even":"Grundlagen",
}
graphics_levels={"codebreaker":"Experten","shapes":"Fortgeschritten","drag-circles":"Fortgeschritten","rotate-rectangle":"Fortgeschritten"}
level_changes.update(graphics_levels)
manifest.setdefault("level_updates",{})
for row in entries:
    base=row["id"].removeprefix("js-")
    if base in level_changes:
        target=level_changes[base]
        if row["level"]!=target:
            previous=manifest["level_updates"].get(row["id"],{}).get("before",row["level"])
            manifest["level_updates"][row["id"]]=dict(before=previous,value=target)
            row["level"]=target

manifest["graphics_level_updates"]={row["id"]:manifest["level_updates"][row["id"]] for row in entries if row["id"].removeprefix("js-") in graphics_levels}

for name, value in [("learn-defaults.json", entries), ("learn-solutions.json", solutions), ("learn-solutions-en.json", english),
                    (manifest_path.name, manifest), ("tests/basics-cases.json", cases)]:
    (root / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
