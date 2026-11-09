"""Connect Python input() to a browser prompt with the program's own message."""
import builtins
import _pyjs_input


def input(prompt="", /):
    value = _pyjs_input.read(str(prompt))
    if value is None:
        raise EOFError("Input cancelled.")
    return str(value)


def install():
    builtins.input = input
