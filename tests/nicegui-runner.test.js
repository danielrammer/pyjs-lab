import test from "node:test";
import assert from "node:assert/strict";
import {usesNiceGUI} from "../nicegui-runner.js";

test("NiceGUI imports select the GUI runtime without matching prose or other modules",()=>{
  for(const code of ["from nicegui import ui","import nicegui as ng","import math, nicegui","from nicegui.elements import button","import nicegui_pyodide\nfrom nicegui import ui"]){assert(usesNiceGUI(code),code);}
  for(const code of ["# from nicegui import ui",'text="from nicegui import ui"','text="""\nfrom nicegui import ui\n"""',"import nicegui_example","from pyjs_canvas import Canvas","print('hello')"]){assert(!usesNiceGUI(code),code);}
});
