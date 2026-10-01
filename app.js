import {EditorState, Compartment} from "@codemirror/state";
import {EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab, indentSelection} from "@codemirror/commands";
import {python} from "@codemirror/lang-python";
import {javascript, javascriptLanguage, scopeCompletionSource} from "@codemirror/lang-javascript";
import {autocompletion, completionKeymap, startCompletion, acceptCompletion} from "@codemirror/autocomplete";
import {syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, indentUnit} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {convertCode} from "./converter.js";

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
  ".cm-selectionBackground":{backgroundColor:"#63317d!important"},
  "&.cm-hasSelection .cm-activeLine":{backgroundColor:"transparent"},
  ".cm-tooltip":{backgroundColor:"#25212c",border:"1px solid #4a4254"},
  ".cm-tooltip-autocomplete ul li[aria-selected]":{backgroundColor:"#6a2c91",color:"white"}
},{dark:true});
const lightEditorTheme = EditorView.theme({
  "&":{backgroundColor:"#fff",color:"#211a25",fontSize:"14px"},
  ".cm-content":{fontFamily:"ui-monospace, SFMono-Regular, Consolas, monospace",caretColor:"#6f9300",padding:"12px 0"},
  ".cm-gutters":{backgroundColor:"#f4f0f6",color:"#746a79",border:"none"},
  ".cm-activeLine,.cm-activeLineGutter":{backgroundColor:"#eee8f2"},
  ".cm-selectionBackground":{backgroundColor:"#d8b9e9!important"},
  "&.cm-hasSelection .cm-activeLine":{backgroundColor:"transparent"},
  ".cm-tooltip":{backgroundColor:"#fff",border:"1px solid #c9bdcf"},
  ".cm-tooltip-autocomplete ul li[aria-selected]":{backgroundColor:"#763b9b",color:"white"}
},{dark:false});

const javaScriptGlobals = javascriptLanguage.data.of({autocomplete:scopeCompletionSource({console})});
function languageExtension(){return language === "python" ? [python(),indentUnit.of("    ")] : [javascript(),indentUnit.of("  "),javaScriptGlobals];}
function completionExtension(){return completionMode === "OFF" ? [] : autocompletion({activateOnTyping:completionMode === "AUTO"});}
function appearanceExtensions(){return colorTheme === "dark" ? [darkEditorTheme,syntaxHighlighting(darkHighlight)] : [lightEditorTheme,syntaxHighlighting(lightHighlight)];}

const view = new EditorView({
  parent:document.querySelector("#editor"),
  state:EditorState.create({doc:documents.python,extensions:[lineNumbers(),highlightActiveLine(),drawSelection(),EditorView.editorAttributes.of(v=>({class:v.state.selection.ranges.some(range=>!range.empty)?"cm-hasSelection":""})),history(),bracketMatching(),indentOnInput(),appearanceCompartment.of(appearanceExtensions()),languageCompartment.of(languageExtension()),completionCompartment.of(completionExtension()),keymap.of([{key:"Ctrl-Enter",run:()=>{runCode();return true}},{key:"Mod-Enter",run:()=>{runCode();return true}},{key:"Ctrl-Space",run:v=>completionMode !== "OFF" && startCompletion(v)},{key:"Alt-Shift-f",run:indentSelection},{key:"Tab",run:v=>completionMode !== "OFF" && acceptCompletion(v)},...completionKeymap,indentWithTab,...defaultKeymap,...historyKeymap]),EditorView.updateListener.of(u=>{if(u.docChanged)documents[language]=u.state.doc.toString()})]})
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
  // In a browser, an unqualified print() opens the system print dialog.
  // Give playground code a local print alias that writes to the output panel.
  try{const result=await new Function("print",`return (async()=>{${code}\n})()`)(console.log);if(result!==undefined)append(formatValue(result))}finally{console.log=oldLog;console.warn=oldWarn;console.error=oldError}
}
function formatValue(v){if(typeof v==="string")return v;try{return JSON.stringify(v)}catch{return String(v)}}
async function runCode(){
  output.textContent="";setStatus("Running …");document.querySelector("#runButton").disabled=true;
  try{language === "python" ? await runPython(view.state.doc.toString()) : await runJavaScript(view.state.doc.toString());setStatus("Done")}catch(e){append(e?.message||e,true);setStatus("Error")}finally{document.querySelector("#runButton").disabled=false}
}

function switchLanguage(next,shouldConvert=convertOnSwitch){
  if(next===language)return;
  const previous=language;
  const source=view.state.doc.toString();
  documents[previous]=source;
  if(shouldConvert){
    try{documents[next]=convertCode(source,previous,next)}
    catch(error){setStatus("Conversion stopped");append(`Conversion stopped: ${error.message}`,true);view.focus();return;}
  }
  language=next;
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:documents[language]},effects:languageCompartment.reconfigure(languageExtension())});
  document.querySelectorAll(".lang").forEach(b=>b.classList.toggle("active",b.dataset.language===language));document.querySelector("#fileName").textContent=filenames[language];setStatus(shouldConvert?"Converted":"Ready");view.focus();
}
document.querySelectorAll(".lang").forEach(b=>b.addEventListener("click",()=>switchLanguage(b.dataset.language)));
document.querySelector("#runButton").addEventListener("click",runCode);
document.querySelector("#clearButton").addEventListener("click",()=>{output.textContent=""});
document.querySelector("#themeButton").addEventListener("click",()=>{colorTheme=colorTheme === "dark" ? "light" : "dark";document.body.dataset.theme=colorTheme;const button=document.querySelector("#themeButton");button.textContent=colorTheme === "dark" ? "☀ Light Theme" : "☾ Dark Theme";button.setAttribute("aria-pressed",String(colorTheme === "light"));view.dispatch({effects:appearanceCompartment.reconfigure(appearanceExtensions())});view.focus()});
document.querySelector("#completionButton").addEventListener("click",()=>{completionMode={AUTO:"MANUAL",MANUAL:"OFF",OFF:"AUTO"}[completionMode];document.querySelector("#completionButton").textContent=`Completion: ${completionMode}`;view.dispatch({effects:completionCompartment.reconfigure(completionExtension())});view.focus()});
document.querySelector("#convertButton").addEventListener("click",()=>{convertOnSwitch=!convertOnSwitch;const button=document.querySelector("#convertButton");button.textContent=`Convert on switch: ${convertOnSwitch?"ON":"OFF"}`;button.setAttribute("aria-pressed",String(convertOnSwitch));view.focus()});
document.querySelector("#openButton").addEventListener("click",()=>document.querySelector("#fileInput").click());
document.querySelector("#fileInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;const ext=file.name.split(".").pop().toLowerCase();if(ext==="py")switchLanguage("python",false);else if(["js","mjs"].includes(ext))switchLanguage("javascript",false);const text=await file.text();view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});filenames[language]=file.name;document.querySelector("#fileName").textContent=file.name;e.target.value=""});
document.querySelector("#saveButton").addEventListener("click",()=>{const blob=new Blob([view.state.doc.toString()],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filenames[language];a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
