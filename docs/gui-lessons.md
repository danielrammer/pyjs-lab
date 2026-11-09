# GUI lessons in PYJS Learn

The Python-only **GUI** category contains twelve ordered lessons. Two introduce
module imports; the others introduce NiceGUI elements, callbacks, CSS, input,
conditions and state, followed by a quiz and an open Mini-Pro1 task.

`learn-gui.json` contains bilingual descriptions, English-only starter code and
private sample solutions. It is a server-side file: do not import it into the
browser bundle or expose it as a static download. The public Learn API strips
solutions; normal teacher release controls apply. GUI challenge comments use
the English description even when the surrounding interface is German.

`add_gui_lessons()` adds missing IDs once using the `gui-lessons-v1` migration.
Existing IDs, teacher edits, visibility and release choices are retained.
Subsequent restarts do not restore deliberately deleted tasks. This category is
served by the Learn API rather than the standalone `file://` fallback.

Deployment uploads the JSON and mounts it read-only into the existing Learn
container. The existing database and personal results remain in place.

Verification:

```sh
python -m unittest discover -s tests -p 'test_*.py'
node build.mjs
node tests/gui-learn.browser.cjs
```

The browser test runs all starter programs and reference solutions, exercises
the controls, checks bilingual grouping and confirms unreleased solutions are
unavailable. `BASE_URL` selects a deployed site; without it, tests use a temporary
database. School devices and the school network still require a classroom check.
