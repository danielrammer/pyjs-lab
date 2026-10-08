import test from "node:test";
import assert from "node:assert/strict";
import {EditorState} from "@codemirror/state";
import {python} from "@codemirror/lang-python";
import {CompletionContext} from "@codemirror/autocomplete";
import {pythonMemberCompletion} from "../python-completion.js";

function completion(source) {
  const pos = source.indexOf("|");
  const state = EditorState.create({doc:source.replace("|", ""), selection:{anchor:pos}, extensions:[python()]});
  return {state, result:pythonMemberCompletion(new CompletionContext(state, pos, false)), pos};
}

const labels = source => completion(source).result?.options.map(option => option.label) || [];

test("string variables, literals, aliases, input(), and method chains", () => {
  for (const source of [
    'name = "World"\nname.|', '"World".|', 'name = "World"\ncopy = name\ncopy.lo|',
    'name = input("Name: ")\nname.|', 'name = "World"\nname.strip().|',
    'def greet(name: str):\n    name.|',
  ]) {
    assert.ok(labels(source).includes("lower"), source);
    assert.ok(labels(source).includes("replace"), source);
    assert.ok(!labels(source).includes("append"), source);
  }
});

test("lists and dictionaries get their own methods", () => {
  assert.ok(labels('items = []\nitems.|').includes("append"));
  assert.ok(!labels('items = []\nitems.|').includes("lower"));
  assert.ok(labels('data = {}\ndata.|').includes("get"));
  assert.ok(labels('name = "a b"\nname.split().|').includes("append"));
});

test("reassignments, parameters, comments, and unrelated scopes", () => {
  for (const source of [
    'name = "World"\nname = 3\nname.|', 'name = "World"\n# name.|',
    'name = "World"\nprint("name.lo|")',
    'name = "World"\ndef greet(name):\n    name.|',
    'def greet():\n    name = "World"\nname.|',
  ]) assert.deepEqual(labels(source), [], source);
});

test("acceptance inserts a call and preserves existing parentheses", () => {
  for (const source of ['name = "World"\nname.lo|', 'name = "World"\nname.lo|()']) {
    const {state, result, pos} = completion(source);
    const option = result.options.find(item => item.label === "lower");
    const view = {state, dispatch(spec) { this.state = this.state.update(spec).state; }};
    option.apply(view, option, result.from, pos);
    assert.equal(view.state.doc.toString(), 'name = "World"\nname.lower()');
  }
});
