import {t,getLocale,registerTranslations} from './i18n.js';
registerTranslations([
 ['Aktualisieren','Refresh'],
 ['Benutzer verwalten','Manage users'],['Benutzerübersicht','User overview'],['Fortschritt ansehen','View progress'],['Gespeicherte Aufgaben','Tasks with saved results'],['Gespeicherte Versionen','Saved versions'],['Zuletzt gespeichert','Last saved'],['Noch keine Benutzer vorhanden.','No users yet.'],['Noch keine Ergebnisse gespeichert.','No saved results yet.'],['Zurück zur Benutzerübersicht','Back to user overview'],['Neues Passwort','New password'],['Passwort zurücksetzen','Reset password'],['Das neue Passwort muss 8–256 Zeichen lang sein.','The new password must contain 8–256 characters.'],['Benutzer nicht gefunden.','User not found.'],['Passwort geändert. Alle Anmeldungen dieses Benutzers wurden beendet.','Password changed. All sessions for this user have ended.'],['Gespeichert bedeutet bearbeitet, nicht automatisch als richtig geprüft. Es zählen nur die aktuell sichtbaren Aufgaben.','Saved means attempted, not automatically verified as correct. Only currently visible tasks count.'],['Hier erscheinen nur im Konto synchronisierte Ergebnisse. Browser-Ergebnisse ohne Übertragung sind nicht sichtbar.','Only results synced to the account appear here. Browser results that have not been uploaded are not visible.'],['Passwort festlegen und der Person separat mitteilen. Bestehende Sitzungen werden beendet; Ergebnisse bleiben erhalten.','Set a password and share it with the person separately. Existing sessions end; results are preserved.'],['Nicht mehr sichtbare oder entfernte Aufgaben können weiterhin gespeicherte Versionen haben.','Hidden or removed tasks may still have saved versions.'],['Nicht mehr im Aufgabenkatalog','No longer in the task catalog'],['Ungespeicherte Aufgabenänderungen verwerfen?','Discard unsaved task changes?']
]);
export function createAdminUsers({content,heading,adminActions,message,api,button,perform,back,tasks,getGeneration}){
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=t(text);if(className)node.className=className;return node;};
 const date=value=>value?new Date(value).toLocaleString(getLocale()==='de'?'de-AT':'en-GB'):'—';
 function header(title,actions){content.replaceChildren();heading.textContent=t(title);adminActions.replaceChildren(...actions);document.querySelector('#learnLanguage').hidden=true;document.querySelector('#learnDialog').classList.remove('learn-task-admin');document.querySelector('#learnDialog').scrollTop=0;}
 function table(headers){const table=el('table',undefined,'learn-table admin-users-table'),head=el('thead'),row=el('tr'),body=el('tbody');for(const text of headers){const th=el('th',text);th.scope='col';row.append(th);}head.append(row);table.append(head,body);const scroll=el('div',undefined,'learn-table-scroll');scroll.append(table);content.append(scroll);return body;}
 async function overview(){
  const stamp=getGeneration(),data=await api('/api/admin/users');if(!document.querySelector('#learnDialog').open||stamp!==getGeneration())return;
  header('Benutzer verwalten',[button('Manage tasks',back),button('Aktualisieren',overview),button('Sign out',()=>document.querySelector('#learnClose').click())]);
  content.append(el('p','Gespeichert bedeutet bearbeitet, nicht automatisch als richtig geprüft. Es zählen nur die aktuell sichtbaren Aufgaben.'),el('p','Hier erscheinen nur im Konto synchronisierte Ergebnisse. Browser-Ergebnisse ohne Übertragung sind nicht sichtbar.'));
  if(!data.users.length){content.append(el('p','Noch keine Benutzer vorhanden.'));return;}
  const body=table(['Benutzername','Python','JavaScript','Gespeicherte Versionen','Zuletzt gespeichert','']);
  for(const user of data.users){const row=el('tr'),name=el('td');name.textContent=user.username;row.append(name,el('td',`${user.progress.python} / ${data.totals.python}`),el('td',`${user.progress.javascript} / ${data.totals.javascript}`),el('td',String(user.versions)),el('td',date(user.lastSavedAt)));const actions=el('td');actions.append(button('Fortschritt ansehen',()=>detail(user.id)));row.append(actions);body.append(row);}
 }
 async function detail(id){
  const stamp=getGeneration(),data=await api('/api/admin/users/'+encodeURIComponent(id));if(!document.querySelector('#learnDialog').open||stamp!==getGeneration())return;
  header('Benutzer verwalten',[button('Zurück zur Benutzerübersicht',overview),button('Manage tasks',back)]);
  const name=el('h3');name.textContent=data.user.username;content.append(name);
  const form=el('form',undefined,'admin-password-form'),label=el('label','Neues Passwort'),input=el('input');input.type='password';input.name='newPassword';input.required=true;input.minLength=8;input.maxLength=256;input.autocomplete='new-password';label.append(input);
  const submit=el('button','Passwort zurücksetzen');submit.type='submit';form.append(label,submit);
  const note=el('p','Passwort festlegen und der Person separat mitteilen. Bestehende Sitzungen werden beendet; Ergebnisse bleiben erhalten.');content.append(form,note);
  form.addEventListener('submit',event=>{event.preventDefault();perform(async()=>{
   if(!window.confirm(getLocale()==='de'?`Passwort für „${data.user.username}“ zurücksetzen und alle Anmeldungen beenden?`:`Reset the password for “${data.user.username}” and end all sessions?`))return;
   await api('/api/admin/users/'+encodeURIComponent(id)+'/password','POST',{password:input.value});input.value='';message.textContent=t('Passwort geändert. Alle Anmeldungen dieses Benutzers wurden beendet.');
  });});
  content.append(el('h3','Gespeicherte Aufgaben'),el('p','Hier erscheinen nur im Konto synchronisierte Ergebnisse. Browser-Ergebnisse ohne Übertragung sind nicht sichtbar.'),el('p','Nicht mehr sichtbare oder entfernte Aufgaben können weiterhin gespeicherte Versionen haben.'));
  if(!data.results.length){content.append(el('p','Noch keine Ergebnisse gespeichert.'));return;}
  const grouped=new Map();for(const result of data.results){const key=JSON.stringify([result.language,result.challengeId]);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(result);}
  for(const versions of grouped.values()){
   const latest=versions[0],task=tasks().find(entry=>entry.id===latest.challengeId&&(entry.language||'python')===latest.language);
   const group=el('details',undefined,'admin-user-task'),summary=el('summary');summary.textContent=`${task?(getLocale()==='en'?task.title_en||task.title:task.title):latest.title} · ${latest.language==='python'?'Python':'JavaScript'} · ${versions.length} ${t('Gespeicherte Versionen')}`;group.append(summary);
   if(!task)group.append(el('p','Nicht mehr im Aufgabenkatalog'));
   for(const result of versions){
    const version=el('details'),title=el('summary',`${date(result.savedAt)} · ${t(result.runStatus||'Not run')}`);version.append(title,el('h4','Dein Code'),el('pre',undefined,'learn-solution-code'),el('h4','Gespeicherte Ausgabe'),el('pre',undefined,'learn-solution-code'));const blocks=version.querySelectorAll('pre');blocks[0].textContent=result.code;blocks[1].textContent=result.output||t('Keine Ausgabe gespeichert.');group.append(version);
   }
   content.append(group);
  }
 }
 return {overview};
}
