// UI translations are independent of the programming language and user code.
let locale="de";
try{if(localStorage.getItem("pyjs.locale")==="en")locale="en";}catch{}
const listeners=new Set(),translations=new Map(),patterns=[];
const pairs=[
  ["Eigenes Niveau …","Custom level …"],["Eigenes Niveau","Custom level"],
  ["Weitere Aktionen","More actions"],["+ Aufgabe","+ Task"],
  ["Aufgaben suchen","Search tasks"],["Aufgaben","Tasks"],
  ["Neue Aufgabe","New task"],["Beschreibung hinzufügen","Add a description"],["Lösung frei","Solution public"],["Aufgabe bearbeiten: {title}","Edit task: {title}"],
  ["Konvertierung beim Sprachwechsel ist eingeschaltet","Conversion on language switch is enabled"],
  ["Arbeitsbereich","Workspace actions"],["Dateien","Files"],["Editor-Einstellungen","Editor settings"],["Die Konvertierung erfolgt beim Wechsel zwischen Python und JavaScript.","Conversion applies when switching between Python and JavaScript."],
  ["Schreibe hier deinen Code oder öffne Learn für eine Aufgabe.","Write your code here, or open Learn for a challenge."],
  ["Lösung: {title}","Solution: {title}"],
  ["Lernen","Learn"],["Laden","Load"],["Speichern","Save"],["Bereit","Ready"],
  ["Bereit.","Ready."],["Fertig","Done"],["Fehler","Error"],["Abgebrochen","Cancelled"],
  ["Ausführen","Run"],["▶ Ausführen","▶ Run"],["Ausgabe","Output"],["Grafik","Graphics"],
  ["Beides","Both"],
  ["Leeren","Clear"],["Vollbild","Full screen"],["Beispiel laden","Load example"],
  ["Diagramm-Beispiel","Diagram example"],["Canvas-Beispiel","Canvas example"],
  ["Programm läuft …","Running …"],["Python wird geladen …","Loading Python …"],
  ["Python-Pakete werden geladen …","Loading Python packages …"],
  ["Warte auf Eingabe …","Waiting for input …"],["Python-Eingabe","Python input"],
  ["Senden","Send"],["Abbrechen","Cancel"],["☀ Helles Design","☀ Light Theme"],
  ["☾ Dunkles Design","☾ Dark Theme"],["Design wechseln","Switch color theme"],
  ["Vervollständigung wechseln","Switch completion mode"],
  ["Vervollständigung: {mode}","Completion: {mode}"],
  ["Py ↔ JS konvertieren: AN","Convert Py ↔ JS: ON"],
  ["Py ↔ JS konvertieren: AUS","Convert Py ↔ JS: OFF"],
  ["Code beim Sprachwechsel konvertieren (so weit möglich)","Convert the current code when switching languages (best effort)"],
  ["Programmiersprache","Programming language"],["Sprache der Aufgaben","Learn language"],
  ["Code und Ausgabe vergrößern oder verkleinern","Resize code and output"],
  ["Ziehen zum Vergrößern · Doppelklick zum Zurücksetzen","Drag to resize · Double-click to reset"],
  ["Ergebnisse","Results"],["Dateiauswahl schließen","Close file actions"],["Lernen schließen","Close Learn"],
  ["Ergebnis speichern","Save result"],["Nächste Challenge","Next challenge"],["Learn öffnen","Open Learn"],
  ["Aufgaben verwalten","Manage tasks"],["Aufgaben werden geladen…","Loading tasks…"],
  ["Meine Ergebnisse","My results"],["Alle Ergebnisse","All results"],
  ["Zurück zu den Aufgaben","Back to tasks"],["Zurück zur Übersicht","Back to overview"],
  ["Weiter bearbeiten","Continue editing"],["Aktuelle Challenge: {title}","Current challenge: {title}"],
  ["Noch keine Ergebnisse gespeichert. Starte eine Challenge und klicke auf Ergebnis speichern.","No saved results yet. Start a challenge and click Save result."],
  ["Deine Ergebnisse bleiben auf diesem Gerät in diesem Browser gespeichert – auch nach dem Schließen. Beim Löschen der Browserdaten werden sie entfernt.","Your results stay in this browser on this device, even after closing it. Clearing browser data removes them."],
  ["Challenge","Challenge"],["Gespeichert","Saved"],["Ausführung","Run status"],["Ergebnis","Result"],
  ["Ausgeführt","Executed"],["Noch nicht ausgeführt","Not run"],["Ansehen","View"],
  ["Ansehen ({count})","View ({count})"],["Im Editor öffnen","Open in editor"],
  ["Gespeichert: {date}","Saved: {date}"],["Dein Code","Your code"],
  ["Gespeicherte Ausgabe","Saved output"],["Keine Ausgabe gespeichert.","No saved output."],
  ["Ergebnis löschen","Delete result"],["Dieses gespeicherte Ergebnis löschen?","Delete this saved result?"],
  ["Browser-Ergebnisse sind momentan nicht verfügbar.","Browser results are currently unavailable."],
  ["Im Browser gespeichert.","Saved in this browser."],
  ["Ergebnis im Browser gespeichert. Du kannst die nächste Challenge starten.","Result saved in this browser. You can start the next challenge."],
  ["Starte zuerst eine Challenge.","Start a challenge first."],
  ["Bitte zuerst die laufende Ausführung beenden.","Please finish the current run first."],
  ["Wechsle zur Sprache deiner aktiven Challenge, bevor du speicherst.","Switch to the language of your active challenge before saving."],
  ["Aktuellen Code ersetzen? Nicht gespeicherte Änderungen gehen verloren.","Replace the current code? Unsaved changes will be lost."],
  ["Aufgabe starten","Start Challenge"],["Nr.","No."],["Arbeitsauftrag","Instructions"],["Niveau","Level"],
  ["Grundlagen","Basics"],["Aufbau","Intermediate"],["Fortgeschritten","Advanced"],
  ["Expertenbonus","Expert bonus"],["Experten","Expert"],["Noch kein Ergebnis","No result yet"],
  ["Lösung ansehen","View solution"],["Lösung gesperrt","Solution locked"],
  ["Noch keine Aufgaben.","No tasks yet."],
  ["Übe {language} mit diesen Challenges – von den Grundlagen bis zu den Expertenaufgaben.","Practise {language} with these challenges, from basics to expert tasks."],
  ["Vergleiche die Lösung mit deinem eigenen Versuch. Es gibt oft mehrere richtige Wege.","Compare the solution with your own attempt. There is often more than one correct approach."],
  ["Admin-Passwort","Admin password"],["Anmelden","Sign in"],["Abmelden","Sign out"],
  ["Titel","Title"],["Beschreibung","Description"],["Aufgabe {number}","Task {number}"],
  ["Titel (DE)","Title (DE)"],["Titel (EN)","Title (EN)"],
  ["Titel (DE) {number}","Title (DE) {number}"],["Titel (EN) {number}","Title (EN) {number}"],
  ["Beschreibung (DE) {number}","Description (DE) {number}"],["Beschreibung (EN) {number}","Description (EN) {number}"],
  ["Beschreibung (DE)","Description (DE)"],["Beschreibung (EN)","Description (EN)"],
  ["Aufgaben bearbeiten, die Reihenfolge ändern und dann speichern.","Edit tasks, change their order, then save your changes."],
  ["Aufgabe hinzufügen","Add task"],["Änderungen speichern","Save changes"],["Löschen","Delete"],
  ["Aufgaben gespeichert.","Tasks saved."],["Aufgabe {number} nach oben verschieben","Move task {number} up"],
  ["Aufgabe {number} nach unten verschieben","Move task {number} down"],
  ['Aufgabe "{title}" löschen?','Delete task "{title}"?'],
  ["{language}-Lösung bearbeiten","Edit {language} solution"],
  ["{language}-Lösung {number}","{language} solution {number}"],
  ["{language}-Lösung (DE) {number}","{language} solution (DE) {number}"],
  ["{language}-Lösung (EN) {number}","{language} solution (EN) {number}"],
  ["Lösung für Lernende freigeben","Release solution to learners"],
  ["Sichtbar","Visible"],
  ["Ohne Niveau","No level"],
  ["Aufgaben können auf der veröffentlichten Webseite bearbeitet werden.","Task editing is available on the published website."],
  ["Alle Lösungen speichern","Save all solutions"],["Aktuelle Datei speichern","Save current file"],
  ["Alle Lösungen zeigen","Show all solutions"],["Alle Lösungen verbergen","Hide all solutions"],
  ["Alle Lösungen für Lernende freigeben","Release all solutions to learners"],["Alle Lösungen für Lernende sperren","Lock all solutions for learners"],
  ["Lösungen laden","Load solutions"],["Datei laden","Load file"],
  ["Alle im Browser gespeicherten Challenge-Ergebnisse als eine JSON-Datei sichern, einschließlich Python und JavaScript. Aktuellen Challenge-Code zuerst mit Ergebnis speichern sichern.","Back up all challenge results saved in this browser as one JSON file, including Python and JavaScript. Save the current challenge with Save result first."],
  ["Nur den aktuellen Editor-Code als .py- oder .js-Datei speichern.","Save only the current editor code as a .py or .js file."],
  ["Eine PYJS-JSON-Datei einlesen. Vorhandene Ergebnisse bleiben erhalten; gleiche Ergebnisse werden nicht doppelt importiert.","Import a PYJS JSON file. Existing results are kept, and identical results are not imported twice."],
  ["Eine einzelne Codedatei im Editor öffnen.","Open one code file in the editor."],
  ["Die Ergebnisdatei ist zu groß (maximal 10 MB).","The results file is too large (maximum 10 MB)."],
  ["{added} Ergebnisse geladen; {skipped} bereits vorhanden. Du findest sie in Learn unter Meine Ergebnisse.","{added} results loaded; {skipped} already existed. Find them in Learn under My results."],
  ["Ergebnisdatei gespeichert","Results file saved"],["Ergebnisse geladen","Results loaded"],
  ["Datei geladen","File loaded"],["Ergebnis geladen","Result loaded"],["Challenge gestartet","Challenge started"],
  ["Beispiel geladen — drücke Ausführen","Example loaded — press Run"],
  ["Konvertiert","Converted"],["Konvertierung angehalten","Conversion stopped"],
  ["Konvertierung angehalten: {message}","Conversion stopped: {message}"],
  ["Eingabe abgebrochen.","Input cancelled."],["Die Eingabe ist zu lang.","The input is too long."],
  ["Die gespeicherten Ergebnisse konnten nicht gelesen werden.","Could not read saved results."],
  ["Speichern im Browser fehlgeschlagen. Bitte Browser-Speicher erlauben oder Speicherplatz freigeben. Dein Code bleibt im Editor.","Saving in the browser failed. Allow browser storage or free some space. Your code remains in the editor."],
  ["Die Datei ist kein gültiges JSON.","The file is not valid JSON."],
  ["Keine gültige PYJS-Ergebnisdatei.","Not a valid PYJS results file."],
  ["Bitte eine PYJS-Ergebnisdatei laden (Version 1).","Please load a PYJS results file (version 1)."],
  ["Die Datei enthält ungültige Challenge-Ergebnisse.","The file contains invalid challenge results."],
  ["Python-Grafik","Python graphics"],["JavaScript-Grafik","JavaScript graphics"],
  ["Erwecke deinen Python-Code zum Leben","Bring your Python code to life"],
  ["Erwecke deinen JavaScript-Code zum Leben","Bring your JavaScript code to life"],
  ["Zeichne mit pyjs_canvas oder erstelle Diagramme mit matplotlib.pyplot. Ziehe Formen, animiere Bewegungen und verwende Regler.","Draw with pyjs_canvas or create charts with matplotlib.pyplot. Drag shapes, animate movement, and use sliders."],
  ["Zeichne Diagramme mit graphics.plot() oder Formen auf Canvas. Verschiebe und zoome die Ansicht und füge Regler hinzu.","Draw a chart with graphics.plot(), or draw on a Canvas. Pan, zoom, and add interactive sliders and buttons."],
  ["Lädt ein Beispiel in den Editor. Rückgängig stellt deinen Code wieder her.","Loads an example into the editor. Undo restores your code."],
  ["Lädt ein Regler-Beispiel in den Editor. Rückgängig stellt deinen Code wieder her.","Loads a slider example into the editor. Undo restores your code."],
  ["Verschieben: Diagramm ziehen. Zoom: Rechteck aufziehen.","Pan: drag the plot. Zoom: drag a rectangle."],
  ["Interaktives Python-Canvas","Interactive Python Canvas"],["Interaktives JavaScript-Canvas","Interactive JavaScript Canvas"],
  ["Zurücksetzen","Reset"],["Zurück","Back"],["Vorwärts","Forward"],["Verschieben","Pan"],
  ["Zoom","Zoom"],["PNG speichern","Save PNG"],
  ["{title} steuern","{title} controls"],
  ["{title}: interaktives Python-Diagramm","{title}: interactive Python plot"],
  ["{title}: interaktives Python-Canvas","{title}: interactive Python Canvas"],
  ["Bitte erneut anmelden.","Please sign in again."],["Bitte erneut versuchen.","Please try again."],
  ["Falsches Passwort.","Incorrect password."],["Aufgabe nicht gefunden.","Task not found."],
  ["Diese Lösung ist noch nicht freigegeben.","This solution has not been released yet."],
  ["Zu viele Versuche. Bitte in fünf Minuten erneut versuchen.","Too many attempts. Try again in five minutes."],
  ["Die Liste wurde anderswo geändert. Abbrechen und neu laden, bevor du weiter bearbeitest.","The list changed elsewhere. Cancel to reload it before editing again."],
  ["Jede Aufgabe benötigt Titel und Beschreibung (höchstens 100 Aufgaben).","Each task needs a title and description (up to 100 tasks)."],
  ["Ungültige Anfrage.","Invalid request."],["JSON erforderlich.","JSON required."],["Nicht gefunden.","Not found."],
  ["Anfragequelle abgelehnt.","Request origin rejected."],["Python-Ausführung fehlgeschlagen.","Python worker failed."],
];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export function registerTranslations(items){
  for(const [de,en] of items){
    if(!de||!en)continue;
    if(de.includes("{")){
      for(const [source,target] of [[de,en],[en,de]]){
        const keys=[];const parts=source.split(/(\{\w+\})/g).map(part=>/^\{\w+\}$/.test(part)?(keys.push(part.slice(1,-1)),"(.+?)"):escape(part));
        patterns.push({regex:new RegExp("^"+parts.join("")+"$"),keys,target,locale:source===de?"en":"de"});
      }
    }else{translations.set(de,{de,en});translations.set(en,{de,en});}
  }
}
registerTranslations(pairs);
export function getLocale(){return locale;}
export function t(text){
  if(typeof text!=="string")return text;
  const whitespace=text.match(/^(\s*)([\s\S]*?)(\s*)$/),value=whitespace[2];
  const exact=translations.get(value);if(exact)return whitespace[1]+exact[locale]+whitespace[3];
  for(const pattern of patterns){if(pattern.locale!==locale)continue;const match=value.match(pattern.regex);if(match){const values=Object.fromEntries(pattern.keys.map((key,i)=>[key,match[i+1]]));return whitespace[1]+pattern.target.replace(/\{(\w+)\}/g,(_,key)=>values[key])+whitespace[3];}}
  return text;
}
export function localized(entry,key){return locale==="en"&&entry[key+"_en"]?entry[key+"_en"]:entry[key];}
export function onLocaleChange(callback){listeners.add(callback);return()=>listeners.delete(callback);}
const excluded=node=>node.parentElement?.closest(".cm-editor,#output,pre,textarea,[data-no-i18n]");
function translateTree(root){
  if(root.nodeType===Node.TEXT_NODE){if(!excluded(root)){const value=t(root.data);if(value!==root.data)root.data=value;}return;}
  if(root.nodeType!==Node.ELEMENT_NODE)return;
  for(const attr of ["title","aria-label","alt","placeholder"]){if(root.hasAttribute(attr)){const value=t(root.getAttribute(attr));if(value!==root.getAttribute(attr))root.setAttribute(attr,value);}}
  if(root.matches(".cm-editor,#output,pre,textarea,[data-no-i18n]"))return;
  for(const child of root.childNodes)translateTree(child);
}
export function initializeLocale(){
  document.documentElement.lang=locale;const select=document.querySelector("#uiLanguage");select.value=locale;
  const observer=new MutationObserver(changes=>{for(const change of changes){if(change.type==="childList")for(const node of change.addedNodes)translateTree(node);else translateTree(change.target);}});
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["title","aria-label","alt","placeholder"]});
  translateTree(document.body);
  const confirm=window.confirm.bind(window);window.confirm=message=>confirm(t(message));
  select.addEventListener("change",()=>{locale=select.value==="en"?"en":"de";try{localStorage.setItem("pyjs.locale",locale);}catch{}document.documentElement.lang=locale;for(const callback of listeners)callback(locale);translateTree(document.body);});
}
