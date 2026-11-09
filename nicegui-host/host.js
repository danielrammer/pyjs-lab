// This channel stays local to the editor tab; student source is never uploaded.
window.pyjsSend=(kind,text="")=>window.parent.postMessage({channel:"pyjs-nicegui",kind,text},location.origin);
window.addEventListener("message",event=>{
  if(event.source===window.parent && event.origin===location.origin && event.data?.channel==="pyjs-nicegui" && event.data.kind==="code" && typeof event.data.code==="string")window.__pyjs_code=event.data.code;
});
window.addEventListener("error",event=>window.pyjsSend("error",event.message || "NiceGUI browser error"));
window.addEventListener("unhandledrejection",event=>window.pyjsSend("error",String(event.reason)));
window.pyjsSend("hello");
