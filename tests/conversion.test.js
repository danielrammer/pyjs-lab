import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {convertCode, ConversionError} from "../converter.js";

function execute(source, language) {
  const python = process.env.PYTHON || "python";
  const result = spawnSync(language === "python" ? python : process.execPath,
    language === "python" ? ["-c", source] : ["--input-type=module", "-e", source],
    {encoding:"utf8", timeout:10000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stderr}\n\nGenerated source:\n${source}`);
  return result.stdout.replace(/\r\n/g, "\n");
}

function equivalent(source, from) {
  const to = from === "javascript" ? "python" : "javascript";
  const expected = execute(source, from);
  const converted = convertCode(source, from, to);
  assert.equal(execute(converted, to), expected);
  const roundTrip = convertCode(converted, to, from);
  assert.equal(execute(roundTrip, from), expected);
  return converted;
}

for (const [language, extension] of [["javascript", "js"], ["python", "py"]]) {
  test(`${language}: complex example and round trip keep the same output`, () => {
    equivalent(readFileSync(new URL(`../examples/conversion.${extension}`, import.meta.url), "utf8"), language);
  });
}

test("inclusive, exclusive, positive, negative, and empty counter loops", () => {
  equivalent(`
for (let i = 0; i < 6; i += 2) { console.log(i); }
for (let i = 0; i <= 6; i += 2) { console.log(i); }
for (let i = 6; i > 0; i -= 2) { console.log(i); }
for (let i = 6; i >= 0; i -= 2) { console.log(i); }
for (let i = 0; i > 6; i--) { console.log(i); }
`, "javascript");
  equivalent(`
for i in range(3):
    print(i)
for i in range(2, 7, 2):
    print(i)
for i in range(5, -2, -2):
    print(i)
for i in range(0):
    print(i)
`, "python");
});

test("strings, escaped braces, and multi-argument interpolation remain intact", () => {
  equivalent('const x = 3; console.log("true && false; !null; { else }; https://example.com"); console.log(`literal {brace}: ${x}`, `second ${x + 1}`);', "javascript");
  equivalent('x = 3\nprint("True and False; not None; { else }; https://example.com")\nprint(f"{{brace}}: {x}", f"second {x + 1}")\n', "python");
});

test("function parameters, sibling functions, and variables assigned inside blocks", () => {
  equivalent(`
def first(value):
    value += 1
    if value > 0:
        result = value * 2
    else:
        result = 0
    return result
def second(value):
    result = value + 10
    return result
print(first(2), second(2))
`, "python");
});

test("Python range preserves its final variable and evaluates endpoints once", () => {
  equivalent(`
values = [10, 20, 30]
_pyjs_index = 99
for i in range(len(values)):
    values.append(i)
print(i, len(values), _pyjs_index)
for i in range(0):
    print("should not run")
print(i)
for i in range(3, 0, -1):
    if i == 2:
        break
print(i)
`, "python");
});

test("a Python function can be reassigned after its declaration", () => {
  equivalent('def value():\n    return 3\nprint(value())\nvalue = 4\nprint(value)\n', "python");
});

test("array indexing, one-line JavaScript statements, and empty blocks", () => {
  equivalent('const values = [1, 2]; values[0] = 3; if (values[0] > 0) console.log(values[0]); function empty() {} empty();', "javascript");
  equivalent('values = [1, 2]\nvalues[0] = 3\nprint(values[0])\ndef empty():\n    pass\nempty()\n', "python");
});

test("boolean conditions, null, unary precedence, and increments", () => {
  equivalent('let i = 0; ++i; if (!(i === 0) && true || false) { console.log(i); } const value = null; if (value === null) { console.log("empty"); }', "javascript");
  equivalent('value = None\nif value == None and not False:\n    print("empty")\n', "python");
});

test("syntax errors and unsupported constructs stop with a source line", () => {
  for (const [language, source] of [
    ["javascript", "const x = ;"],
    ["javascript", "class Example {}"],
    ["javascript", "const doubled = values.map(x => x * 2);"],
    ["javascript", "let def = 3;"],
    ["javascript", "for (let i = 0; i < 5; i++) { i += 1; }"],
    ["javascript", "let stop = 5; for (let i = 0; i < stop; i++) { stop -= 1; }"],
    ["python", "let = 3"],
    ["python", "import math\nprint(math.pi)"],
    ["python", "for i in range(0, 4, 0):\n    print(i)"],
    ["python", 'print(f"{3:.2f}")'],
  ]) {
    assert.throws(() => convertCode(source, language, language === "python" ? "javascript" : "python"), error => error instanceof ConversionError && /line \d+/.test(error.message));
  }
});

test("same-language conversion and empty documents", () => {
  assert.equal(convertCode("untouched", "python", "python"), "untouched");
  assert.equal(convertCode("", "javascript", "python"), "");
  assert.equal(convertCode("", "python", "javascript"), "");
});

for (const [language, extension] of [["javascript", "js"], ["python", "py"]]) {
  test(`${language}: ten round trips keep generated code stable`, () => {
    const original = readFileSync(new URL(`../examples/conversion.${extension}`, import.meta.url), "utf8");
    const other = language === "javascript" ? "python" : "javascript";
    const expected = execute(original, language);
    const firstConverted = convertCode(original, language, other);
    let source = convertCode(firstConverted, other, language);
    for (let cycle = 0; cycle < 10; cycle++) {
      const converted = convertCode(source, language, other);
      assert.equal(converted, firstConverted, "The target document changed after its first conversion");
      const python = language === "python" ? source : converted;
      assert.doesNotMatch(python, / = None\b|_pyjs_/, "Generated declarations and range scaffolds leaked into Python");
      assert.equal(execute(converted, other), expected);
      const next = convertCode(converted, other, language);
      assert.equal(next, source, `Round trip ${cycle + 2} grew or changed generated code`);
      source = next;
    }
  });
}

test("real None assignments and deliberately visible helper variables are preserved", () => {
  const python = 'value = None\nvalue = None\nif value == None:\n    print("empty")\n';
  const converted = equivalent(python, "python");
  assert.equal((convertCode(converted, "javascript", "python").match(/value = None/g) || []).length, 2);
  equivalent('const _pyjs_start = 1; const _pyjs_stop = 3; for (let _pyjs_index = _pyjs_start; _pyjs_index < _pyjs_stop; _pyjs_index += 1) { const value = _pyjs_index; console.log(value); } console.log(_pyjs_stop);', "javascript");
});

test("expression grouping stays correct through repeated normalization", () => {
  let source = 'const value = (2 + 3) * (8 - 4); const negative = -(2 + 3); if (!(value < 10 || negative > 0)) { console.log(value, negative, (12 - 2) / (1 + 1)); }';
  const expected = execute(source, "javascript");
  // Avoid comparing float display conventions by keeping output integral in JS
  // and checking the Python numerical result in its own native representation.
  const python = convertCode(source, "javascript", "python");
  assert.equal(execute(python, "python"), "20 -5 5.0\n");
  source = convertCode(python, "python", "javascript");
  for (let cycle = 0; cycle < 5; cycle++) {
    const next = convertCode(convertCode(source, "javascript", "python"), "python", "javascript");
    assert.equal(next, source);
    assert.equal(execute(next, "javascript"), expected);
    source = next;
  }
});
