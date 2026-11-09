import test from "node:test";
import assert from "node:assert/strict";
import {EditorState} from "@codemirror/state";
import {python} from "@codemirror/lang-python";
import {javascript} from "@codemirror/lang-javascript";
import {findDeclaration} from "../declaration-navigation.js";

function check(language,source){
  let doc="",position,target=null;
  for(const char of source){if(char==="|")position=doc.length;else if(char==="^")target=doc.length;else doc+=char;}
  const state=EditorState.create({doc,extensions:[language==="python"?python():javascript()]});
  const result=findDeclaration(state,position+1,language);
  if(target===null)assert.equal(result,null,source);
  else{assert.equal(result?.from,target,source);assert(result.to>result.from);}
}

test("Python assignments, functions, parameters and nested scopes",()=>{
  for(const source of [
    '^name = "World"\nprint(|name)',
    '^value = 1\n|value = 2\nprint(value)',
    '^defIgnored = 1\nprint(|defIgnored)',
    'def ^greet(name):\n    return name\nprint(|greet("World"))',
    'name = "Outer"\ndef greet(^name):\n    return |name',
    '^name = "Outer"\ndef greet():\n    return |name\ndef other():\n    name = "Sibling"',
    'value = 0\ndef f():\n    ^value = 2\n    value = 3\n    return |value',
    'a, ^b = [1, 2]\nprint(|b)',
    'a = ^b = 1\nprint(|b)',
    'for ^item in [1, 2]:\n    print(|item)',
    'import random as ^rng\nprint(|rng.random())',
    'from math import sqrt as ^root\nprint(|root(4))',
    '^name = "Outer"\ndef greet(name=name):\n    return name\nprint(|name)',
    '^value = 1\ndef update():\n    global value\n    value = 2\n    print(|value)',
    'def outer():\n    ^value = 1\n    def inner():\n        nonlocal value\n        value = 2\n        return |value',
    '^value = 1\nclass Test:\n    value = 2\n    def method(self):\n        return |value',
  ])check("python",source);
});

test("JavaScript declarations, block shadowing, hoisting and destructuring",()=>{
  for(const source of [
    'const ^name = "World"; console.log(|name);',
    'function ^greet(name) {return name;} console.log(|greet("World"));',
    'const name = "Outer"; function greet(^name) {return |name;}',
    'let name=1; {let ^name=2; console.log(|name);}',
    'const ^f = (value) => value; console.log(|f(2));',
    'const f = (^value) => |value + 1;',
    'function f(){if(true){var ^value=1;} return |value;}',
    'const {a: ^item} = values; console.log(|item);',
    'const [x, ^y] = values; console.log(|y);',
    'for(let ^i=0;i<3;i++){console.log(|i);}',
    'for(const ^value of values){console.log(|value);}',
    'console.log(|greet()); function ^greet(){return 1;}',
    'function f(){return |name;} const ^name="World";',
    'try {} catch(^error){ console.log(|error); }',
    'import {original as ^renamed} from "mod"; console.log(|renamed);',
  ])check("javascript",source);
});

test("Unrelated scopes, comments, strings, properties and external functions do not jump",()=>{
  for(const source of [
    'def other():\n    value = 1\nprint(|value)',
    'name = "World"\nprint("|name")',
    'name = "World"\n# |name',
    'lower = 1\nname = "World"\nname.|lower()',
    '|print("hello")',
    'obj.value = 1\nprint(|value)',
  ])check("python",source);
  for(const source of [
    'function other(){const value=1;} console.log(|value);',
    'if(true){let value=1;} console.log(|value);',
    'const name="World"; console.log("|name");',
    'const name="World"; // |name',
    'const log=1; console.|log("hello");',
    '|console.log("hello");',
  ])check("javascript",source);
});
