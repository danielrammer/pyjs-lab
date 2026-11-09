import {EditorState, Compartment} from "@codemirror/state";
import {EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab, indentSelection, toggleComment} from "@codemirror/commands";
import {python, pythonLanguage} from "@codemirror/lang-python";
import {javascript, javascriptLanguage, scopeCompletionSource} from "@codemirror/lang-javascript";
import {autocompletion, completionKeymap, startCompletion, acceptCompletion} from "@codemirror/autocomplete";
import {syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, indentUnit} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {convertCode} from "./converter.js";
import {pythonMemberCompletion,pythonCanvasCompletion} from "./python-completion.js";
import {declarationNavigation} from "./declaration-navigation.js";
import {initializeGraphics} from "./graphics.js";
import {createPythonInput} from "./python-input.js";
import {createPythonWorker} from "./python-worker-client.js";
import {initializePaneResize} from "./pane-resize.js";
import {createJavaScriptGraphics} from "./javascript-graphics.js";
import {initializeFileActions} from "./file-actions.js";
import {initializeLocale,t,onLocaleChange} from "./i18n.js";
import {initializeAccounts} from "./accounts.js";

const config = window.TITLE_CONFIG || {productName: "PYJS"};
document.querySelector("#productName").textContent = config.productName;
document.title = `${config.productName} Code Lab`;

const starter = {
  python: `# ${config.productName} Python\n# ${t("Write your code here, or open Learn for a challenge.")}\n`,
  javascript: `// ${config.productName} JavaScript\n// ${t("Write your code here, or open Learn for a challenge.")}\n`
};
const documents = {...starter};
const filenames = {python:"main.py", javascript:"main.js"};
let language = "python";
let completionMode = "AUTO";
let colorTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
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

const javaScriptGlobals = javascriptLanguage.data.of({autocomplete:scopeCompletionSource({console,graphics:{plot(){},canvas(){}}})});
const pythonMembers = [pythonLanguage.data.of({autocomplete:pythonMemberCompletion}),pythonLanguage.data.of({autocomplete:pythonCanvasCompletion})];
function languageExtension(){return language === "python" ? [python(),indentUnit.of("    "),pythonMembers] : [javascript(),indentUnit.of("  "),javaScriptGlobals];}
function completionExtension(){return completionMode === "OFF" ? [] : autocompletion({activateOnTyping:completionMode === "AUTO"});}
function appearanceExtensions(){return colorTheme === "dark" ? [darkEditorTheme,syntaxHighlighting(darkHighlight)] : [lightEditorTheme,syntaxHighlighting(lightHighlight)];}

const view = new EditorView({
  parent:document.querySelector("#editor"),
  state:EditorState.create({doc:documents.python,extensions:[declarationNavigation(()=>language),lineNumbers(),highlightActiveLine(),drawSelection(),EditorView.editorAttributes.of(v=>({class:v.state.selection.ranges.some(range=>!range.empty)?"cm-hasSelection":""})),history(),bracketMatching(),indentOnInput(),appearanceCompartment.of(appearanceExtensions()),languageCompartment.of(languageExtension()),completionCompartment.of(completionExtension()),keymap.of([{key:"Ctrl-Enter",run:()=>{runCode();return true}},{key:"Mod-Enter",run:()=>{runCode();return true}},{key:"Ctrl-Space",run:v=>completionMode !== "OFF" && startCompletion(v)},{key:"Alt-Shift-f",run:indentSelection},{key:"Ctrl-#",run:toggleComment},{key:"Tab",run:v=>completionMode !== "OFF" && acceptCompletion(v)},...completionKeymap,indentWithTab,...defaultKeymap,...historyKeymap]),EditorView.updateListener.of(u=>{if(u.docChanged)documents[language]=u.state.doc.toString()})]})
});

function setStatus(text){status.dataset.state=text;status.textContent=t(text)}
function append(text,isError=false){if(output.textContent==="Ready.")output.textContent="";const span=document.createElement("span");span.textContent=String(text)+"\n";if(isError)span.className="error";output.append(span);output.scrollTop=output.scrollHeight}
const pythonInput = createPythonInput({append,setStatus});
const graphics = initializeGraphics({
  getLanguage:()=>language,
  loadExample(code){view.dispatch({changes:{from:0,to:view.state.doc.length,insert:code}});filenames[language]=language==="python"?"graphics.py":"graphics.js";document.querySelector("#fileName").textContent=filenames[language];setStatus("Example loaded — press Run");view.focus();},
  onError(error){append(error?.message || error,true);setStatus("Error");}
});
const javascriptGraphics=createJavaScriptGraphics(graphics,error=>{append(error.message,true);setStatus("Error")});
const pythonWorker=window.crossOriginIsolated && typeof SharedArrayBuffer!=="undefined" ? createPythonWorker({append,setStatus,graphics,onError(error){append(error.message,true);setStatus("Error")}}) : null;

async function runPython(code){
  if(pythonWorker)return pythonWorker.run(code);
  if(!pyodideInstance){setStatus("Loading Python …");pyodideInstance=await loadPyodide();graphics.install(pyodideInstance);pythonInput.install(pyodideInstance)}
  pythonInput.prepareRun();
  pyodideInstance.setStdout({batched:s=>append(s)});pyodideInstance.setStderr({batched:s=>append(s,true)});
  await pyodideInstance.loadPackagesFromImports(code,{messageCallback:()=>setStatus("Loading Python packages …"),errorCallback:s=>append(s,true)});
  graphics.configure(pyodideInstance);
  setStatus("Running …");
  try{await pyodideInstance.runPythonAsync(code)}finally{graphics.finish()}
}
async function runJavaScript(code){
  const programConsole=Object.assign(Object.create(console),{
    log:(...a)=>append(a.map(formatValue).join(" ")),
    warn:(...a)=>append(a.map(formatValue).join(" ")),
    error:(...a)=>append(a.map(formatValue).join(" "),true),
  });
  // In a browser, an unqualified print() opens the system print dialog.
  // Give playground code a local print alias that writes to the output panel.
  const result=await new Function("print","graphics","console",`return (async()=>{${code}\n})()`)(programConsole.log,javascriptGraphics.api,programConsole);
  if(result!==undefined)append(formatValue(result));
}
function formatValue(v){if(typeof v==="string")return v;try{return JSON.stringify(v)}catch{return String(v)}}
let lastRun=null;
async function runCode(){
  if(document.querySelector("#runButton").disabled)return;
  const runSource=view.state.doc.toString(),runLanguage=language;
  output.textContent="";setStatus("Running …");document.querySelector("#runButton").disabled=true;
  try{javascriptGraphics.clear();graphics.clear();pythonWorker?.clear();graphics.showOutput();language === "python" ? await runPython(runSource) : await runJavaScript(runSource);setStatus("Done")}catch(e){if(e?.cancelled || pythonInput.isCancelled(e)){append(t("Input cancelled."));setStatus("Cancelled")}else{append(e?.message||e,true);setStatus("Error")}}finally{lastRun={code:runSource,language:runLanguage,status:status.dataset.state};document.querySelector("#runButton").disabled=false}
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
  language=next;graphics.updateLanguage();
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:documents[language]},effects:languageCompartment.reconfigure(languageExtension())});
  document.querySelectorAll(".lang").forEach(b=>b.classList.toggle("active",b.dataset.language===language));document.querySelector("#fileName").textContent=filenames[language];setStatus(shouldConvert?"Converted":"Ready");view.focus();
}
document.querySelectorAll(".lang").forEach(b=>b.addEventListener("click",()=>switchLanguage(b.dataset.language)));
document.querySelector("#runButton").addEventListener("click",runCode);
document.querySelector("#clearButton").addEventListener("click",()=>{if(document.querySelector("#runButton").disabled)return;output.textContent="";javascriptGraphics.clear();graphics.clear();pythonWorker?.clear()});
function updateThemeButton(){document.documentElement.dataset.theme=colorTheme;document.body.dataset.theme=colorTheme;const button=document.querySelector("#themeButton");const label=t(colorTheme === "dark" ? "☀ Light Theme" : "☾ Dark Theme");button.title=label;button.setAttribute("aria-label",label);button.setAttribute("aria-pressed",String(colorTheme === "light"));}
updateThemeButton();
document.querySelector("#themeButton").addEventListener("click",()=>{colorTheme=colorTheme === "dark" ? "light" : "dark";updateThemeButton();try{localStorage.setItem("pyjs.theme",colorTheme);}catch{}view.dispatch({effects:appearanceCompartment.reconfigure(appearanceExtensions())});});
document.querySelector("#completionButton").addEventListener("click",()=>{completionMode={AUTO:"MANUAL",MANUAL:"OFF",OFF:"AUTO"}[completionMode];document.querySelector("#completionButton").textContent=`Completion: ${completionMode}`;view.dispatch({effects:completionCompartment.reconfigure(completionExtension())});});
document.querySelector("#convertButton").addEventListener("click",()=>{convertOnSwitch=!convertOnSwitch;const button=document.querySelector("#convertButton");button.textContent=`Convert Py ↔ JS: ${convertOnSwitch?"ON":"OFF"}`;button.setAttribute("aria-pressed",String(convertOnSwitch));document.querySelector("#conversionIndicator").hidden=!convertOnSwitch;});
document.querySelector("#editorSettings").addEventListener("toggle",event=>document.querySelector("#settingsButton").setAttribute("aria-expanded",String(event.newState==="open")));
document.querySelector("#fileInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{if(document.querySelector("#runButton").disabled)throw new Error("Bitte zuerst die laufende Ausführung beenden.");const text=await file.text();if(document.querySelector("#runButton").disabled)throw new Error("Bitte zuerst die laufende Ausführung beenden.");const ext=file.name.split(".").pop().toLowerCase();if(ext==="py")switchLanguage("python",false);else if(["js","mjs"].includes(ext))switchLanguage("javascript",false);view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});lastRun=null;filenames[language]=file.name;document.querySelector("#fileName").textContent=file.name;setStatus("Datei geladen");}catch(error){setStatus(error.message);}finally{e.target.value="";}});
initializeFileActions({setStatus,loadCurrent:()=>document.querySelector("#fileInput").click(),saveCurrent(){const blob=new Blob([view.state.doc.toString()],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filenames[language];a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}});
import {initializeLearn} from "./learn.js";
initializeLearn({
  getLanguage:()=>language,
  getWork(){
    const code=view.state.doc.toString(),matches=lastRun?.code===code && lastRun.language===language;
    return {language,code,filename:filenames[language],output:matches?output.textContent:"",runStatus:matches?lastRun.status:"Not run",running:document.querySelector("#runButton").disabled};
  },
  openWork(work){
    if(document.querySelector("#runButton").disabled)throw new Error("Bitte zuerst die laufende Ausführung beenden.");
    switchLanguage(work.language,false);
    view.dispatch({changes:{from:0,to:view.state.doc.length,insert:work.code}});
    filenames[language]=work.filename || `challenge.${language==="python"?"py":"js"}`;
    document.querySelector("#fileName").textContent=filenames[language];
    javascriptGraphics.clear();graphics.clear();pythonWorker?.clear();graphics.showOutput();output.textContent=work.output || "";
    lastRun=work.runStatus && work.runStatus!=="Not run"?{code:work.code,language,status:work.runStatus}:null;
    setStatus(work.runStatus && work.runStatus!=="Not run"?"Ergebnis geladen":"Challenge gestartet");view.focus();
  },
});
initializePaneResize();
initializeLocale();setStatus("Ready");output.textContent=t("Ready.");
initializeAccounts();
graphics.updateLanguage();
onLocaleChange(()=>{setStatus(status.dataset.state || "Ready");graphics.updateLanguage();updateThemeButton();});
