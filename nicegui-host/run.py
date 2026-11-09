"""PYJS editor adapter; all GUI objects come from the real NiceGUI package."""
import ast
import asyncio
import inspect
import sys
import traceback
from js import window


class Output:
    def __init__(self, kind):
        self.kind = kind
        self.buffer = ''

    def write(self, text):
        self.buffer += text
        while '\n' in self.buffer:
            line, self.buffer = self.buffer.split('\n', 1)
            window.pyjsSend(self.kind, line)
        return len(text)

    def flush(self):
        if self.buffer:
            window.pyjsSend(self.kind, self.buffer)
            self.buffer = ''


def report(error):
    window.pyjsSend('error', ''.join(traceback.format_exception(error)))


async def run():
    import nicegui_pyodide  # noqa: F401 -- install the browser shims FIRST
    from nicegui import Client, app
    from nicegui_pyodide import page, PyodideRuntime

    sys.stdout = Output('stdout')
    sys.stderr = Output('stderr')
    app.on_exception(report)
    asyncio.get_running_loop().set_exception_handler(
        lambda loop, context: report(context.get('exception') or RuntimeError(context['message']))
    )
    while not hasattr(window, '__pyjs_code'):
        await asyncio.sleep(0.01)

    def no_input(prompt=''):
        raise RuntimeError('In NiceGUI bitte ui.input() statt input() verwenden.')

    namespace = {'__name__': '__main__', 'input': no_input}
    # PYJS supplies only the browser entry point; ui.label/button/style/etc. are
    # unchanged NiceGUI APIs. ui.run() deliberately retains its upstream error.
    with Client(page('/')) as client:
        program = compile(str(window.__pyjs_code), 'main.py', 'exec', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
        result = eval(program, namespace)
        if inspect.isawaitable(result):
            await result
    runtime = PyodideRuntime(client)
    await runtime.mount()
    window.document.getElementById('loading').style.display = 'none'
    sys.stdout.flush()
    sys.stderr.flush()
    window.pyjsSend('done')
    # Keep objects alive for event callbacks until the owning iframe is removed.
    window.__pyjs_namespace = namespace
    return runtime


try:
    runtime = await run()
except Exception as error:
    report(error)
