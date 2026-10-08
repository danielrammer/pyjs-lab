import {javascriptLanguage} from "@codemirror/lang-javascript";
import {pythonLanguage} from "@codemirror/lang-python";

// Convert a deliberate subset using the same parsers as the editor. Never
// rewrite string contents or silently copy unsupported syntax into the target.
export class ConversionError extends Error {}

function children(node) {
  const result = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

const punctuation = new Set(["(", ")", "[", "]", "{", "}", ":", ";", ","]);
const isComment = node => ["Comment", "LineComment", "BlockComment"].includes(node.name);
const parts = node => children(node).filter(child => !punctuation.has(child.name) && !isComment(child));
const pythonKeywords = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
const javaScriptKeywords = new Set("await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield implements interface package private protected public static let".split(" "));

class Converter {
  constructor(source, from) {
    this.source = source;
    this.from = from;
    this.toPython = from === "javascript";
    this.tree = (this.toPython ? javascriptLanguage : pythonLanguage).parser.parse(source);
    this.lines = [];
    this.usedNames = new Set(source.match(/[A-Za-z_][A-Za-z_0-9]*/g) || []);
    this.references = new Map();
    this.tree.iterate({enter: node => {
      if (["VariableName", "VariableDefinition"].includes(node.name)) {
        const name = this.text(node);
        this.references.set(name, (this.references.get(name) || 0) + 1);
      }
    }});
  }

  text(node) { return this.source.slice(node.from, node.to); }
  temporary(label) {
    let name = `_pyjs_${label}`;
    let suffix = 1;
    while (this.usedNames.has(name)) name = `_pyjs_${label}_${suffix++}`;
    this.usedNames.add(name);
    return name;
  }
  fail(node, reason = `Unsupported ${node.name}`) {
    const line = this.source.slice(0, node.from).split("\n").length;
    throw new ConversionError(`${reason} (line ${line}).`);
  }
  write(depth, text) { this.lines.push(`${(this.toPython ? "    " : "  ").repeat(depth)}${text}`); }

  convert() {
    this.tree.iterate({enter: node => { if (node.type.isError) this.fail(node, "Invalid source syntax"); }});
    if (!this.toPython) this.declarations(this.tree.topNode, [], 0);
    this.body(this.tree.topNode, 0);
    return this.lines.join("\n") + (this.lines.length ? "\n" : "");
  }

  declarations(body, parameters, depth) {
    // Python assignments belong to the function, even inside if/for blocks.
    // Declare them once at its start rather than hiding them in JS blocks.
    const names = new Set();
    const visit = node => {
      if (node.name === "FunctionDefinition") return;
      if (["AssignStatement", "UpdateStatement"].includes(node.name)) {
        const target = node.firstChild;
        if (target.name === "VariableName") names.add(this.text(target));
      }
      if (node.name === "ForStatement" && node.getChild("VariableName")) names.add(this.text(node.getChild("VariableName")));
      children(node).forEach(visit);
    };
    children(body).forEach(visit);
    parameters.forEach(name => names.delete(name));
    children(body).filter(node => node.name === "FunctionDefinition").forEach(node => names.delete(this.text(node.getChild("VariableName"))));
    if (names.size) this.write(depth, `let ${[...names].join(", ")};`);
  }

  body(node, depth) {
    if (!["Script", "Block", "Body"].includes(node.name)) {
      this.statement(node, depth);
      return;
    }
    const statements = children(node).filter(child => !punctuation.has(child.name));
    const start = this.lines.length;
    this.statements(statements, depth);
    if (this.toPython && node.name !== "Script" && !this.lines.slice(start).some(line => !line.trimStart().startsWith("#"))) this.write(depth, "pass");
  }

  statements(statements, depth) {
    for (let index = 0; index < statements.length; index++) {
      if (this.toPython && this.restoreRange(statements.slice(index, index + 3), depth)) index += 2;
      else this.statement(statements[index], depth);
    }
  }

  restoreRange(nodes, depth) {
    // Recognize the entire generated scaffold, including its reference counts.
    // A name prefix alone must never remove a user's variables or loop code.
    const [startNode, stopNode, loop] = nodes;
    if (startNode?.name !== "VariableDeclaration" || stopNode?.name !== "VariableDeclaration" || loop?.name !== "ForStatement") return false;
    const start = parts(startNode), stop = parts(stopNode);
    if (start.length !== 4 || stop.length !== 4 || start[0].name !== "const" || stop[0].name !== "const") return false;
    const startName = this.text(start[1]), stopName = this.text(stop[1]);
    if (!/^_pyjs_start(?:_\d+)?$/.test(startName) || !/^_pyjs_stop(?:_\d+)?$/.test(stopName)) return false;
    const spec = loop.getChild("ForSpec"), block = loop.getChild("Block");
    if (!spec || !block) return false;
    const s = parts(spec);
    if (s.length !== 3 || s[0].name !== "VariableDeclaration" || s[1].name !== "BinaryExpression" || s[2].name !== "AssignmentExpression") return false;
    const init = parts(s[0]), condition = parts(s[1]), update = parts(s[2]);
    if (init.length !== 4 || init[0].name !== "let" || this.text(init[3]) !== startName) return false;
    const counter = this.text(init[1]);
    if (!/^_pyjs_index(?:_\d+)?$/.test(counter) || this.text(condition[0]) !== counter || this.text(condition[2]) !== stopName || this.text(update[0]) !== counter || this.text(update[1]) !== "+=") return false;
    const step = Number(this.text(update[2]).replace(/\s/g, ""));
    if (!Number.isSafeInteger(step) || step === 0 || this.text(condition[1]) !== (step > 0 ? "<" : ">")) return false;
    if (this.references.get(startName) !== 2 || this.references.get(stopName) !== 2 || this.references.get(counter) !== 4) return false;
    const body = children(block).filter(child => !punctuation.has(child.name));
    const assignment = body[0]?.firstChild;
    if (body[0]?.name !== "ExpressionStatement" || assignment?.name !== "AssignmentExpression") return false;
    const a = parts(assignment);
    if (a.length !== 3 || a[0].name !== "VariableName" || this.text(a[1]) !== "=" || this.text(a[2]) !== counter) return false;
    this.write(depth, `for ${this.identifier(a[0])} in range(${this.expression(start[3])}, ${this.expression(stop[3])}, ${step}):`);
    const firstLine = this.lines.length;
    this.statements(body.slice(1), depth + 1);
    if (!this.lines.slice(firstLine).some(line => !line.trimStart().startsWith("#"))) this.write(depth + 1, "pass");
    return true;
  }

  assignedInScope(node, name) {
    let scope = node.parent;
    while (scope.parent && scope.name !== "Script" && !(scope.name === "Block" && scope.parent.name === "FunctionDeclaration")) scope = scope.parent;
    const assigned = statement => {
      if (statement.name === "FunctionDeclaration") return false;
      if (statement.name === "AssignmentExpression" && this.text(statement.firstChild) === name) return true;
      if (statement.name === "ForOfSpec") {
        const p = parts(statement), of = p.findIndex(child => child.name === "of");
        if (of > 0 && this.text(p[of - 1]) === name) return true;
      }
      return children(statement).some(assigned);
    };
    return children(scope).some(assigned);
  }

  block(node, depth, header) {
    this.write(depth, `${header}${this.toPython ? ":" : " {"}`);
    this.body(node, depth + 1);
    if (!this.toPython) this.write(depth, "}");
  }

  statement(node, depth) {
    const p = parts(node);
    if (isComment(node)) {
      const comment = this.text(node).replace(/^(?:\/\/|#) ?/, "").replace(/^\/\*|\*\/$/g, "");
      comment.split("\n").forEach(line => this.write(depth, `${this.toPython ? "#" : "//"} ${line.trim()}`));
      return;
    }
    switch (node.name) {
      case "FunctionDeclaration":
      case "FunctionDefinition": {
        const name = node.getChild(this.toPython ? "VariableDefinition" : "VariableName");
        const params = parts(node.getChild("ParamList"));
        if (params.some(param => !["VariableDefinition", "VariableName"].includes(param.name))) this.fail(node, "Only simple function parameters are supported");
        const parameterNames = params.map(param => this.identifier(param));
        const body = node.getChild(this.toPython ? "Block" : "Body");
        if (!name || !body || p[0].name !== (this.toPython ? "function" : "def")) this.fail(node);
        this.write(depth, this.toPython ? `def ${this.identifier(name)}(${parameterNames.join(", ")}):` : `function ${this.identifier(name)}(${parameterNames.join(", ")}) {`);
        if (!this.toPython) this.declarations(body, parameterNames, depth + 1);
        this.body(body, depth + 1);
        if (!this.toPython) this.write(depth, "}");
        return;
      }
      case "VariableDeclaration": {
        for (let index = 1; index < p.length;) {
          const target = p[index++];
          const name = this.identifier(target);
          if (p[index]?.name === "Equals") {
            index++;
            this.write(depth, `${name} = ${this.expression(p[index++])}`);
          } else if (!this.assignedInScope(node, name)) this.write(depth, `${name} = None`);
        }
        return;
      }
      case "AssignStatement":
      case "UpdateStatement":
        if (p.length !== 3) this.fail(node, "Only simple assignments are supported");
        this.write(depth, `${this.expression(p[0])} ${this.operator(p[1])} ${this.expression(p[2])};`);
        return;
      case "ExpressionStatement": {
        const expression = p[0];
        if (this.toPython && expression.name === "AssignmentExpression") {
          const assignment = parts(expression);
          this.write(depth, `${this.expression(assignment[0])} ${this.operator(assignment[1])} ${this.expression(assignment[2])}`);
        } else if (this.toPython && (["PostfixExpression", "UpdateExpression"].includes(expression.name) || expression.name === "UnaryExpression" && /^[+-]{2}/.test(this.text(expression)))) {
          const update = parts(expression);
          const target = update.find(child => child.name === "VariableName");
          if (!target) this.fail(expression);
          this.write(depth, `${this.identifier(target)} ${this.text(expression).includes("++") ? "+=" : "-="} 1`);
        } else {
          this.write(depth, `${this.expression(expression)}${this.toPython ? "" : ";"}`);
        }
        return;
      }
      case "IfStatement": {
        if (this.toPython) {
          this.block(p[2], depth, `if ${this.expression(p[1], false)}`);
          if (p[3]?.name === "else") {
            if (p[4].name === "IfStatement") {
              const start = this.lines.length;
              this.statement(p[4], depth);
              this.lines[start] = this.lines[start].replace(/^(\s*)if /, "$1elif ");
            } else this.block(p[4], depth, "else");
          }
        } else {
          for (let index = 0; index < p.length;) {
            const branch = p[index++];
            if (branch.name === "else") this.block(p[index++], depth, "else");
            else {
              const condition = this.expression(p[index++], false);
              this.block(p[index++], depth, `${branch.name === "elif" ? "else if" : "if"} (${condition})`);
            }
          }
        }
        return;
      }
      case "WhileStatement":
        if (p.length !== 3) this.fail(node, "while/else is not supported");
        this.block(p[2], depth, this.toPython ? `while ${this.expression(p[1], false)}` : `while (${this.expression(p[1], false)})`);
        return;
      case "ForStatement":
        return this.forStatement(node, depth);
      case "ReturnStatement":
        this.write(depth, `return${p[1] ? ` ${this.expression(p[1])}` : ""}${this.toPython ? "" : ";"}`);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        this.write(depth, `${node.name === "BreakStatement" ? "break" : "continue"}${this.toPython ? "" : ";"}`);
        return;
      case "PassStatement":
      case "EmptyStatement":
        this.write(depth, this.toPython ? "pass" : ";");
        return;
      default:
        this.fail(node);
    }
  }

  forStatement(node, depth) {
    const p = parts(node);
    if (!this.toPython) {
      if (p.length !== 5 || p[1].name !== "VariableName") this.fail(node, "Only simple for loops are supported");
      const name = this.identifier(p[1]);
      const iterable = p[3];
      if (iterable.name === "CallExpression" && this.text(iterable.firstChild) === "range") {
        const args = parts(iterable.getChild("ArgList"));
        if (args.length < 1 || args.length > 3) this.fail(iterable, "range requires one to three arguments");
        const start = args.length === 1 ? "0" : this.expression(args[0]);
        const end = this.expression(args[args.length === 1 ? 0 : 1]);
        const step = args.length === 3 ? this.numericStep(args[2]) : 1;
        // Evaluate range endpoints once and keep the Python loop variable's
        // last value (or its previous value when the range is empty).
        const startName = this.temporary("start");
        const endName = this.temporary("stop");
        const counter = this.temporary("index");
        this.write(depth, `const ${startName} = ${start};`);
        this.write(depth, `const ${endName} = ${end};`);
        this.write(depth, `for (let ${counter} = ${startName}; ${counter} ${step > 0 ? "<" : ">"} ${endName}; ${counter} += ${step}) {`);
        this.write(depth + 1, `${name} = ${counter};`);
        this.body(p[4], depth + 1);
        this.write(depth, "}");
      } else this.block(p[4], depth, `for (${name} of ${this.expression(iterable)})`);
      return;
    }
    const spec = p[1];
    const s = parts(spec);
    if (spec.name === "ForOfSpec") {
      const ofIndex = s.findIndex(child => child.name === "of");
      const target = s[ofIndex - 1];
      if (ofIndex < 1 || !["VariableDefinition", "VariableName"].includes(target.name)) this.fail(spec);
      this.block(p[2], depth, `for ${this.identifier(target)} in ${this.expression(s[ofIndex + 1])}`);
      return;
    }
    if (spec.name !== "ForSpec" || s.length !== 3) this.fail(spec, "Only for-of and simple counter loops are supported");
    const init = parts(s[0]);
    if (s[0].name === "VariableDeclaration" && init[0].name === "var") this.fail(spec, "var counter loops require manual conversion");
    if (s[0].name === "VariableDeclaration") init.shift();
    if (init.length !== 3 || !["VariableDefinition", "VariableName"].includes(init[0].name) || !["=", "Equals"].includes(init[1].name) && this.text(init[1]) !== "=") this.fail(spec, "Unsupported loop initializer");
    const name = this.identifier(init[0]);
    const condition = parts(s[1]);
    const comparison = condition[1] && this.text(condition[1]);
    if (s[1].name !== "BinaryExpression" || this.text(condition[0]) !== name || !["<", "<=", ">", ">="].includes(comparison)) this.fail(spec, "Unsupported loop condition");
    const boundNames = new Set();
    const inspectBound = bound => {
      if (bound.name === "CallExpression") this.fail(bound, "Loop bounds with function calls require manual conversion");
      if (bound.name === "VariableName") boundNames.add(this.text(bound));
      children(bound).forEach(inspectBound);
    };
    inspectBound(condition[2]);
    const inspectBody = statement => {
      if (statement.name === "FunctionDeclaration") return;
      if (["AssignmentExpression", "PostfixExpression", "UnaryExpression", "VariableDeclaration"].includes(statement.name)) {
        const write = parts(statement).find(child => ["VariableName", "VariableDefinition", "MemberExpression"].includes(child.name));
        const identifier = write && this.text(write).match(/^[A-Za-z_][A-Za-z_0-9]*/)?.[0];
        const mutates = statement.name !== "UnaryExpression" || /^[+-]{2}/.test(this.text(statement));
        if (mutates && (identifier === name || boundNames.has(identifier))) this.fail(statement, "This loop changes its counter or bounds inside the body");
      }
      if (statement.name === "CallExpression" && statement.firstChild.name === "MemberExpression") {
        const receiver = this.text(statement.firstChild.firstChild);
        if (boundNames.has(receiver)) this.fail(statement, "This loop may change its bounds inside the body");
      }
      children(statement).forEach(inspectBody);
    };
    inspectBody(p[2]);
    const update = parts(s[2]);
    let step;
    if (s[2].name === "PostfixExpression" && this.text(update[0]) === name) step = this.text(update[1]) === "++" ? 1 : -1;
    else if (s[2].name === "AssignmentExpression" && this.text(update[0]) === name && ["+=", "-="].includes(this.text(update[1]))) step = this.numericStep(update[2]) * (this.text(update[1]) === "+=" ? 1 : -1);
    else this.fail(spec, "Unsupported loop update");
    if ((step > 0) !== comparison.startsWith("<")) this.fail(spec, "Loop step does not match its comparison");
    let end = this.expression(condition[2]);
    if (comparison.includes("=")) end = `(${end} ${step > 0 ? "+" : "-"} 1)`;
    this.block(p[2], depth, `for ${name} in range(${this.expression(init[2])}, ${end}, ${step})`);
  }

  numericStep(node) {
    const value = Number(this.text(node).replace(/\s/g, ""));
    if (!Number.isSafeInteger(value) || value === 0) this.fail(node, "Loop steps must be nonzero integer literals");
    return value;
  }

  identifier(node) {
    const value = this.text(node);
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value)) this.fail(node, "This identifier is not supported in both languages");
    if ((this.toPython ? pythonKeywords : javaScriptKeywords).has(value)) this.fail(node, `${value} is a keyword in the target language`);
    return value;
  }

  operator(node) {
    const value = this.text(node);
    const operators = this.toPython
      ? {"===":"==", "!==":"!=", "&&":"and", "||":"or", "!":"not"}
      : {"==":"===", "!=":"!==", "and":"&&", "or":"||", "not":"!"};
    if (operators[value]) return operators[value];
    if (["+", "-", "*", "/", "%", "**", "<", "<=", ">", ">=", "=", "+=", "-=", "*=", "/=", "%="].includes(value)) return value;
    this.fail(node, `Unsupported operator ${value}`);
  }

  expression(node, grouped = true) {
    const p = parts(node);
    switch (node.name) {
      case "VariableName":
      case "VariableDefinition":
      case "PropertyName":
        return this.identifier(node);
      case "Number":
        if (!/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(this.text(node))) this.fail(node, "Unsupported number literal");
        return this.text(node);
      case "BooleanLiteral":
      case "Boolean":
        return this.toPython ? (this.text(node) === "true" ? "True" : "False") : (this.text(node) === "True" ? "true" : "false");
      case "null":
      case "Null":
      case "None":
        return this.toPython ? "None" : "null";
      case "String":
        return JSON.stringify(this.stringValue(node));
      case "TemplateString":
      case "FormatString":
        return this.interpolatedString(node);
      case "ParenthesizedExpression":
        // Binary/unary emitters already preserve grouping. Recopying source
        // parentheses would add another layer on every round trip.
        return this.expression(p[0], grouped);
      case "BinaryExpression": {
        if (p.length !== 3) this.fail(node, "Chained comparisons require manual conversion");
        const value = `${this.expression(p[0])} ${this.operator(p[1])} ${this.expression(p[2])}`;
        return grouped ? `(${value})` : value;
      }
      case "UnaryExpression": {
        const value = `${this.operator(p[0])} ${this.expression(p[1])}`;
        return grouped ? `(${value})` : value;
      }
      case "ArrayExpression":
        return `[${p.map(item => this.expression(item)).join(", ")}]`;
      case "MemberExpression": {
        const target = this.expression(p[0]);
        if (children(node).some(child => child.name === "[")) return `${target}[${this.expression(p[1])}]`;
        const property = this.identifier(p[2]);
        if (this.toPython && property === "length") return `len(${target})`;
        return `${target}.${property}`;
      }
      case "CallExpression": {
        const callee = p[0];
        const args = parts(node.getChild("ArgList")).map(arg => this.expression(arg));
        const name = this.text(callee);
        if (this.toPython && ["console.log", "console.warn", "console.error", "print"].includes(name)) return `print(${args.join(", ")})`;
        if (!this.toPython && name === "print") return `console.log(${args.join(", ")})`;
        if (!this.toPython && name === "len" && args.length === 1) return `(${args[0]}).length`;
        if (callee.name === "MemberExpression") {
          const member = parts(callee);
          const method = this.text(member.at(-1));
          if ((this.toPython && method === "push") || (!this.toPython && method === "append")) {
            if (args.length !== 1) this.fail(node, "List append requires one argument");
            return `${this.expression(member[0])}.${this.toPython ? "append" : "push"}(${args[0]})`;
          }
          this.fail(node, `Unsupported method ${method}`);
        }
        return `${this.expression(callee)}(${args.join(", ")})`;
      }
      default:
        this.fail(node);
    }
  }

  stringValue(node) {
    const raw = this.text(node);
    const match = raw.match(/^([rRuUbB]*)("""|'''|"|'|`)([\s\S]*)\2$/);
    if (!match || /[bBuU]/.test(match[1])) this.fail(node, "Unsupported string literal");
    if (/r/i.test(match[1])) return match[3];
    return this.decode(match[3], node);
  }

  decode(text, node) {
    return text.replace(/\\(?:\r?\n|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, escape => {
      const value = escape.slice(1);
      if (["\n", "\r\n"].includes(value)) return "";
      if (/^[ux]/.test(value) && value.length > 1) return String.fromCharCode(parseInt(value.slice(1), 16));
      const escapes = {n:"\n",r:"\r",t:"\t",b:"\b",f:"\f",v:"\v", "\\":"\\", "'":"'", '"':'"', "`":"`", "$":"$"};
      if (Object.hasOwn(escapes, value)) return escapes[value];
      if (/^[0-9uUN]$/.test(value)) this.fail(node, "Unsupported string escape");
      return this.toPython ? value : escape;
    });
  }

  interpolatedString(node) {
    const raw = this.text(node);
    const prefix = this.toPython ? "`" : raw.match(/^[fF]("""|'''|"|')/)?.[0];
    if (!prefix) this.fail(node, "Unsupported interpolated string");
    const quoteLength = this.toPython ? 1 : prefix.length - 1;
    let position = node.from + prefix.length;
    let result = "";
    const literal = text => {
      let value = this.decode(text, node);
      if (!this.toPython) value = value.replace(/\{\{/g, "{").replace(/\}\}/g, "}");
      return this.toPython
        ? JSON.stringify(value).slice(1, -1).replace(/\{/g, "{{").replace(/\}/g, "}}")
        : JSON.stringify(value).slice(1, -1).replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    };
    for (const replacement of children(node)) {
      if (!["Interpolation", "FormatReplacement"].includes(replacement.name)) this.fail(replacement);
      result += literal(this.source.slice(position, replacement.from));
      const expressions = children(replacement).filter(child => !["{", "}", "InterpolationStart", "InterpolationEnd"].includes(child.name));
      if (expressions.length !== 1) this.fail(replacement, "Format specifiers and conversions require manual conversion");
      result += `${this.toPython ? "{" : "${"}${this.expression(expressions[0])}}`;
      position = replacement.to;
    }
    result += literal(this.source.slice(position, node.to - quoteLength));
    return this.toPython ? `f"${result}"` : `\`${result}\``;
  }
}

export function convertCode(source, from, to) {
  if (from === to) return source;
  if (!["python", "javascript"].includes(from) || !["python", "javascript"].includes(to)) throw new ConversionError("Unknown language.");
  return new Converter(source, from).convert();
}
