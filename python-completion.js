import {syntaxTree} from "@codemirror/language";
import {insertCompletionText, snippetCompletion} from "@codemirror/autocomplete";
import {t,registerTranslations} from "./i18n.js";

const methods = {
  str: [
    ["lower", "Kleinbuchstaben", false], ["upper", "Großbuchstaben", false],
    ["capitalize", "Ersten Buchstaben groß schreiben", false],
    ["title", "Wortanfänge groß schreiben", false],
    ["casefold", "Für Vergleiche ohne Groß-/Kleinschreibung", false],
    ["strip", "Leerraum an beiden Enden entfernen", false],
    ["lstrip", "Leerraum am Anfang entfernen", false],
    ["rstrip", "Leerraum am Ende entfernen", false],
    ["split", "In eine Liste von Teilstrings aufteilen", false],
    ["rsplit", "Von rechts aufteilen", false],
    ["splitlines", "In einzelne Zeilen aufteilen", false],
    ["replace", "Teilstring ersetzen", true], ["find", "Position eines Teilstrings suchen", true],
    ["index", "Position eines Teilstrings ermitteln", true],
    ["count", "Vorkommen eines Teilstrings zählen", true],
    ["startswith", "Anfang prüfen", true], ["endswith", "Ende prüfen", true],
    ["join", "Strings aus einer Sammlung verbinden", true],
    ["removeprefix", "Präfix entfernen", true], ["removesuffix", "Suffix entfernen", true],
    ["isalpha", "Auf Buchstaben prüfen", false], ["isdigit", "Auf Ziffern prüfen", false],
    ["isalnum", "Auf Buchstaben und Ziffern prüfen", false],
    ["isspace", "Auf Leerraum prüfen", false],
  ],
  list: [
    ["append", "Ein Element anhängen", true], ["extend", "Mehrere Elemente anhängen", true],
    ["insert", "Element an einer Position einfügen", true],
    ["remove", "Element entfernen", true], ["pop", "Element entfernen und zurückgeben", false],
    ["clear", "Alle Elemente entfernen", false], ["copy", "Liste kopieren", false],
    ["count", "Vorkommen zählen", true], ["index", "Position eines Elements ermitteln", true],
    ["sort", "Liste sortieren", false], ["reverse", "Reihenfolge umkehren", false],
  ],
  dict: [
    ["get", "Wert zu einem Schlüssel abfragen", true],
    ["keys", "Schlüssel abfragen", false], ["values", "Werte abfragen", false],
    ["items", "Schlüssel-Wert-Paare abfragen", false],
    ["update", "Einträge ergänzen oder ersetzen", true],
    ["pop", "Eintrag entfernen und zurückgeben", true],
    ["setdefault", "Wert abfragen oder Standardwert setzen", true],
    ["clear", "Alle Einträge entfernen", false], ["copy", "Dictionary kopieren", false],
  ],
  canvas: [
    ["clear","Zeichenfläche leeren; optional eine Hintergrundfarbe setzen",false,'clear()',"Canvas.clear(color=None)"],
    ["circle","Kreis zeichnen: Mittelpunkt x/y, Radius und Farbe",true,'circle(${1:300}, ${2:180}, ${3:30}, "${4:royalblue}")',"Canvas.circle(x, y, radius, color='royalblue')"],
    ["rectangle","Viereck zeichnen; Winkel in Grad um den Mittelpunkt",true,'rectangle(${1:100}, ${2:100}, ${3:160}, ${4:80}, "${5:purple}", angle=${6:0})',"Canvas.rectangle(x, y, width, height, color='purple', angle=0)"],
    ["on","press, move oder release mit einer Funktion verbinden",true,'on("${1:press}", ${2:press})',"Canvas.on(event, callback)"],
    ["slider","Regler hinzufügen und Änderungen an eine Funktion senden",true,'slider("${1:Winkel}", ${2:0}, ${3:360}, ${4:0}, ${5:rotate})',"Canvas.slider(label, minimum, maximum, value, on_change, step=1)"],
    ["animate","Animation starten; die Funktion erhält dt in Sekunden",true,'animate(${1:update}, fps=${2:60})',"Canvas.animate(callback, fps=60)"],
    ["set_fps","Framerate zwischen 1 und 120 ändern",true,'set_fps(${1:30})',"Canvas.set_fps(fps)"],
    ["stop","Die Animation anhalten",false],
    ["close","Zeichenfläche schließen und Animation beenden",false],
    ["width","Breite der Zeichenfläche in Pixeln",false,"width","Canvas.width","property"],
    ["height","Höhe der Zeichenfläche in Pixeln",false,"height","Canvas.height","property"],
  ],
};

const helpEnglish = {
  str: ["Lowercase","Uppercase","Capitalize the first letter","Capitalize each word","Case-insensitive comparison","Remove surrounding whitespace","Remove leading whitespace","Remove trailing whitespace","Split into a list of strings","Split from the right","Split into lines","Replace a substring","Find a substring position","Get a substring position","Count substring occurrences","Check the beginning","Check the ending","Join a collection of strings","Remove a prefix","Remove a suffix","Check for letters","Check for digits","Check for letters and digits","Check for whitespace"],
  list: ["Append one item","Append multiple items","Insert an item at a position","Remove an item","Remove and return an item","Remove all items","Copy a list","Count occurrences","Find an item position","Sort a list","Reverse the order"],
  dict: ["Get a value by key","Get keys","Get values","Get key-value pairs","Add or replace entries","Remove and return an entry","Get a value or set a default","Remove all entries","Copy a dictionary"],
  canvas: ["Clear the canvas; optionally set a background colour","Draw a circle: centre x/y, radius and colour","Draw a rectangle; rotate in degrees around its centre","Connect press, move or release to a function","Add a slider and send changes to a function","Start animation; the function receives dt in seconds","Change frame rate between 1 and 120","Stop the animation","Close the canvas and stop animation","Canvas width in pixels","Canvas height in pixels"],
};
registerTranslations(Object.entries(methods).flatMap(([type,entries])=>entries.map((entry,i)=>[entry[1],helpEnglish[type][i]])));

const options = Object.fromEntries(Object.entries(methods).map(([type, entries]) => [type,
  entries.map(([label, info, argument, template, signature, kind]) => {
    const completion = snippetCompletion(template || (argument ? `${label}(\${})` : `${label}()`), {
      label, type:kind || "method", detail:signature || `${type}.${label}()`, info,
    });
    const applySnippet = completion.apply;
    return {...completion, apply(view, item, from, to) {
      // Preserve parentheses already typed by the user.
      if (view.state.sliceDoc(to, to + 1) === "(") {
        view.dispatch(insertCompletionText(view.state, label, from, to));
      } else applySnippet(view, item, from, to);
    }};
  }),
]));

function children(node) {
  const result = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function inferType(node, state, names) {
  if (!node) return null;
  const text = item => state.sliceDoc(item.from, item.to);
  const p = children(node);
  switch (node.name) {
    case "String": case "FormatString": return "str";
    case "ArrayExpression": return "list";
    case "DictionaryExpression": return "dict";
    case "Number": case "Boolean": case "None": return "other";
    case "VariableName": return names.get(text(node)) || null;
    case "ParenthesizedExpression": return inferType(p[1], state, names);
    case "BinaryExpression":
      return ["+", "*"].includes(text(p[1])) && inferType(p[0], state, names) === "str" ? "str" : null;
    case "CallExpression": {
      const callee = p[0], name = text(callee);
      if((name==="Canvas"&&!names.has(name))||names.get(name)==="canvas-constructor")return "canvas";
      if(callee.name==="MemberExpression"){
        const member=children(callee);
        if(text(member.at(-1))==="Canvas"&&names.get(text(member[0]))==="canvas-module")return "canvas";
      }
      if (["str", "input"].includes(name)) return "str";
      if (["list", "sorted"].includes(name)) return "list";
      if (name === "dict") return "dict";
      if (["int", "float", "bool", "len"].includes(name)) return "other";
      if (callee.name === "MemberExpression") {
        const member = children(callee), type = inferType(member[0], state, names);
        const method = text(member.at(-1));
        if (type === "str") {
          if (["split", "rsplit", "splitlines"].includes(method)) return "list";
          if (/^is/.test(method) || ["find", "index", "count", "startswith", "endswith"].includes(method)) return "other";
          if (methods.str.some(([label]) => label === method)) return "str";
        }
        if (["list", "dict"].includes(type) && method === "copy") return type;
      }
      return null;
    }
    default: return null;
  }
}

function visibleTypes(state, member, pos) {
  const scopes = [];
  for (let node = member; node; node = node.parent) {
    if (["Script", "FunctionDefinition", "ClassDefinition"].includes(node.name)) scopes.unshift(node);
  }
  const names = new Map();
  const text = node => state.sliceDoc(node.from, node.to);
  for (const scope of scopes) {
    const parameters = scope.getChild("ParamList");
    if (parameters) {
      const params = children(parameters);
      params.forEach((param, index) => {
        if (param.name !== "VariableName") return;
        const annotation = params[index + 1]?.name === "TypeDef" ? text(params[index + 1]).slice(1).trim() : null;
        names.set(text(param), annotation==="Canvas"?"canvas":Object.hasOwn(methods, annotation) ? annotation : null);
      });
    }
    const visit = node => {
      if (node.from >= pos || ["FunctionDefinition", "ClassDefinition"].includes(node.name)) return;
      if (node.name === "AssignStatement" && node.to < pos) {
        const p = children(node), operator = p.findIndex(child => child.name === "AssignOp");
        if (operator > 0 && p[operator - 1].name === "VariableName") {
          names.set(text(p[operator - 1]), inferType(p[operator + 1], state, names));
        }
      }
      if(node.name==="ImportStatement"&&node.to<pos){
        const source=text(node),constructor=source.match(/^from\s+pyjs_canvas\s+import\s+Canvas(?:\s+as\s+(\w+))?\s*$/),module=source.match(/^import\s+pyjs_canvas(?:\s+as\s+(\w+))?\s*$/);
        if(constructor)names.set(constructor[1]||"Canvas","canvas-constructor");
        if(module)names.set(module[1]||"pyjs_canvas","canvas-module");
      }
      children(node).forEach(visit);
    };
    children(scope.getChild("Body") || scope).forEach(visit);
  }
  return names;
}

export function pythonMemberCompletion(context) {
  let node = syntaxTree(context.state).resolveInner(context.pos, -1);
  while (node && node.name !== "MemberExpression") node = node.parent;
  if (!node) return null;
  const p = children(node), dot = p[1];
  if (dot?.name !== "." || context.pos < dot.to) return null;
  const suffix = context.state.sliceDoc(dot.to, context.pos);
  if (!/^[A-Za-z_0-9]*$/.test(suffix)) return null;
  const type = inferType(p[0], context.state, visibleTypes(context.state, node, context.pos));
  return options[type] ? {from:dot.to, options:options[type].map(item=>({...item,info:t(item.info)})), validFor:/^[A-Za-z_0-9]*$/} : null;
}

registerTranslations([["Canvas erstellen; benötigt from pyjs_canvas import Canvas","Create a Canvas; requires from pyjs_canvas import Canvas"]]);
const canvasConstructor=snippetCompletion('Canvas(${1:600}, ${2:360})',{label:"Canvas",type:"class",detail:"Canvas(width=600, height=360, title='Python Canvas')"});
export function pythonCanvasCompletion(context){
  const word=context.matchBefore(/[A-Za-z_][A-Za-z_0-9]*/);if(!word)return null;
  for(let node=syntaxTree(context.state).resolveInner(context.pos,-1);node;node=node.parent){
    if(["Comment","String","FormatString","MemberExpression"].includes(node.name))return null;
  }
  return {from:word.from,options:[{...canvasConstructor,info:t("Canvas erstellen; benötigt from pyjs_canvas import Canvas")}],validFor:/^[A-Za-z_0-9]*$/};
}
