import workerSource from "./python-worker.bundle.txt";
import {createPythonCanvasDisplay} from "./python-canvas.js";
import {t} from "./i18n.js";

export function createPythonWorker({append,setStatus,graphics,onError}) {
  const url=URL.createObjectURL(new Blob([workerSource],{type:"text/javascript"}));
  const worker=new Worker(url);
  const canvasDisplay=createPythonCanvasDisplay(graphics,onError);
  const form=document.querySelector("#pythonInputForm"), label=document.querySelector("#pythonInputLabel"), field=document.querySelector("#pythonInputValue");
  let nextId=0, pending=null, buffer=null;
  function answer(value) {
    if(!buffer)return;
    const flags=new Int32Array(buffer,0,2), bytes=new Uint8Array(buffer,8);
    if(value!==null){const encoded=new TextEncoder().encode(value);if(encoded.length>bytes.length){field.setCustomValidity(t("Die Eingabe ist zu lang."));field.reportValidity();return;}bytes.set(encoded);Atomics.store(flags,1,encoded.length);}
    Atomics.store(flags,0,value===null ? 2 : 1);Atomics.notify(flags,0);
    buffer=null;form.hidden=true;field.value="";setStatus("Running …");
  }
  form.addEventListener("submit",event=>{event.preventDefault();answer(field.value);});
  field.addEventListener("input",()=>field.setCustomValidity(""));
  document.querySelector("#pythonInputCancel").addEventListener("click",()=>answer(null));
  worker.onmessage=({data})=>{
    if(data.type==="ready"){URL.revokeObjectURL(url);return;}
    if(data.type==="canvas-create"){canvasDisplay.bridge.create(data.id,data.title,data.width,data.height,(...args)=>worker.postMessage({type:"event",id:data.id,args}));return;}
    if(data.type==="canvas-frame"){canvasDisplay.frame(data.id,data.bitmap);return;}
    if(data.type==="canvas-slider"){canvasDisplay.bridge.slider(...data.args);return;}
    if(data.type==="canvas-close"){canvasDisplay.bridge.close(data.id);return;}
    if(data.type==="figure") {
      if(data.method==="add_figure") graphics.bridge.add_figure(...data.args,(...args)=>worker.postMessage({type:"event",id:data.args[0],args}));
      else graphics.bridge[data.method](...data.args);
      return;
    }
    if(data.type==="event-error"){onError(new Error(data.message));return;}
    if(data.runId!==nextId)return;
    if(data.type==="stdout" || data.type==="stderr"){append(data.text,data.type==="stderr");return;}
    if(!pending || pending.id!==data.runId)return;
    if(data.type==="status")setStatus(data.text);
    else if(data.type==="input") {
      buffer=pending.inputBuffer;label.textContent=data.prompt || "Python input";form.hidden=false;field.value="";field.setCustomValidity("");
      graphics.showOutput();setStatus("Waiting for input …");field.focus({preventScroll:true});field.scrollIntoView({block:"nearest"});
    } else if(data.type==="result" || data.type==="error") {
      form.hidden=true;buffer=null;const current=pending;pending=null;
      if(data.type==="result")current.resolve();else{const error=new Error(data.message);error.cancelled=data.cancelled;current.reject(error);}
    }
  };
  worker.onerror=event=>{form.hidden=true;buffer=null;const error=new Error(event.message || "Python worker failed.");if(pending){pending.reject(error);pending=null;}else onError(error);};
  return {
    run(code){canvasDisplay.clear();return new Promise((resolve,reject)=>{const id=++nextId,inputBuffer=new SharedArrayBuffer(65544);pending={id,inputBuffer,resolve,reject};worker.postMessage({type:"run",id,code,inputBuffer});});},
    clear(){canvasDisplay.clear();worker.postMessage({type:"clear"});},
  };
}
