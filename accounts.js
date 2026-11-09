import {useResultsAccount,accountPending,applyAccountResults,createLearnResultsStore} from './learn-results.js';
import {t,registerTranslations,onLocaleChange} from './i18n.js';
registerTranslations([
 ['Passwort ändern','Change password'],['Aktuelles Passwort','Current password'],['Neues Passwort','New password'],['Neues Passwort wiederholen','Repeat new password'],['Passwort speichern','Save password'],['Die neuen Passwörter stimmen nicht überein.','The new passwords do not match.'],['Das aktuelle Passwort ist falsch.','The current password is incorrect.'],['Passwort geändert. Andere Anmeldungen wurden beendet.','Password changed. Other sessions have ended.'],['Die aktuelle Anmeldung und deine Ergebnisse bleiben erhalten. Andere Anmeldungen werden beendet.','Your current session and results are preserved. Other sessions will end.'],['Das neue Passwort muss 8–256 Zeichen lang sein.','The new password must contain 8–256 characters.'],
 ['Konto','Account'],['Benutzername','Username'],['Passwort','Password'],['Konto erstellen','Create account'],['Anmelden','Sign in'],['Abmelden','Sign out'],
 ['Ohne Konto bleiben Ergebnisse wie bisher in diesem Browser.','Without an account, results stay in this browser as before.'],
 ['Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, . _ -). Passwort: mindestens 8 Zeichen. Keine E-Mail-Wiederherstellung.','Username: 3–40 characters (letters, digits, . _ -). Password: at least 8 characters. No email recovery.'],
 ['Browser-Ergebnisse ins Konto übernehmen','Copy browser results to account'],['Jetzt synchronisieren','Sync now'],['Im Konto gespeichert.','Saved to account.'],['Synchronisierung läuft …','Syncing …'],['Nur im Browser gespeichert. Synchronisierung ausstehend.','Saved in this browser only. Sync pending.'],['Konto derzeit nicht erreichbar.','Account currently unavailable.'],['Bitte erneut anmelden.','Please sign in again.'],['Keine Browser-Ergebnisse vorhanden.','No browser results available.'],
 ['Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, . _ -). Passwort: 8–256 Zeichen.','Username: 3–40 characters (letters, digits, . _ -). Password: 8–256 characters.'],['Zu viele Versuche. Bitte in fünf Minuten erneut versuchen.','Too many attempts. Try again in five minutes.'],['Dieser Benutzername ist bereits vergeben.','This username is already taken.'],['Benutzername oder Passwort falsch.','Incorrect username or password.'],['Das Konto wurde in einem anderen Tab gewechselt. Bitte erneut anmelden.','The account changed in another tab. Please sign in again.'],['Ungültige Ergebnisdaten.','Invalid result data.'],['Maximal 1000 gespeicherte Ergebnisse pro Konto.','Maximum 1000 saved results per account.']
]);
export function initializeAccounts(){
 const dialog=document.querySelector('#accountDialog'),content=document.querySelector('#accountContent'),button=document.querySelector('#accountButton'),status=document.querySelector('#accountStatus');
 let user=null,busy=false,syncing=null;
 const setStatus=message=>{status.dataset.message=message;status.textContent=t(message);const badge=document.querySelector('#accountSyncStatus');badge.hidden=!user;badge.textContent=t(message);badge.title=t(message);};
 async function api(action,data){
  const response=await fetch('/api/account/'+action,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
  const result=await response.json();if(!response.ok)throw new Error(t(result.error));return result;
 }
 function render(){
  button.textContent=user?user.username:t('Konto');button.title=user?`${t('Konto')}: ${user.username}`:t('Konto');content.replaceChildren();
  const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=t(text);return el;};
  const action=(label,callback)=>{const el=node('button',label);el.type='button';el.addEventListener('click',()=>perform(callback));return el;};
  if(user){
   content.append(node('p',user.username),action('Jetzt synchronisieren',sync),action('Browser-Ergebnisse ins Konto übernehmen',async()=>{
    const guest=JSON.parse(localStorage.getItem('pyjs.learn.results.v1')||'{"results":[]}').results;
    if(!guest.length){setStatus('Keine Browser-Ergebnisse vorhanden.');return;}
    createLearnResultsStore().importBackup(JSON.stringify({format:'pyjs-learn-results',version:1,results:guest}));await sync();
   }),action('Abmelden',async()=>{try{await sync();}catch{}await api('logout',{});user=null;useResultsAccount(null);setStatus('Ohne Konto bleiben Ergebnisse wie bisher in diesem Browser.');render();}));
   const details=node('details'),summary=node('summary','Passwort ändern'),form=node('form');details.className='account-password-change';
   const fields={};
   for(const [name,label] of [['currentPassword','Aktuelles Passwort'],['newPassword','Neues Passwort'],['repeatPassword','Neues Passwort wiederholen']]){
    const wrapper=node('label',label),input=node('input');input.type='password';input.name=name;input.required=true;input.minLength=8;input.maxLength=256;input.autocomplete=name==='currentPassword'?'current-password':'new-password';wrapper.append(input);fields[name]=input;form.append(wrapper);
   }
   const submit=node('button','Passwort speichern');submit.type='submit';form.append(node('p','Die aktuelle Anmeldung und deine Ergebnisse bleiben erhalten. Andere Anmeldungen werden beendet.'),submit);
   form.addEventListener('submit',event=>{event.preventDefault();perform(async()=>{
    if(fields.newPassword.value!==fields.repeatPassword.value){setStatus('Die neuen Passwörter stimmen nicht überein.');fields.repeatPassword.focus();return;}
    try{await api('password',{userId:user.id,currentPassword:fields.currentPassword.value,newPassword:fields.newPassword.value});}catch(error){fields.currentPassword.value='';throw error;}
    form.reset();setStatus('Passwort geändert. Andere Anmeldungen wurden beendet.');
   });});details.append(summary,form);content.append(details);
  }else{
   content.append(node('p','Ohne Konto bleiben Ergebnisse wie bisher in diesem Browser.'),node('p','Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, . _ -). Passwort: mindestens 8 Zeichen. Keine E-Mail-Wiederherstellung.'));
   const form=node('form');
   for(const [name,label] of [['username','Benutzername'],['password','Passwort']]){
    const wrapper=node('label',label),input=node('input');input.name=name;input.required=true;input.type=name==='password'?'password':'text';input.minLength=name==='password'?8:3;input.maxLength=name==='password'?256:40;input.autocomplete=name==='password'?'current-password':'username';if(name==='username')input.pattern='[A-Za-z0-9_.-]{3,40}';wrapper.append(input);form.append(wrapper);
   }
   const login=node('button','Anmelden');login.type='submit';login.value='login';const register=node('button','Konto erstellen');register.type='submit';register.value='register';form.append(login,register);
   form.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));perform(async()=>{
    const result=await api(event.submitter.value,data);user=result.user;useResultsAccount(user.id);render();await sync();
   });});content.append(form);
  }
 }
 async function perform(action){if(busy)return;busy=true;dialog.setAttribute('aria-busy','true');try{await action();}catch(error){setStatus(error.message);}finally{busy=false;dialog.removeAttribute('aria-busy');}}
 async function sync(){
  if(!user)return;
  if(syncing){await syncing;return sync();}
  const identity=user.id;
  syncing=(async()=>{
   setStatus('Synchronisierung läuft …');
   const pending=accountPending(),items=Object.entries(pending);
   // Keep batches below the API body limit; every mutation is idempotent.
   let response;
   if(!items.length)response=await api('results');
   else{
    for(let index=0;index<items.length;index+=2){
     const batch=Object.fromEntries(items.slice(index,index+2));
     response=await api('results',{userId:identity,upsert:Object.values(batch).filter(Boolean),deleted:Object.keys(batch).filter(id=>batch[id]===null)});
     if(user?.id!==identity||response.user.id!==identity)throw new Error(t('Bitte erneut anmelden.'));
     applyAccountResults(response.results,batch);
    }
   }
   if(user?.id!==identity||response.user.id!==identity)throw new Error(t('Bitte erneut anmelden.'));
   applyAccountResults(response.results);
   setStatus(Object.keys(accountPending()).length?'Nur im Browser gespeichert. Synchronisierung ausstehend.':'Im Konto gespeichert.');
  })();
  try{await syncing;}catch(error){setStatus('Nur im Browser gespeichert. Synchronisierung ausstehend.');throw error;}finally{syncing=null;}
 }
 button.addEventListener('click',()=>{render();dialog.showModal();if(user)sync().catch(error=>setStatus(error.message));});
 document.querySelector('#accountClose').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 window.addEventListener('pyjs-results-changed',()=>{if(user){setStatus('Nur im Browser gespeichert. Synchronisierung ausstehend.');sync().catch(()=>{});}});
 window.addEventListener('online',()=>sync().catch(()=>{}));
 window.addEventListener('storage',event=>{if(user&&event.key===`pyjs.learn.results.v1.account.${user.id}`)sync().catch(()=>{});});
 window.addEventListener('focus',()=>sync().catch(()=>{}));
 setInterval(()=>{if(user&&!document.hidden)sync().catch(()=>{});},60000);
 onLocaleChange(()=>{render();setStatus(status.dataset.message||'Ohne Konto bleiben Ergebnisse wie bisher in diesem Browser.');});
 render();setStatus('Ohne Konto bleiben Ergebnisse wie bisher in diesem Browser.');
 api('session').then(async result=>{if(result.user){user=result.user;useResultsAccount(user.id);render();await sync();}}).catch(()=>{if(!user)setStatus('Konto derzeit nicht erreichbar.');});
}
