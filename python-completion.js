import {syntaxTree} from "@codemirror/language";
import {insertCompletionText, snippetCompletion} from "@codemirror/autocomplete";

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
};

const options = Object.fromEntries(Object.entries(methods).map(([type, entries]) => [type,
  entries.map(([label, info, argument]) => {
    const completion = snippetCompletion(argument ? `${label}(\${})` : `${label}()`, {
      label, type:"method", detail:`${type}.${label}()`, info,
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
        names.set(text(param), Object.hasOwn(methods, annotation) ? annotation : null);
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
  return options[type] ? {from:dot.to, options:options[type], validFor:/^[A-Za-z_0-9]*$/} : null;
}
