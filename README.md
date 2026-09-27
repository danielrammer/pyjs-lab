# PYJS Code Lab

Lokaler Python- und JavaScript-Playground in einer gemeinsamen Oberfläche.

## Start unter Omarchy/Linux

1. Terminal in diesem Projektordner öffnen.
2. Server starten:

   ```bash
   python -m http.server 8000
   ```

3. Im Browser `http://localhost:8000` öffnen.

CodeMirror ist im Projekt gebündelt. Eine Internetverbindung ist beim ersten Python-Start nötig, da die große Pyodide-Laufzeit vom offiziellen CDN bezogen wird. JavaScript und der Editor funktionieren ohne diesen Download. Direktes Öffnen per `file://` wird nicht unterstützt.

## Name ändern

In `config.js` nur `productName` anpassen und die Browserseite neu laden.

## Bedienung

- Sprache oben zwischen Python und JavaScript wechseln; beide Texte bleiben getrennt erhalten.
- Mit dem Theme-Schalter zwischen dunkler und heller Darstellung wechseln.
- Ausführen: Schaltfläche oder `Ctrl+Enter`.
- Completion-Modus durch Anklicken zwischen `AUTO`, `MANUELL` und `AUS` wechseln.
- Manuelle Completion: `Ctrl+Space` (in AUTO und MANUELL).
- Öffnen und Speichern arbeiten mit lokalen `.py`-, `.js`-, `.mjs`- und Textdateien.
- Python wird beim ersten Ausführen im Browser geladen; JavaScript startet sofort.

Hinweis: JavaScript läuft direkt in der Seite. Öffne und führe daher nur vertrauenswürdigen Code aus.
