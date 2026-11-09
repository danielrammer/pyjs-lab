const KEY="pyjs.learn.results.v1";
let accountId=null;
export function useResultsAccount(id){accountId=id;window.dispatchEvent(new CustomEvent("pyjs-results-view",{detail:{accountChanged:true}}));}
const storageKey=()=>accountId?`${KEY}.account.${accountId}`:KEY;
export function accountPending(){return Object.assign(Object.create(null),JSON.parse(localStorage.getItem(storageKey())||"{}").pending||{});}
export function applyAccountResults(results,ack={}){
  const pending=accountPending();
  for(const [id,change] of Object.entries(ack))if(JSON.stringify(pending[id])===JSON.stringify(change))delete pending[id];
  const merged=new Map(validateResults(results).map(result=>[result.id,result]));
  for(const [id,result] of Object.entries(pending))if(result===null)merged.delete(id);else merged.set(id,result);
  localStorage.setItem(storageKey(),JSON.stringify({version:1,results:[...merged.values()].sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt)),pending}));
  window.dispatchEvent(new Event("pyjs-results-view"));
}
function validateResults(results) {
  if(!Array.isArray(results))throw new Error("Keine gültige PYJS-Ergebnisdatei.");
  return results.map(result=>{
    if(!result || typeof result.id!=="string" || !result.id || typeof result.challengeId!=="string" || !result.challengeId ||
      !["python","javascript"].includes(result.language) || typeof result.title!=="string" ||
      typeof result.code!=="string" || typeof result.output!=="string" || typeof result.savedAt!=="string" || !Number.isFinite(Date.parse(result.savedAt)) ||
      (result.description!==undefined && typeof result.description!=="string") || (result.filename!==undefined && typeof result.filename!=="string") ||
      (result.runStatus!==undefined && !["Done","Error","Cancelled","Not run"].includes(result.runStatus)))throw new Error("Die Datei enthält ungültige Challenge-Ergebnisse.");
    return {id:result.id,challengeId:result.challengeId,language:result.language,title:result.title,description:result.description || "",code:result.code,output:result.output,filename:result.filename || `challenge.${result.language==="python"?"py":"js"}`,savedAt:result.savedAt,runStatus:result.runStatus || "Not run"};
  });
}
export function createLearnResultsStore() {
  function all() {
    const raw=localStorage.getItem(storageKey());
    if(raw===null)return [];
    const data=JSON.parse(raw);
    if(data.version!==1)throw new Error("Die gespeicherten Ergebnisse konnten nicht gelesen werden.");
    return validateResults(data.results);
  }
  function write(results) {
    try{
      const pending=accountId?accountPending():{},previous=all();
      if(accountId){
        const next=new Map(results.map(result=>[result.id,result]));
        for(const result of previous)if(!next.has(result.id))pending[result.id]=null;
        for(const result of results)if(!previous.some(old=>old.id===result.id&&JSON.stringify(old)===JSON.stringify(result)))pending[result.id]=result;
      }
      localStorage.setItem(storageKey(),JSON.stringify({version:1,results,...(accountId?{pending}:{})}));
    }
    catch{throw new Error("Speichern im Browser fehlgeschlagen. Bitte Browser-Speicher erlauben oder Speicherplatz freigeben. Dein Code bleibt im Editor.");}
    window.dispatchEvent(new Event("pyjs-results-changed"));
  }
  return {
    all,
    save(work) {
      const result={...work,id:crypto.randomUUID(),savedAt:new Date().toISOString()};
      write([result,...all()]);return result;
    },
    remove(id){write(all().filter(result=>result.id!==id));},
    exportBackup(){return JSON.stringify({format:"pyjs-learn-results",version:1,exportedAt:new Date().toISOString(),results:all()},null,2)+"\n";},
    importBackup(text){
      let data;try{data=JSON.parse(text);}catch{throw new Error("Die Datei ist kein gültiges JSON.");}
      if(!data || data.format!=="pyjs-learn-results" || data.version!==1)throw new Error("Bitte eine PYJS-Ergebnisdatei laden (Version 1).");
      const incoming=validateResults(data.results),existing=all(),identities=new Set(existing.map(result=>result.id));
      const fingerprint=({id,...result})=>JSON.stringify(result);
      const known=new Set(existing.map(fingerprint));let added=0;
      for(const result of incoming){
        const signature=fingerprint(result);if(known.has(signature))continue;
        if(identities.has(result.id))result.id=crypto.randomUUID();
        identities.add(result.id);known.add(signature);existing.push(result);added++;
      }
      if(added){existing.sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt));write(existing);}
      return {added,skipped:incoming.length-added};
    },
  };
}
