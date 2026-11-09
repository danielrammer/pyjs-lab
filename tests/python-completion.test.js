import test from "node:test";
import assert from "node:assert/strict";
import {EditorState} from "@codemirror/state";
import {python} from "@codemirror/lang-python";
import {CompletionContext} from "@codemirror/autocomplete";
import {pythonMemberCompletion,pythonCanvasCompletion} from "../python-completion.js";

function completion(source) {
  const pos = source.indexOf("|");
  const state = EditorState.create({doc:source.replace("|", ""), selection:{anchor:pos}, extensions:[python()]});
  return {state, result:pythonMemberCompletion(new CompletionContext(state, pos, false)), pos};
}

const labels = source => completion(source).result?.options.map(option => option.label) || [];

test("Canvas constructors, aliases, parameters and public drawing API",()=>{
  for(const source of [
    'from pyjs_canvas import Canvas\ncan = Canvas()\ncan.|',
    'can = Canvas()\ncan.|',
    'from pyjs_canvas import Canvas as Drawing\ncan = Drawing()\ncan.|',
    'import pyjs_canvas as drawing\ncan = drawing.Canvas()\ncan.|',
    'can = Canvas()\ncopy = can\ncopy.|',
    'def draw(can: Canvas):\n    can.|',
  ]){
    for(const label of ["circle","rectangle","clear","on","slider","animate","set_fps","stop","close","width","height"])assert(labels(source).includes(label),source+label);
    assert(!labels(source).includes("lower"));
  }
  assert(!labels('can = Canvas()\ncan = "text"\ncan.|').includes("circle"));
  const state=EditorState.create({doc:"Can",extensions:[python()]});
  assert.equal(pythonCanvasCompletion(new CompletionContext(state,3,true)).options[0].label,"Canvas");
});

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
