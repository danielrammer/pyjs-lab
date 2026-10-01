# PYJS Code Lab

A lightweight local playground for writing and running Python and JavaScript in
the same browser interface.

## Features

- Python execution in the browser with Pyodide
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
from its CDN. The editor and JavaScript execution do not require that download.

## Optional local server

If your browser applies unusually strict restrictions to local pages, start a
local server from the project directory:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

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
- Click **Clear** to clear the output panel.
- Use **Open** and **Save** with `.py`, `.js`, `.mjs`, and text files.
- Switch between the dark and light themes with the theme button.
- Cycle completion through `AUTO`, `MANUAL`, and `OFF`.
- Press `Ctrl+Space` to open completion in `AUTO` or `MANUAL` mode.
- Press `Enter` or `Tab` to accept a visible completion. JavaScript completion
  includes `console` and its methods, such as `log`, `warn`, and `error`.
- Indentation uses four spaces in Python and two spaces in JavaScript. Braces
  and other block endings align automatically as you type; `Tab` and
  `Shift+Tab` indent and unindent the selected lines.
- Press `Alt+Shift+F` to reindent the selected lines (select all first to
  reindent the whole document).

### Rebuild the editor bundle

After editing `app.js` or `converter.js`, run `pnpm install` and `pnpm build` to regenerate
`app.bundle.js`. Commit the generated bundle so opening `index.html` directly
continues to work without installing dependencies.

Run `pnpm test` for conversion tests. These execute the original, converted,
and round-trip programs and compare their output. Python must be on your PATH;
set the `PYTHON` environment variable to its executable path if needed.

### Optional code conversion

`Convert on switch` is `OFF` by default. In this mode, Python and JavaScript
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
**Convert on switch**, switch languages, and run the result. Both examples
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

## Security note

JavaScript runs directly in the page. Only open and execute source files you
trust.
