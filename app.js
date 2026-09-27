import {EditorState, Compartment} from "@codemirror/state";
import {EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {python} from "@codemirror/lang-python";
import {javascript} from "@codemirror/lang-javascript";
import {autocompletion, completionKeymap, startCompletion} from "@codemirror/autocomplete";
import {syntaxHighlighting, HighlightStyle, bracketMatching} from "@codemirror/language";
import {tags} from "@lezer/highlight";

const config = window.FADI_CONFIG || {productName: "FADI"};
document.querySelector("#productName").textContent = config.productName;
document.title = `${config.productName} Code Lab`;

const starter = {
  python: `# ${config.productName} Python\nname = "Welt"\nprint(f"Hallo, {name}!")\n`,
  javascript: `// ${config.productName} JavaScript\nconst name = "Welt";\nconsole.log(\`Hallo, \${name}!\`);\n`
};
const documents = {...starter};
const filenames = {python:"main.py", javascript:"main.js"};
let language = "python";
let completionMode = "AUTO";
let pyodideInstance = null;

const languageCompartment = new Compartment();
const completionCompartment = new Compartment();
const output = document.querySelector("#output");
const status = document.querySelector("#status");

const highlight = HighlightStyle.define([
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
const theme = EditorView.theme({
  "&":{backgroundColor:"#18161d",color:"#f4f1f6",fontSize:"14px"},
  ".cm-content":{fontFamily:"ui-monospace, SFMono-Regular, Consolas, monospace",caretColor:"#ffdc48",padding:"12px 0"},
  ".cm-gutters":{backgroundColor:"#131117",color:"#706a78",border:"none"},
  ".cm-activeLine,.cm-activeLineGutter":{backgroundColor:"#25212c"},
  ".cm-selectionBackground,.cm-content ::selection":{backgroundColor:"#63317d!important"},
  ".cm-tooltip":{backgroundColor:"#25212c",border:"1px solid #4a4254"},
  ".cm-tooltip-autocomplete ul li[aria-selected]":{backgroundColor:"#6a2c91",color:"white"}
},{dark:true});

function languageExtension(){return language === "python" ? python() : javascript();}
function completionExtension(){return completionMode === "AUS" ? [] : autocompletion({activateOnTyping:completionMode === "AUTO"});}

const view = new EditorView({
  parent:document.querySelector("#editor"),
  state:EditorState.create({doc:documents.python,extensions:[lineNumbers(),highlightActiveLine(),drawSelection(),history(),bracketMatching(),theme,syntaxHighlighting(highlight),languageCompartment.of(languageExtension()),completionCompartment.of(completionExtension()),keymap.of([{key:"Ctrl-Enter",run:()=>{runCode();return true}},{key:"Mod-Enter",run:()=>{runCode();return true}},{key:"Ctrl-Space",run:v=>completionMode !== "AUS" && startCompletion(v)},indentWithTab,...defaultKeymap,...historyKeymap,...completionKeymap]),EditorView.updateListener.of(u=>{if(u.docChanged)documents[language]=u.state.doc.toString()})]})
});

function setStatus(text){status.textContent=text}
function append(text,isError=false){if(output.textContent==="Bereit.")output.textContent="";const span=document.createElement("span");span.textContent=String(text)+"\n";if(isError)span.className="error";output.append(span);output.scrollTop=output.scrollHeight}

async function runPython(code){
  if(!pyodideInstance){setStatus("Lade Python …");append("Python wird beim ersten Start geladen …");pyodideInstance=await loadPyodide()}
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
  output.textContent="";setStatus("Wird ausgeführt …");document.querySelector("#runButton").disabled=true;
  try{language === "python" ? await runPython(view.state.doc.toString()) : await runJavaScript(view.state.doc.toString());setStatus("Fertig")}catch(e){append(e?.message||e,true);setStatus("Fehler")}finally{document.querySelector("#runButton").disabled=false}
}

function switchLanguage(next){
  if(next===language)return;documents[language]=view.state.doc.toString();language=next;
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:documents[language]},effects:languageCompartment.reconfigure(languageExtension())});
  document.querySelectorAll(".lang").forEach(b=>b.classList.toggle("active",b.dataset.language===language));document.querySelector("#fileName").textContent=filenames[language];setStatus("Bereit");view.focus();
}
document.querySelectorAll(".lang").forEach(b=>b.addEventListener("click",()=>switchLanguage(b.dataset.language)));
document.querySelector("#runButton").addEventListener("click",runCode);
document.querySelector("#clearButton").addEventListener("click",()=>{output.textContent=""});
document.querySelector("#completionButton").addEventListener("click",()=>{completionMode={AUTO:"MANUELL",MANUELL:"AUS",AUS:"AUTO"}[completionMode];document.querySelector("#completionButton").textContent=`Completion: ${completionMode}`;view.dispatch({effects:completionCompartment.reconfigure(completionExtension())});view.focus()});
document.querySelector("#openButton").addEventListener("click",()=>document.querySelector("#fileInput").click());
document.querySelector("#fileInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;const ext=file.name.split(".").pop().toLowerCase();if(ext==="py")switchLanguage("python");else if(["js","mjs"].includes(ext))switchLanguage("javascript");const text=await file.text();view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});filenames[language]=file.name;document.querySelector("#fileName").textContent=file.name;e.target.value=""});
document.querySelector("#saveButton").addEventListener("click",()=>{const blob=new Blob([view.state.doc.toString()],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filenames[language];a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
