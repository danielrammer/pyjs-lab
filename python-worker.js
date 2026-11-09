import backendSource from "./python_graphics_backend.py";
import inputSource from "./python_input.py";
import canvasSource from "./python_canvas.py";

const CDN="https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const callbacks=new Map();
const inputBridge={read:()=>null};
let runtimePromise=null, backend=null, canvasBackend=null, runId=null, cancelled=false;
const canvases=new Map();
const send=(type,data={})=>postMessage({type,runId,...data});

async function runtime() {
  if (!runtimePromise) runtimePromise=(async()=>{
    send("status",{text:"Loading Python …"});
    importScripts(CDN+"pyodide.js");
    const py=await loadPyodide({indexURL:CDN});
    const bridge={};
    for(const method of ["draw_figure","set_message","set_cursor","set_mode","draw_rubberband","remove_rubberband","download_figure"]) bridge[method]=(...args)=>send("figure",{method,args});
    bridge.add_figure=(id,title,callback)=>{callbacks.set(id,callback);send("figure",{method:"add_figure",args:[id,title]});};
    bridge.remove_figure=id=>{callbacks.delete(id);send("figure",{method:"remove_figure",args:[id]});};
    py.registerJsModule("_pyjs_graphics",bridge);
    py.registerJsModule("_pyjs_input",inputBridge);
    py.registerJsModule("_pyjs_canvas",{
      create(id,title,width,height,callback){
        const surface=new OffscreenCanvas(width,height);canvases.set(id,{surface,pending:false,dirty:false});callbacks.set(id,callback);
        send("canvas-create",{id,title,width,height});return surface.getContext("2d");
      },
      present(id){
        const item=canvases.get(id);if(!item)return;item.dirty=true;
        if(item.pending)return;item.pending=true;
        const paint=async()=>{
          item.dirty=false;
          try{const bitmap=await createImageBitmap(item.surface);if(canvases.get(id)===item)postMessage({type:"canvas-frame",runId,id,bitmap},[bitmap]);else bitmap.close();}
          catch(error){send("event-error",{message:error.message});}
          finally{if(item.dirty&&canvases.get(id)===item)setTimeout(paint,0);else item.pending=false;}
        };
        setTimeout(paint,0);
      },
      slider(id,key,label,min,max,step,value){send("canvas-slider",{args:[id,key,label,min,max,step,value]});},
      close(id){canvases.delete(id);callbacks.delete(id);send("canvas-close",{id});},
    });
    py.FS.writeFile("/home/pyodide/pyjs_graphics_backend.py",backendSource);
    py.FS.writeFile("/home/pyodide/pyjs_input.py",inputSource);
    py.FS.writeFile("/home/pyodide/pyjs_canvas.py",canvasSource);
    canvasBackend=py.pyimport("pyjs_canvas");
    py.runPython("import os as _pyjs_os; _pyjs_os.environ['MPLBACKEND']='module://pyjs_graphics_backend'; del _pyjs_os");
    py.setStdout({batched:text=>send("stdout",{text})}); py.setStderr({batched:text=>send("stderr",{text})});
    return py;
  })().catch(error=>{runtimePromise=null;throw error;});
  return runtimePromise;
}

self.onmessage=async({data})=>{
  if(data.type==="event") {
    try{callbacks.get(data.id)?.(...data.args);}catch(error){send("event-error",{message:error.message});}
    return;
  }
  if(data.type==="clear") {backend?.prepare_run();canvasBackend?.prepare_run();return;}
  if(data.type!=="run")return;
  runId=data.id; cancelled=false;
  try {
    const py=await runtime();
    const flags=new Int32Array(data.inputBuffer,0,2), bytes=new Uint8Array(data.inputBuffer,8);
    function read(prompt) {
      Atomics.store(flags,0,0); Atomics.store(flags,1,0);
      send("input",{prompt:String(prompt)});
      while(Atomics.load(flags,0)===0) Atomics.wait(flags,0,0);
      if(Atomics.load(flags,0)===2){cancelled=true;return null;}
      const value=new TextDecoder().decode(bytes.slice(0,Atomics.load(flags,1)));
      send("stdout",{text:String(prompt)+value}); return value;
    }
    inputBridge.read=read;
    py.setStdin({stdin:()=>read("Python input: "),isatty:false});
    const input=py.pyimport("pyjs_input");try{input.install();}finally{input.destroy();}
    backend?.prepare_run();
    canvasBackend?.prepare_run();
    await py.loadPackagesFromImports(data.code,{messageCallback:()=>send("status",{text:"Loading Python packages …"}),errorCallback:text=>send("stderr",{text})});
    if(!backend && py.loadedPackages.matplotlib){backend=py.pyimport("pyjs_graphics_backend");backend.configure();}
    send("status",{text:"Running …"});
    try{await py.runPythonAsync(data.code);}finally{backend?.finish_run();}
    send("result");
  } catch(error) {
    send("error",{message:error.message,cancelled:cancelled && /EOFError: Input cancelled\.[\r\n]*$/.test(error.message)});
  }
};
send("ready");
