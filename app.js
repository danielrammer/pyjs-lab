import {EditorState, Compartment} from "@codemirror/state";
import {EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab, indentSelection} from "@codemirror/commands";
import {python} from "@codemirror/lang-python";
import {javascript, javascriptLanguage, scopeCompletionSource} from "@codemirror/lang-javascript";
import {autocompletion, completionKeymap, startCompletion, acceptCompletion} from "@codemirror/autocomplete";
import {syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, indentUnit} from "@codemirror/language";
import {tags} from "@lezer/highlight";

const config = window.TITLE_CONFIG || {productName: "PYJS"};
document.querySelector("#productName").textContent = config.productName;
document.title = `${config.productName} Code Lab`;

const starter = {
  python: `# ${config.productName} Python\nname = "World"\nprint(f"Hello, {name}!")\n`,
  javascript: `// ${config.productName} JavaScript\nconst name = "World";\nconsole.log(\`Hello, \${name}!\`);\n`
};
const documents = {...starter};
const filenames = {python:"main.py", javascript:"main.js"};
let language = "python";
let completionMode = "AUTO";
let colorTheme = "dark";
let convertOnSwitch = false;
let pyodideInstance = null;

const languageCompartment = new Compartment();
const completionCompartment = new Compartment();
const appearanceCompartment = new Compartment();
const output = document.querySelector("#output");
const status = document.querySelector("#status");

const darkHighlight = HighlightStyle.define([
  {tag:tags.keyword,color:"#e7a3ff",fontWeight:"700"},
  {tag:[tags.name,tags.variableName],color:"#f4f1f6"},
  {tag:tags.function(tags.variableName),color:"#bde85b"},
  {tag:[tags.string,tags.special(tags.string)],color:"#f8bd76"},
  {tag:[tags.number,tags.bool,tags.null],color:"#ffe26b"},
  {tag:tags.comment,color:"#aaa3b1",fontStyle:"italic"},
  {tag:[tags.operator,tags.definitionOperator],color:"#7ed8ff"},
  {tag:[tags.className,tags.typeName],color:"#ffd98a"},
  {tag:tags.propertyName,color:"#91d3ff"},
  {tag:tags.punctuation,color:"#dfdbe3"}
]);
const lightHighlight = HighlightStyle.define([
  {tag:tags.keyword,color:"#7b168e",fontWeight:"700"},
  {tag:[tags.name,tags.variableName],color:"#211a25"},
  {tag:tags.function(tags.variableName),color:"#476b00"},
  {tag:[tags.string,tags.special(tags.string)],color:"#9a4d00"},
  {tag:[tags.number,tags.bool,tags.null],color:"#875f00"},
  {tag:tags.comment,color:"#6f6574",fontStyle:"italic"},
  {tag:[tags.operator,tags.definitionOperator],color:"#006b8f"},
  {tag:[tags.className,tags.typeName],color:"#814900"},
  {tag:tags.propertyName,color:"#075c9b"},
  {tag:tags.punctuation,color:"#4d4651"}
]);
const darkEditorTheme = EditorView.theme({
  "&":{backgroundColor:"#18161d",color:"#f4f1f6",fontSize:"14px"},
  ".cm-content":{fontFamily:"ui-monospace, SFMono-Regular, Consolas, monospace",caretColor:"#ffdc48",padding:"12px 0"},
  ".cm-gutters":{backgroundColor:"#131117",color:"#706a78",border:"none"},
  ".cm-activeLine,.cm-activeLineGutter":{backgroundColor:"#25212c"},
  ".cm-selectionBackground,.cm-content ::selection":{backgroundColor:"#63317d!important"},
  ".cm-tooltip":{backgroundColor:"#25212c",border:"1px solid #4a4254"},
  ".cm-tooltip-autocomplete ul li[aria-selected]":{backgroundColor:"#6a2c91",color:"white"}
},{dark:true});
const lightEditorTheme = EditorView.theme({
  "&":{backgroundColor:"#fff",color:"#211a25",fontSize:"14px"},
  ".cm-content":{fontFamily:"ui-monospace, SFMono-Regular, Consolas, monospace",caretColor:"#6f9300",padding:"12px 0"},
  ".cm-gutters":{backgroundColor:"#f4f0f6",color:"#746a79",border:"none"},
  ".cm-activeLine,.cm-activeLineGutter":{backgroundColor:"#eee8f2"},
  ".cm-selectionBackground,.cm-content ::selection":{backgroundColor:"#d8b9e9!important"},
  ".cm-tooltip":{backgroundColor:"#fff",border:"1px solid #c9bdcf"},
  ".cm-tooltip-autocomplete ul li[aria-selected]":{backgroundColor:"#763b9b",color:"white"}
},{dark:false});

const javaScriptGlobals = javascriptLanguage.data.of({autocomplete:scopeCompletionSource({console})});
function languageExtension(){return language === "python" ? [python(),indentUnit.of("    ")] : [javascript(),indentUnit.of("  "),javaScriptGlobals];}
function completionExtension(){return completionMode === "OFF" ? [] : autocompletion({activateOnTyping:completionMode === "AUTO"});}
function appearanceExtensions(){return colorTheme === "dark" ? [darkEditorTheme,syntaxHighlighting(darkHighlight)] : [lightEditorTheme,syntaxHighlighting(lightHighlight)];}

const view = new EditorView({
  parent:document.querySelector("#editor"),
  state:EditorState.create({doc:documents.python,extensions:[lineNumbers(),highlightActiveLine(),drawSelection(),history(),bracketMatching(),indentOnInput(),appearanceCompartment.of(appearanceExtensions()),languageCompartment.of(languageExtension()),completionCompartment.of(completionExtension()),keymap.of([{key:"Ctrl-Enter",run:()=>{runCode();return true}},{key:"Mod-Enter",run:()=>{runCode();return true}},{key:"Ctrl-Space",run:v=>completionMode !== "OFF" && startCompletion(v)},{key:"Alt-Shift-f",run:indentSelection},{key:"Tab",run:v=>completionMode !== "OFF" && acceptCompletion(v)},...completionKeymap,indentWithTab,...defaultKeymap,...historyKeymap]),EditorView.updateListener.of(u=>{if(u.docChanged)documents[language]=u.state.doc.toString()})]})
});

function setStatus(text){status.textContent=text}
function append(text,isError=false){if(output.textContent==="Ready.")output.textContent="";const span=document.createElement("span");span.textContent=String(text)+"\n";if(isError)span.className="error";output.append(span);output.scrollTop=output.scrollHeight}

async function runPython(code){
  if(!pyodideInstance){setStatus("Loading Python …");append("Python is loading for the first run …");pyodideInstance=await loadPyodide()}
  pyodideInstance.setStdout({batched:s=>append(s)});pyodideInstance.setStderr({batched:s=>append(s,true)});
  await pyodideInstance.runPythonAsync(code);
}
async function runJavaScript(code){
  const oldLog=console.log,oldWarn=console.warn,oldError=console.error;
  console.log=(...a)=>append(a.map(formatValue).join(" "));console.warn=(...a)=>append(a.map(formatValue).join(" "));console.error=(...a)=>append(a.map(formatValue).join(" "),true);
  try{const result=await new Function(`return (async()=>{${code}\n})()`)();if(result!==undefined)append(formatValue(result))}finally{console.log=oldLog;console.warn=oldWarn;console.error=oldError}
}
function formatValue(v){if(typeof v==="string")return v;try{return JSON.stringify(v)}catch{return String(v)}}
async function runCode(){
  output.textContent="";setStatus("Running …");document.querySelector("#runButton").disabled=true;
  try{language === "python" ? await runPython(view.state.doc.toString()) : await runJavaScript(view.state.doc.toString());setStatus("Done")}catch(e){append(e?.message||e,true);setStatus("Error")}finally{document.querySelector("#runButton").disabled=false}
}

function convertPythonExpression(expression){
  return expression
    .replace(/\bTrue\b/g,"true").replace(/\bFalse\b/g,"false").replace(/\bNone\b/g,"null")
    .replace(/\band\b/g,"&&").replace(/\bor\b/g,"||").replace(/\bnot\s+/g,"!")
    .replace(/\blen\(([^()]+)\)/g,"$1.length");
}

function convertJavaScriptExpression(expression){
  return expression
    .replace(/!==/g,"!=").replace(/===/g,"==").replace(/&&/g,"and").replace(/\|\|/g,"or")
    .replace(/!\s*(?=[A-Za-z_(])/g,"not ").replace(/\btrue\b/g,"True").replace(/\bfalse\b/g,"False").replace(/\bnull\b/g,"None")
    .replace(/([A-Za-z_$][\w$]*)\.length\b/g,"len($1)");
}

function pythonStringToJavaScript(value){
  const match=value.match(/^f(["'])(.*)\1$/);
  return match ? `\`${match[2].replace(/`/g,"\\`").replace(/\{([^}]+)\}/g,'${$1}')}\`` : value;
}

function javaScriptStringToPython(value){
  const match=value.match(/^`([\s\S]*)`$/);
  return match ? `f"${match[1].replace(/\$\{([^}]+)\}/g,"{$1}").replace(/"/g,'\\"')}"` : value;
}

function pythonToJavaScript(source){
  const output=[];
  const blocks=[];
  const declared=new Set();
  for(const rawLine of source.replace(/\t/g,"    ").split("\n")){
    const indent=(rawLine.match(/^ */)||[""])[0].length;
    let line=rawLine.trim();
    if(!line){output.push("");continue;}
    while(blocks.length && blocks.at(-1)>=indent){output.push(`${"  ".repeat(blocks.length-1)}}`);blocks.pop();}
    const pad="  ".repeat(blocks.length);
    if(line.startsWith("#")){output.push(`${pad}//${line.slice(1)}`);continue;}
    let match;
    let opensBlock=false;
    if((match=line.match(/^def\s+([A-Za-z_]\w*)\s*\((.*)\):$/))){line=`function ${match[1]}(${match[2]})`;opensBlock=true;}
    else if((match=line.match(/^elif\s+(.+):$/))){line=`else if (${convertPythonExpression(match[1])})`;opensBlock=true;}
    else if((match=line.match(/^if\s+(.+):$/))){line=`if (${convertPythonExpression(match[1])})`;opensBlock=true;}
    else if(line==="else:"){line="else";opensBlock=true;}
    else if((match=line.match(/^while\s+(.+):$/))){line=`while (${convertPythonExpression(match[1])})`;opensBlock=true;}
    else if((match=line.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\((.+)\):$/))){
      const parts=match[2].split(",").map(part=>convertPythonExpression(part.trim()));
      const [start,end,step]=parts.length===1?["0",parts[0],"1"]:parts.length===2?[parts[0],parts[1],"1"]:parts;
      line=`for (let ${match[1]} = ${start}; ${match[1]} < ${end}; ${match[1]} += ${step})`;opensBlock=true;declared.add(match[1]);
    }else{
      line=convertPythonExpression(line);
      line=line.replace(/^print\((.*)\)$/,(all,args)=>`console.log(${pythonStringToJavaScript(args)})`);
      line=line.replace(/^(return|throw)\s+(.+)$/,(all,word,value)=>`${word} ${pythonStringToJavaScript(value)}`);
      const assignment=line.match(/^([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
      if(assignment && !declared.has(assignment[1])){declared.add(assignment[1]);line=`let ${assignment[1]} = ${pythonStringToJavaScript(assignment[2])}`;}
      else if(assignment){line=`${assignment[1]} = ${pythonStringToJavaScript(assignment[2])}`;}
    }
    if(opensBlock){output.push(`${pad}${line} {`);blocks.push(indent);}
    else output.push(`${pad}${line}${/[;{}]$/.test(line)?"":";"}`);
  }
  while(blocks.length){output.push(`${"  ".repeat(blocks.length-1)}}`);blocks.pop();}
  return output.join("\n").replace(/\n{3,}/g,"\n\n");
}

function javascriptToPython(source){
  const output=[];
  let indent=0;
  const lines=source.replace(/}\s*else\s+if/g,"}\nelse if").replace(/}\s*else/g,"}\nelse").split("\n");
  for(const rawLine of lines){
    let line=rawLine.trim();
    if(!line){output.push("");continue;}
    while(line.startsWith("}")){indent=Math.max(0,indent-1);line=line.slice(1).trim();}
    if(!line)continue;
    const opensBlock=line.endsWith("{");
    if(opensBlock)line=line.slice(0,-1).trim();
    line=line.replace(/;$/,"");
    if(line.startsWith("//")){output.push(`${"    ".repeat(indent)}#${line.slice(2)}`);continue;}
    let match;
    if((match=line.match(/^function\s+([A-Za-z_$][\w$]*)\s*\((.*)\)$/)))line=`def ${match[1]}(${match[2]}):`;
    else if((match=line.match(/^else\s+if\s*\((.*)\)$/)))line=`elif ${convertJavaScriptExpression(match[1])}:`;
    else if((match=line.match(/^if\s*\((.*)\)$/)))line=`if ${convertJavaScriptExpression(match[1])}:`;
    else if(line==="else")line="else:";
    else if((match=line.match(/^while\s*\((.*)\)$/)))line=`while ${convertJavaScriptExpression(match[1])}:`;
    else if((match=line.match(/^for\s*\(\s*(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;\s*\1\s*<\s*(.+?)\s*;\s*\1\s*\+=\s*(.+?)\s*\)$/)))line=`for ${match[1]} in range(${convertJavaScriptExpression(match[2])}, ${convertJavaScriptExpression(match[3])}, ${convertJavaScriptExpression(match[4])}):`;
    else{
      line=line.replace(/^(?:let|const|var)\s+/,"");
      line=convertJavaScriptExpression(line);
      line=line.replace(/^console\.log\((.*)\)$/,(all,args)=>`print(${javaScriptStringToPython(args)})`);
      line=line.replace(/^(return|raise)\s+(.+)$/,(all,word,value)=>`${word} ${javaScriptStringToPython(value)}`);
      const assignment=line.match(/^([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
      if(assignment)line=`${assignment[1]} = ${javaScriptStringToPython(assignment[2])}`;
    }
    output.push(`${"    ".repeat(indent)}${line}`);
    if(opensBlock)indent++;
  }
  return output.join("\n").replace(/\n{3,}/g,"\n\n");
}

function convertCode(source,from,to){
  if(from===to)return source;
  return from==="python" ? pythonToJavaScript(source) : javascriptToPython(source);
}

function switchLanguage(next){
  if(next===language)return;
  const previous=language;
  const source=view.state.doc.toString();
  documents[previous]=source;
  if(convertOnSwitch)documents[next]=convertCode(source,previous,next);
  language=next;
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:documents[language]},effects:languageCompartment.reconfigure(languageExtension())});
  document.querySelectorAll(".lang").forEach(b=>b.classList.toggle("active",b.dataset.language===language));document.querySelector("#fileName").textContent=filenames[language];setStatus(convertOnSwitch?"Converted":"Ready");view.focus();
}
document.querySelectorAll(".lang").forEach(b=>b.addEventListener("click",()=>switchLanguage(b.dataset.language)));
document.querySelector("#runButton").addEventListener("click",runCode);
document.querySelector("#clearButton").addEventListener("click",()=>{output.textContent=""});
document.querySelector("#themeButton").addEventListener("click",()=>{colorTheme=colorTheme === "dark" ? "light" : "dark";document.body.dataset.theme=colorTheme;const button=document.querySelector("#themeButton");button.textContent=colorTheme === "dark" ? "☀ Light Theme" : "☾ Dark Theme";button.setAttribute("aria-pressed",String(colorTheme === "light"));view.dispatch({effects:appearanceCompartment.reconfigure(appearanceExtensions())});view.focus()});
document.querySelector("#completionButton").addEventListener("click",()=>{completionMode={AUTO:"MANUAL",MANUAL:"OFF",OFF:"AUTO"}[completionMode];document.querySelector("#completionButton").textContent=`Completion: ${completionMode}`;view.dispatch({effects:completionCompartment.reconfigure(completionExtension())});view.focus()});
document.querySelector("#convertButton").addEventListener("click",()=>{convertOnSwitch=!convertOnSwitch;const button=document.querySelector("#convertButton");button.textContent=`Convert on switch: ${convertOnSwitch?"ON":"OFF"}`;button.setAttribute("aria-pressed",String(convertOnSwitch));view.focus()});
document.querySelector("#openButton").addEventListener("click",()=>document.querySelector("#fileInput").click());
document.querySelector("#fileInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;const ext=file.name.split(".").pop().toLowerCase();if(ext==="py")switchLanguage("python");else if(["js","mjs"].includes(ext))switchLanguage("javascript");const text=await file.text();view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});filenames[language]=file.name;document.querySelector("#fileName").textContent=file.name;e.target.value=""});
document.querySelector("#saveButton").addEventListener("click",()=>{const blob=new Blob([view.state.doc.toString()],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filenames[language];a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
