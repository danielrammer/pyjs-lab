import {pythonLanguage} from "@codemirror/lang-python";
import {t,registerTranslations} from "./i18n.js";

registerTranslations([
  ["NiceGUI-Demo laden","Load NiceGUI demo"],
  ["NiceGUI wird geladen …","Loading NiceGUI …"],
  ["Stoppen","Stop"],
  ["NiceGUI 3.18 · Browser-Version · Dokumentation","NiceGUI 3.18 · Browser version · Documentation"],
  ["NiceGUI konnte nicht gestartet werden. Bitte erneut ausführen.","NiceGUI could not start. Please run it again."],
]);

// Use the Python parser so comments and strings containing imports do not select
// the GUI runtime. A fresh iframe owns each run, including its async callbacks.
export function usesNiceGUI(code) {
  let found=false;
  pythonLanguage.parser.parse(code).iterate({enter(node){
    if(node.name!=="ImportStatement")return;
    const statement=code.slice(node.from,node.to);
    if(/^from\s+nicegui(?:_pyodide)?(?:\s|\.)/.test(statement) ||
       /^import\s+/.test(statement) && statement.replace(/^import\s+/,"").split(",").some(part=>/^\s*nicegui(?:_pyodide)?(?:\s|\.|$)/.test(part)))found=true;
  }});
  return found;
}

export function createNiceGUIRunner({graphics,append,setStatus,onError}) {
  let active=null;
  function clear(){if(active)graphics.bridge.remove_figure(active.id);}
  return {clear,run(code){
    clear();
    if(!["http:","https:"].includes(location.protocol))return Promise.reject(new Error("NiceGUI benötigt HTTP(S). Bitte PYJS auf der Website oder mit einem lokalen Webserver öffnen."));
    return new Promise((resolve,reject)=>{
      const id="nicegui-preview",frame=document.createElement("iframe");
      frame.className="nicegui-frame";frame.title="NiceGUI";
      frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-downloads");
      const current={id,frame,settled:false};active=current;
      const finish=(error)=>{
        if(current.settled)return;
        current.settled=true;clearTimeout(timer);error?reject(error):resolve();
      };
      const receive=event=>{
        if(active!==current || event.source!==frame.contentWindow || event.origin!==location.origin || event.data?.channel!=="pyjs-nicegui")return;
        const {kind,text}=event.data;
        if(kind==="hello")frame.contentWindow.postMessage({channel:"pyjs-nicegui",kind:"code",code},location.origin);
        else if(kind==="stdout" || kind==="stderr")append(String(text),kind==="stderr");
        else if(kind==="done")finish();
        else if(kind==="error"){
          const error=new Error(String(text));
          if(current.settled)onError(error);else finish(error);
        }
      };
      window.addEventListener("message",receive);
      const timer=setTimeout(()=>{
        const error=new Error(t("NiceGUI konnte nicht gestartet werden. Bitte erneut ausführen."));
        finish(error);clear();
      },120000);
      const dispose=()=>{
        if(active===current)active=null;
        window.removeEventListener("message",receive);clearTimeout(timer);
        frame.remove();const error=new Error("NiceGUI stopped");error.cancelled=true;finish(error);
      };
      graphics.addWebApp(id,"NiceGUI",frame,dispose,clear);
      setStatus("NiceGUI wird geladen …");
      frame.src="./nicegui-dist/index.html";
    });
  }};
}
