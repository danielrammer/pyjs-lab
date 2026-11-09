import inputSource from "./python_input.py";

export function createPythonInput({append, setStatus}) {
  let cancelled = false;
  let module = null;
  let runtime = null;
  function read(prompt) {
    setStatus("Waiting for input …");
    const value = window.prompt(String(prompt) || "Python input");
    setStatus("Running …");
    if (value === null) { cancelled = true; return null; }
    append(`${prompt}${value}`);
    return value;
  }
  return {
    install(pyodide) {
      runtime = pyodide;
      pyodide.registerJsModule("_pyjs_input", {read});
      pyodide.FS.writeFile("/home/pyodide/pyjs_input.py", inputSource);
      module = pyodide.pyimport("pyjs_input");
    },
    prepareRun() {
      cancelled = false; module?.install();
      // Reset EOF state between runs, including direct sys.stdin reads.
      runtime?.setStdin({stdin:()=>read("Python input: "), isatty:false});
    },
    isCancelled(error) { return cancelled && /EOFError: Input cancelled\.[\r\n]*$/.test(error?.message || ""); },
  };
}
