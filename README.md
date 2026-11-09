# PYJS Code Lab

A lightweight local playground for writing and running Python and JavaScript in
the same browser interface.

## Features

- Python execution in the browser with Pyodide
- Interactive Python charts, sliders, and buttons with Matplotlib
- JavaScript execution without a backend
- CodeMirror 6 editor with high-contrast syntax highlighting
- Separate editor content for Python and JavaScript
- Optional best-effort Python ↔ JavaScript conversion
- Automatic, manual, or disabled code completion
- Dark and light themes
- Open and save local source files
- Keyboard shortcuts for running code and opening completion
- Configurable product or school name

## Start without a web server

Open `index.html` in your browser, for example by double-clicking it in your file
manager. The application supports direct `file://` use and does not require a
local server.

From a Linux terminal, you can run:

```bash
xdg-open /path/to/pyjs-lab/index.html
```

CodeMirror is bundled with the project. An internet connection is only required
when Python is started for the first time, because the Pyodide runtime is loaded
from its CDN. Python packages such as NumPy and Matplotlib are downloaded on
their first import. The editor and JavaScript execution do not require that download.

## Optional local server

If your browser applies unusually strict restrictions to local pages, start a
local server from the project directory:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## DigitalOcean deployment

The public editor is served at `https://pyjs.ancora.cyou` on the existing
DigitalOcean droplet `207.154.233.46`. Run `./deploy/deploy.ps1` in PowerShell
after rebuilding `app.bundle.js`. It uses the existing SSH key; override
`-IdentityFile` if needed.

PYJS has its own exact Nginx `server_name`, static root `/home/dnl/pyjs/current`,
and Let's Encrypt certificate. Unknown paths return 404 rather than falling
back to the Ancora landing page. Each deployment uploads a timestamped release,
backs up the live Nginx configuration, changes only the marked PYJS section,
validates Nginx before reloading, and rolls back its configuration on failure.
The vhost is appended to the existing Ancora config to use the server's current
restricted sudo permissions. A daily user cron job renews the certificate.
Preserve the `BEGIN PYJS` / `END PYJS` section when deploying Ancora separately.

The public deployment uses `deploy/config.js` with the PYJS product name.
The local `config.js` can retain a different school name.

## Configuration

Change the visible product or school name in `config.js`:

```javascript
window.TITLE_CONFIG = {
  productName: "PYJS"
};
```

Reload the page after changing the value. The main application code does not
contain a fixed product name.

## Usage

- Switch between **Python** and **JavaScript** using the buttons in the header.
- Click **Run** or press `Ctrl+Enter` to execute the current code.
- In JavaScript, `print(...)` writes to the output panel like `console.log(...)`.
- On the hosted site, Python `input("Your question: ")` shows an input field below
  Output, keeping earlier output visible. Enter or **Senden** submits the answer;
  **Abbrechen** cancels it. Python can catch the resulting `EOFError`.
  Python runs in a browser worker; the site uses cross-origin isolation headers
  for shared input memory. Direct `file://` use and servers without those headers
  retain the browser input dialog as a fallback.
- Click **Clear** to clear text and graphics.
- Drag the separator between code and output to resize the panels. On small
  screens it adjusts their heights. Arrow keys resize a focused separator;
  double-click restores the default proportions.
- **Load** and **Save** open a choice: one current code file, or all saved
  Challenge results. **Save all solutions** downloads a single versioned JSON
  backup containing both languages, all attempts, code, text output and dates.
  **Load solutions** merges that backup into this browser, skipping identical
  entries and preserving existing results. Invalid files leave stored results
  unchanged. Imported code is stored without being executed. **Load file** and
  **Save current file** still use `.py`, `.js`, `.mjs`, and text files.
- Switch between the dark and light themes with the theme button.
  The choice is remembered in this browser and restored before the page renders.
- Cycle completion through `AUTO`, `MANUAL`, and `OFF`.
- Press `Ctrl+Space` to open completion in `AUTO` or `MANUAL` mode.
- Press `Ctrl+/` or `Ctrl+#` (German keyboard) to toggle comments on the current
  line or selected lines. Python uses `#`; JavaScript uses `//`.
- Press `Enter` or `Tab` to accept a visible completion. JavaScript completion
  includes `console` and its methods, such as `log`, `warn`, and `error`.
- Python completion includes methods on recognized strings, lists, and
  dictionaries. For example, type `name.` after `name = "World"` to find
  `lower()`, `upper()`, `strip()`, `split()`, and `replace()`. Accepting a method
  inserts its parentheses. Recognition uses simple assignments, aliases,
  built-in constructors, and parameter annotations; it does not execute code.
- Indentation uses four spaces in Python and two spaces in JavaScript. Braces
  and other block endings align automatically as you type; `Tab` and
  `Shift+Tab` indent and unindent the selected lines.
- Press `Alt+Shift+F` to reindent the selected lines (select all first to
  reindent the whole document).

### Rebuild the editor bundle

After editing the application, run `pnpm install` and `pnpm build` to regenerate
`python-worker.bundle.txt` and `app.bundle.js`. Commit the generated bundles so opening `index.html` directly
continues to work without installing dependencies.

Run `pnpm test` for conversion tests. These execute the original, converted,
and round-trip programs and compare their output. Python must be on your PATH;
set the `PYTHON` environment variable to its executable path if needed.

### Python graphics

Click **Graphics → Load example**, then **Run**, to try a sine wave with an
interactive amplitude slider. The default editor content remains comments only.
You can also open `examples/graphics.py` or write ordinary Matplotlib code:

```python
import matplotlib.pyplot as plt

plt.plot([1, 2, 3, 4], [2, 5, 3, 8])
plt.title("My first chart")
plt.show()
```

Charts automatically appear in Graphics. **Pan** lets you drag the axes;
**Zoom** lets you select a rectangle. **Reset**, **Back**, and **Forward** navigate
between views. **Save PNG** downloads the current chart; **Full screen** expands
the view. Matplotlib sliders, buttons, and mouse/key callbacks can update the
chart using `fig.canvas.draw_idle()`. Multiple figures appear as separate cards.
Output remains available in its own tab, and each run replaces the previous
figures. **Both** shows text output above graphics simultaneously; the console
can be resized vertically. This mode stays selected during runs, new figures and
Python input prompts. The **Output** and **Graphics** tabs still provide single views.
Figures still open at the end of the program are displayed even without
`plt.show()`; `plt.close()` removes them.

Graphics and Python execute locally in the browser. Matplotlib figures, widgets
and timers are supported; desktop GUI toolkits are not supported. For interactive
shapes, use `from pyjs_canvas import Canvas`. A Canvas supports `clear`, `circle`,
`rectangle` (including an angle in degrees), pointer events via `on`, `slider`,
and `animate(callback, fps=60)`. Animation callbacks receive elapsed seconds;
`set_fps` changes the update rate. JavaScript Canvas provides the corresponding
`canvas.animate(callback)` API. Clear, closing a canvas and running again stop
its animation. Matplotlib remains available for scientific charts.
Packages included in Pyodide are loaded automatically from
imports, as described in the [Pyodide package-loading documentation](https://pyodide.org/en/0.27.7/usage/loading-packages.html).

`pnpm test:browser` runs the real-browser input and graphics tests. It requires
Playwright available to Node and a Chromium installation. Set `PYTHON` to the
Python executable and optionally `BROWSER_CHANNEL=msedge` for Microsoft Edge.
`BASE_URL` targets an existing site; otherwise the test starts a local server.
`pnpm test:experts-browser` checks six graphics challenges in both languages:
shapes, draggable circles, center rotation, a bouncing ball, elapsed time,
and collisions against a tilted rectangle. Set `LOCALE=en` to execute the
English solutions instead of German solutions.
Each challenge includes a private solution that teachers can release in Manage
tasks. Level Check now asks for points. Codebreaker explains its feedback with
a worked example, records each guess, and counts only valid guesses toward its
ten attempts; leading zeroes are allowed.
The following challenge, “Ball: unterschiedliche Frameraten”, adds elapsed time
and an FPS slider (10–60) to compare motion at different update rates. Both
languages include a locked solution; large time steps after a pause are capped.
`pnpm test:learn-browser` uses a temporary local Learn server to verify password
checks, session revocation, and rejection of anonymous edits.
`pnpm test:solutions-browser` executes all twelve solutions in real PYJS, including
input validation, cancellation, visible console output, and solution release/relock.

### JavaScript graphics

With JavaScript selected, **Graphics → Load example → Run** loads the JavaScript
sine wave with an amplitude slider and reset button. `graphics.plot(x, y, options)`
draws numeric arrays, with the same Pan, Zoom, Reset, Back, Forward and Save PNG
controls as Python. Options include `title`, `xlabel`, `ylabel`, `color`, `xlim`,
`ylim`, `width` and `height`. The returned chart supports `setData(x,y)`,
`slider({label,min,max,step,value,onChange})`, `button(label,callback)` and `close()`.

For free drawing, `graphics.canvas({title,width,height})` returns a standard
HTML Canvas in Graphics. Use its `getContext("2d")` and pointer listeners as usual.
It also supports `slider(...)`, `button(...)` and `close()`. Interactive callbacks
can write to Output with `console.log()`. Runs and Clear remove previous figures.
Both chart and Canvas graphics work locally without extra packages.
`pnpm test:javascript-browser` checks all twelve JS solutions, separate solution
release settings, charts/Canvas, controls, PNG export and panel resizing.

### Optional code conversion

`Convert Py ↔ JS` is `OFF` by default. In this mode, Python and JavaScript
documents remain separate when you switch languages.

When it is set to `ON`, switching languages converts the current document and
replaces the target editor content. The converter supports common educational
examples, including variables, output statements, functions, nested conditions,
`while` loops, array/list iteration, indexing, `push`/`append`, and `length`/`len`.
Counter loops support `++`, `--`, integer steps, and inclusive or exclusive
bounds. Python ranges support positive and negative integer steps and retain
their endpoint evaluation and final loop-variable behavior. Strings and
comments are preserved, including multiple interpolated output arguments.

Try opening `examples/conversion.js` or `examples/conversion.py`, enable
**Convert Py ↔ JS**, switch languages, and run the result. Both examples
include functions, arrays, nested loops, and descending counters, and are
covered by execution and round-trip tests.

The converter is intentionally best effort. Python and JavaScript have different
language semantics, so arbitrary programs, third-party libraries, asynchronous
code, classes, and complex expressions may require manual corrections after
conversion. Type coercion, truthiness, numeric operators, and printed values
can also have different semantics. Counter loops whose bodies change their
counter or bounds require manual conversion. Unsupported syntax stops
conversion with a source line number and preserves both documents. Save
important target code before a successful conversion replaces it.

## Learn

**Learn** opens forty-one bilingual challenges for the selected editor language, Python
or JavaScript, with number, challenge, assignment, and level. The language selector
in Learn can switch lists independently. **Manage tasks** opens the
password-protected admin view for that list, where you can
add, edit, reorder, or delete tasks, change their level, and then save.
The **Visible** checkbox hides a task from learners without deleting its content
or saved browser results. Hidden tasks' solution URLs are also unavailable.
The public list is grouped into levels that start collapsed; **Next challenge** follows
that grouped order. Each new concept's first exercise ends with a marker such as
`[IF]`, `[LISTS]` or `[ARRAYS]`. The 23 added practice tasks per language use
original assignments inspired by the introductory topics at
[LearnPython](https://www.learnpython.org/).
Per language, 18 tasks cover output, values, arithmetic, simple input and conditions,
strings and basic list operations. The 15 intermediate tasks introduce validation,
combined conditions, loops, dictionaries/objects and functions. Four advanced tasks
cover guessing a number, drawing shapes, dragging circles and rotation. The four
expert tasks cover Codebreaker and three physics simulations. Level updates preserve
teacher-defined levels and release settings.
Edits are shared by all visitors and stored in SQLite on the server; opening
`index.html` directly shows the initial tasks in read-only mode.

Each initial task has a solution in its language, locked by default. In **Manage
tasks**, expand **Python-Lösung bearbeiten** or **JavaScript-Lösung bearbeiten**
to edit it, select **Lösung für
Lernende freigeben**, and save. Learners can then open **Lösung ansehen**. Uncheck
the option and save to lock it again. Locked solution code is never included in
the public task list or editor bundle; the server only delivers released solutions.
The private `learn-solutions.json` catalog seeds missing solutions at startup,
preserving existing tasks, admin edits, and release settings. A one-time database
migration adds the JavaScript catalog; later restarts preserve deleted JS tasks.
Saving one language leaves the other language's tasks and releases unchanged.

The header's **DE / EN** selector switches the interface, assignments and default
commented solutions, and remembers that preference in the browser. Admins can
edit German and English titles, assignments and solutions separately. One release
checkbox controls both translations and stays visible when the solution editor
is collapsed. **Show all solutions / Hide all solutions** checks or unchecks
every release checkbox in the selected programming language; **Save changes**
publishes that selection. Custom entries without a translation fall back to their original
text. Private English solutions live in `learn-solutions-en.json` and are protected
like the German catalog. `node tests/i18n.browser.cjs` verifies persistence, release
controls, translation previews and all 24 English introductory solutions.

Ctrl+click a variable or function in the editor to select and scroll to its
declaration in the current document. Python and JavaScript local scopes and
parameters are supported. Comments, string contents and external built-ins do
not navigate. `pnpm test:navigation-browser` checks the actual pointer gesture,
selection and scrolling in both editor languages. Holding Ctrl while hovering
over an available declaration changes the mouse cursor to a pointer.

**Start Challenge** loads the task instructions as comments into the editor.
Graphics challenges also supply Canvas setup, required Python imports, event
registrations and TODO functions. Animation and slider wiring is provided where
needed, while drawing, drag logic and physics remain the learner's work.
Python completion recognises Canvas constructors, import aliases and copies,
and lists drawing methods, event callbacks, sliders, animation and dimensions.
`pnpm test:basics-browser` executes all 92 new translated solutions and the twelve
graphics scaffolds, and checks completion, grouped folding and task visibility.
**Ergebnis speichern** stores the code, current text output and execution status
in this browser's local storage. **Nächste Challenge** starts the following task.
The **Meine Ergebnisse** column opens saved attempts for each task; **Alle
Ergebnisse** also lists attempts whose task was removed. Each save creates a new
version. Saved code can be reopened in the editor, and individual versions can
be deleted after confirmation. Results stay after reloads and browser restarts,
are separate for Python/JavaScript, and are never uploaded to the Learn service.
They belong to this browser profile on this device; clearing site data removes
them. Chart images are recreated by running the saved code.

The wider Learn dialog closes with Escape, its close button, or a click outside
the dialog; each close ends an admin session. `pnpm test:learn-results-browser`
checks the editor workflow, persistence, version history, output matching,
storage failures, deletion, browser isolation and backdrop logout.
`pnpm test:file-actions-browser` checks JSON backup/restore, duplicate handling,
conflicting IDs, atomic validation and individual code file loading/saving.

The Learn service uses Python's standard library and an HTTP-only session cookie.
Passwords are checked on the server against a salted scrypt hash. Sessions expire
after eight hours at most. Every **Manage tasks** click requires the password again;
saving, cancelling, closing Learn (including Escape), or leaving the page ends the
admin session. Five failed login attempts block that address for five minutes.
Run `python -m unittest discover -s tests -p 'test_learn.py'` to test authentication,
validation, concurrent edits, and persistence.

### Learn service deployment

Run `deploy/deploy.ps1` from the repository after rebuilding the bundle. On the
first deployment, pass `-LearnPassword` with the chosen admin password. Subsequent
deployments preserve the existing password unless that option is supplied again.
The password hash lives in `/home/dnl/pyjs/learn.env` (not in public assets or Git).

The deployment uses the existing `dnl` SSH account and a dedicated PYJS Nginx
section for `pyjs.ancora.cyou`. It preserves the other domains, verifies the editor,
and renews its HTTPS certificate daily. The Learn service runs in Docker, exposed
only on loopback port 3192 behind Nginx. Back up `/home/dnl/pyjs/data/learn.sqlite3`
to preserve tasks. Releases are stored under `/home/dnl/pyjs/releases`; the
`current` symlink selects the live version.

## Toolbar

The toolbar separates Learn/file/run actions from account, language and display
controls. Theme is an icon button with an accessible action label. The editor
settings icon opens completion and conversion controls; Escape or an outside
click dismisses it. An arrow beside Python/JavaScript indicates enabled conversion
on language switch. `npm run test:toolbar-browser` checks toolbar access at nine
viewport widths, keyboard interaction, theme persistence and the retained actions.

## Optional learner accounts

Task management starts as compact rows showing title, description preview, level,
visibility and solution-release switches. Open a row to edit its DE/EN fields and
solutions; only one editor is open at a time, while drafts persist when switching
rows or reordering. Search filters titles/descriptions in both languages and levels.
Adding clears the search, opens and focuses the new task. Mobile retains Add/Save
and puts secondary actions in a dismissible “…” menu in the sticky header.
All changes still require Save; cancellation and closing retain the existing
admin logout behavior. `npm run test:compact-admin-browser` covers these flows.

Signed-in learners can expand **Account → Change password** and supply the current
password and a matching new password twice. A successful change rotates the current
session and revokes all other sessions for that account. Results and pending local
saves are preserved. The API rechecks the current session/password under the same
database lock, checks the expected user ID, rate-limits failed password checks and
uses the existing same-origin JSON restrictions. Admin password reset remains a
separate workflow.

Admins can open **Learn → Manage tasks → Manage users** after entering the admin
password. The overview counts distinct currently visible tasks with synced results
per language and lists version counts and the most recent save. This is evidence
of saved work, not correctness or automatic grading. Per-user details expose all
saved versions, code and output, including results for hidden/removed tasks.
Browser-only work not synced to an account is unavailable to admins.

The detail view allows an admin to set a new password (8–256 characters), with a
confirmation naming the affected user. Reset invalidates all of that user's
server sessions and clears login throttles for that username. Results, other
users and admin authentication remain intact. No passwords/hashes are returned
to the UI. Admin read/reset endpoints require the separate admin session and
reset uses the existing same-origin JSON checks. Closing Learn logs the admin out.
Run `npm run test:admin-users-browser` for the full reset/progress workflow.

The **Konto / Account** button supports self-registration, sign-in and sign-out
with a username (3–40 ASCII letters, digits, dots, underscores or hyphens) and a
password (8–256 characters). Usernames are case-insensitive. There is no email
verification or self-service password recovery. Keep the password safe.

Guest results keep their original browser storage and JSON import/export behavior.
Account results use a separate browser cache per user. Signing in never uploads
guest work automatically: **Browser-Ergebnisse ins Konto übernehmen** explicitly
copies it, leaving the guest originals intact. File actions operate on the
currently selected guest/account results. The editor's code is preserved on
account switches; start/resume a challenge to save it under the selected account.

Saving a challenge writes locally first and queues result-level upserts/deletes
for the Learn service. The account status indicates whether the server confirmed
storage or synchronization is pending. Pending changes remain in the browser
through reloads and retry on reconnect, focus, account opening and every minute
while visible. Results are fetched on sign-in and synchronization; the same account
can retrieve them in another browser/device. Separate saves are separate versions.
Mutations are idempotent and do not replace an entire account snapshot, so a stale
device does not erase new versions or resurrect deletions merely by reconnecting.

Accounts, salted scrypt password hashes, hashed session tokens and private results
are stored in the existing SQLite database. Learner authentication uses its own
HttpOnly, Secure, SameSite=Strict cookie, independent of admin access. Login lasts
at most 30 days; saved results have no automatic expiry. An expected account ID
on mutations prevents writing into a different account after another tab switches
the shared session. Limits: 1000 versions per account, 200000 characters each for
code/output, API body 2 MB. Failed sync never claims successful server storage.
Local pending data can still be lost if browser data is cleared before sync.

Back up `/home/dnl/pyjs/data/learn.sqlite3` to preserve accounts and results as well
as tasks. Never serve this database publicly. Run `python -m unittest discover
-s tests -p 'test_*.py'`, `npm run test:accounts-browser`, and the existing
Learn-results/file-actions browser suites for regression coverage. These checks
cover controlled workflows, not a long-term production reliability guarantee.

## Running code safely

JavaScript runs directly in the page. Only open and execute source files you
trust.
