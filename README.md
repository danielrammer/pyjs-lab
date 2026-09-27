# PYJS Code Lab

Lokaler Python- und JavaScript-Playground in einer gemeinsamen Oberfläche.

## Start ohne Webserver

`index.html` im Dateimanager doppelt anklicken oder im Browser öffnen. Die Anwendung
funktioniert direkt über `file://`; ein lokaler Webserver ist nicht erforderlich.

CodeMirror ist vollständig im Projekt gebündelt. Eine Internetverbindung ist nur
beim ersten Python-Start nötig, da die große Pyodide-Laufzeit vom offiziellen CDN
bezogen wird. JavaScript und der Editor starten ohne diesen Download.

## Optional: lokaler Webserver

Falls ein Browser lokale Seiten besonders streng einschränkt, kann das Projekt
weiterhin über einen lokalen Server geöffnet werden:

   ```bash
   python -m http.server 8000
   ```

Danach im Browser `http://localhost:8000` öffnen.

## Name ändern

In `config.js` nur `productName` anpassen und die Browserseite neu laden.

## Bedienung

- Sprache oben zwischen Python und JavaScript wechseln; beide Texte bleiben getrennt erhalten.
- `Convert on switch` ist standardmäßig `OFF`. Bei `ON` wird der aktuelle Code beim Sprachwechsel bestmöglich in die Zielsprache übertragen und ersetzt dort den bisherigen Editorinhalt. Unterstützt werden typische Lernbeispiele; eine vollständig verlustfreie Übersetzung beliebiger Programme ist nicht möglich.
- Mit dem Theme-Schalter zwischen dunkler und heller Darstellung wechseln.
- Ausführen: Schaltfläche oder `Ctrl+Enter`.
- Completion-Modus durch Anklicken zwischen `AUTO`, `MANUELL` und `AUS` wechseln.
- Manuelle Completion: `Ctrl+Space` (in AUTO und MANUELL).
- Öffnen und Speichern arbeiten mit lokalen `.py`-, `.js`-, `.mjs`- und Textdateien.
- Python wird beim ersten Ausführen im Browser geladen; JavaScript startet sofort.

Hinweis: JavaScript läuft direkt in der Seite. Öffne und führe daher nur vertrauenswürdigen Code aus.
