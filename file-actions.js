import {createLearnResultsStore} from "./learn-results.js";
export function initializeFileActions({saveCurrent,loadCurrent,setStatus}) {
  const dialog=document.querySelector("#fileActionsDialog"),content=document.querySelector("#fileActionsContent"),message=document.querySelector("#fileActionsMessage"),input=document.querySelector("#solutionsInput"),store=createLearnResultsStore();
  function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:"application/json;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function option(label,description,action){const box=document.createElement("div"),button=document.createElement("button"),text=document.createElement("p");button.textContent=label;button.type="button";text.textContent=description;button.addEventListener("click",()=>{message.textContent="";try{action();}catch(error){message.textContent=error.message;}});box.append(button,text);content.append(box);}
  function open(save){
    document.querySelector("#fileActionsHeading").textContent=save?"Save":"Load";content.replaceChildren();message.textContent="";
    if(save){
      option("Save all solutions","Alle im Browser gespeicherten Challenge-Ergebnisse als eine JSON-Datei sichern, einschließlich Python und JavaScript. Aktuellen Challenge-Code zuerst mit Ergebnis speichern sichern.",()=>{const date=new Date().toISOString().slice(0,10);download(store.exportBackup(),`pyjs-solutions-${date}.json`);setStatus("Ergebnisdatei gespeichert");dialog.close();});
      option("Save current file","Nur den aktuellen Editor-Code als .py- oder .js-Datei speichern.",()=>{saveCurrent();dialog.close();});
    }else{
      option("Load solutions","Eine PYJS-JSON-Datei einlesen. Vorhandene Ergebnisse bleiben erhalten; gleiche Ergebnisse werden nicht doppelt importiert.",()=>input.click());
      option("Load file","Eine einzelne Codedatei im Editor öffnen.",()=>{dialog.close();loadCurrent();});
    }
    dialog.showModal();
  }
  document.querySelector("#saveButton").addEventListener("click",()=>open(true));
  document.querySelector("#openButton").addEventListener("click",()=>open(false));
  document.querySelector("#fileActionsClose").addEventListener("click",()=>dialog.close());
  input.addEventListener("change",async()=>{
    const file=input.files[0];if(!file)return;
    try{
      if(file.size>10*1024*1024)throw new Error("Die Ergebnisdatei ist zu groß (maximal 10 MB).");
      const result=store.importBackup(await file.text());
      message.textContent=`${result.added} Ergebnisse geladen; ${result.skipped} bereits vorhanden. Du findest sie in Learn unter Meine Ergebnisse.`;
      setStatus("Ergebnisse geladen");
    }catch(error){message.textContent=error.message;}finally{input.value="";}
  });
  let backdrop=false;
  const outside=e=>{const box=dialog.getBoundingClientRect();return e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom;};
  dialog.addEventListener("pointerdown",e=>{backdrop=e.target===dialog&&outside(e);});
  dialog.addEventListener("click",e=>{if(backdrop&&e.target===dialog&&outside(e))dialog.close();backdrop=false;});
}
