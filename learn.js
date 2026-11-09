import defaults from "./learn-defaults.json";
import {createLearnResultsStore} from "./learn-results.js";
import {createAdminUsers} from "./admin-users.js";
import {getLocale,t,localized,onLocaleChange,registerTranslations} from "./i18n.js";
registerTranslations(defaults.map(entry=>[entry.title,entry.title_en]));

export function initializeLearn({getLanguage=()=>"python",getWork,openWork}={}) {
  const dialog = document.querySelector("#learnDialog");
  const content = document.querySelector("#learnContent");
  const message = document.querySelector("#learnMessage");
  const manage = document.querySelector("#learnManage");
  const heading = document.querySelector("#learnHeading");
  const adminActions = document.querySelector("#learnAdminActions");
  const languageSelect = document.querySelector("#learnLanguage");
  const store=createLearnResultsStore();
  const challengeBar=document.querySelector("#challengeBar"),challengeMessage=document.querySelector("#challengeMessage");
  let active=null,catalog=[],viewMode="tasks",solutionPreview=null;
  let language="python";
  const levelNames=["Grundlagen","Aufbau","Fortgeschritten","Expertenbonus","Experten"];
  const levelAliases=new Map(["Basics","Intermediate","Advanced","Expert bonus","Expert"].map((name,index)=>[name,levelNames[index]]));
  const levelOf=entry=>levelAliases.get(entry.level)||entry.level||"Ohne Niveau";
  const collapsedLevels=new Map();
  function orderedTasks(rows){
    const levels=[...levelNames,...new Set(rows.map(levelOf).filter(level=>!levelNames.includes(level)))];
    return rows.slice().sort((a,b)=>levels.indexOf(levelOf(a))-levels.indexOf(levelOf(b)));
  }
  const languageName=()=>language==="javascript"?"JavaScript":"Python";
  const belongs=entry=>(entry.language || "python")===language;
  let entries = [], version = 0, busy = false, generation = 0;
  const local = location.protocol === "file:";
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = tag==="pre"||tag==="code"?text:t(text);
    if (className) node.className = className;
    return node;
  };
  const button = (text, action) => {
    const node = element("button", text); node.type = "button";
    node.addEventListener("click", () => perform(action)); return node;
  };
  const usersAdmin=createAdminUsers({content,heading,adminActions,message,api,button,perform,back:edit,tasks:()=>entries,getGeneration:()=>generation});
  function fitDescription(field){
    field.style.height="auto";
    field.style.height=`${Math.min(field.scrollHeight+2,180)}px`;
  }
  let descriptionWidth=0;
  const descriptionSizer=new ResizeObserver(([entry])=>{
    if(entry.contentRect.width===descriptionWidth)return;
    descriptionWidth=entry.contentRect.width;
    content.querySelectorAll(".learn-description-field textarea").forEach(fitDescription);
  });
  descriptionSizer.observe(content);
  function results(){return store.all().filter(result=>result.language===language);}
  window.addEventListener("pyjs-results-view",event=>{if(event.detail?.accountChanged){active=null;updateChallengeBar();if(dialog.open)list();}else if(dialog.open&&!languageSelect.disabled){if(viewMode==="results")resultsList();else list();}});
  function nextChallenge(){
    if(!active)return null;
    const tasks=orderedTasks(catalog.filter(entry=>(entry.language || "python")===active.entry.language));
    const index=tasks.findIndex(entry=>entry.id===active.entry.id);
    return index>=0?tasks[index+1]:null;
  }
  function updateChallengeBar(){
    challengeBar.hidden=!active;
    if(!active)return;
    document.querySelector("#challengeTitle").textContent=`${localized(active.entry,"title")} · ${active.entry.language==="python"?"Python":"JavaScript"}`;
    document.querySelector("#challengeNext").disabled=!nextChallenge();
  }
  function startChallenge(entry,saved=null){
    const work=getWork();
    if(work.running)throw new Error("Bitte zuerst die laufende Ausführung beenden.");
    const hasCode=work.code.split("\n").some(line=>line.trim()&&!line.trim().startsWith(work.language==="python"?"#":"//"));
    const alreadySaved=active?.entry.language===work.language && active.lastSavedCode===work.code;
    if(hasCode&&!alreadySaved&&work.code!==saved?.code&&!window.confirm("Aktuellen Code ersetzen? Nicht gespeicherte Änderungen gehen verloren."))return;
    const task={...entry,language:entry.language || "python"},prefix=task.language==="python"?"#":"//";
    const comments = text => text.replace(/\r\n?/g,"\n").split("\n").flatMap(paragraph=>{
      const lines=[];let line=prefix;
      for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
        if(line.length+word.length+1>76 && line!==prefix){lines.push(line);line=prefix;}
        line+=` ${word}`;
      }
      lines.push(line);return lines;
    });
    const starter=[...comments(`Challenge: ${localized(task,"title").replace(/[\r\n]+/g," ")}`),...comments(localized(task,"description")),"",localized(task,"starter_code") || "",""] .join("\n");
    openWork(saved || {language:task.language,code:starter,filename:`${task.id}.${task.language==="python"?"py":"js"}`});
    active={entry:task,lastSavedCode:saved?.code};challengeMessage.textContent="";updateChallengeBar();dialog.close();
  }
  function saveResult(){
    if(!active)throw new Error("Starte zuerst eine Challenge.");
    const work=getWork();
    if(work.running)throw new Error("Bitte zuerst die laufende Ausführung beenden.");
    if(work.language!==active.entry.language)throw new Error("Wechsle zur Sprache deiner aktiven Challenge, bevor du speicherst.");
    const result=store.save({challengeId:active.entry.id,title:localized(active.entry,"title"),description:localized(active.entry,"description"),...work});
    active.lastSavedCode=work.code;
    challengeMessage.textContent="Im Browser gespeichert.";
    if(dialog.open){list();message.textContent="Ergebnis im Browser gespeichert. Du kannst die nächste Challenge starten.";}
    return result;
  }
  function outsideAction(action){
    try{action();}catch(error){challengeMessage.textContent=error.message;}
  }
  function resultsList(challengeId=null){
    viewMode="results";content.replaceChildren();manage.hidden=false;adminActions.replaceChildren();languageSelect.disabled=false;
    heading.textContent="Meine Ergebnisse";
    document.querySelector("#learnIntro").textContent="Deine Ergebnisse bleiben auf diesem Gerät in diesem Browser gespeichert – auch nach dem Schließen. Beim Löschen der Browserdaten werden sie entfernt.";
    content.append(button("Zurück zu den Aufgaben",list));
    const saved=results().filter(result=>!challengeId || result.challengeId===challengeId);
    if(!saved.length){content.append(element("p","Noch keine Ergebnisse gespeichert. Starte eine Challenge und klicke auf Ergebnis speichern."));return;}
    const table=element("table",undefined,"learn-table learn-results-table"),head=element("thead"),row=element("tr");
    for(const title of ["Challenge","Gespeichert","Ausführung","Ergebnis"]){const cell=element("th",title);cell.scope="col";row.append(cell);}head.append(row);table.append(head);
    const body=element("tbody");
    for(const result of saved){
      const row=element("tr");
      row.append(element("td",result.title),element("td",new Date(result.savedAt).toLocaleString(getLocale()==="de"?"de-AT":"en-GB")),element("td",result.runStatus==="Done"?"Ausgeführt":result.runStatus==="Error"?"Fehler":result.runStatus==="Cancelled"?"Abgebrochen":"Noch nicht ausgeführt"));
      const actions=element("td");actions.append(button("Ansehen",()=>showResult(result)),button("Im Editor öffnen",()=>resumeResult(result)));
      row.append(actions);body.append(row);
    }
    table.append(body);const scroll=element("div",undefined,"learn-table-scroll");scroll.append(table);content.append(scroll);
  }
  function resumeResult(result){
    const entry=catalog.find(entry=>entry.id===result.challengeId && (entry.language || "python")===result.language) || {id:result.challengeId,title:result.title,description:result.description || "",language:result.language};
    startChallenge(entry,result);
  }
  function showResult(result){
    content.replaceChildren();languageSelect.disabled=true;manage.hidden=true;adminActions.replaceChildren();
    content.append(element("h3",result.title),element("p",`Gespeichert: ${new Date(result.savedAt).toLocaleString("de-AT")}`),button("Im Editor öffnen",()=>resumeResult(result)),button("Zurück zur Übersicht",list));
    content.append(element("h4","Dein Code"),element("pre",result.code,"learn-solution-code"),element("h4","Gespeicherte Ausgabe"),element("pre",result.output || "Keine Ausgabe gespeichert.","learn-solution-code"));
    content.append(button("Ergebnis löschen",()=>{if(window.confirm(`Gespeichertes Ergebnis zu "${result.title}" löschen?`)){store.remove(result.id);resultsList(result.challengeId);}}));
  }
  async function perform(action) {
    if (busy) return;
    busy = true; message.textContent = "";
    try { await action(); } catch (error) { message.textContent = error.message; }
    finally { busy = false; }
  }
  async function api(path, method = "GET", data) {
    const response = await fetch(path, {method, credentials:"same-origin", keepalive:path === "/api/admin/logout", headers:{"Content-Type":"application/json"}, body:data === undefined ? undefined : JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok) throw new Error(t(result.error || "Please try again."));
    return result;
  }
  function list() {
    languageSelect.hidden=false;
    viewMode="tasks";
    dialog.classList.remove("learn-admin-view","learn-task-admin");
    content.replaceChildren(); manage.hidden = false; heading.textContent="Learn"; adminActions.replaceChildren();languageSelect.disabled=false;
    document.querySelector("#learnIntro").textContent=`Übe ${languageName()} mit diesen Challenges – von den Grundlagen bis zu den Expertenaufgaben.`;
    const table = element("table", undefined, "learn-table learn-tasks-table");
    const head = element("thead"), row = element("tr");
    let saved=[];try{saved=results();}catch{message.textContent="Browser-Ergebnisse sind momentan nicht verfügbar.";}
    adminActions.append(button("Alle Ergebnisse",()=>resultsList()));
    if(active && active.entry.language===language){
      const current=element("div",undefined,"learn-current-challenge");current.append(element("strong",`Aktuelle Challenge: ${active.entry.title}`),button("Weiter bearbeiten",()=>dialog.close()),button("Ergebnis speichern",saveResult));
      const next=nextChallenge();if(next)current.append(button("Nächste Challenge",()=>startChallenge(next)));content.append(current);
    }
    for (const title of ["Nr.", "Challenge", "Arbeitsauftrag", "Niveau", "Meine Ergebnisse", "Lösung"]) { const cell = element("th", title); cell.scope = "col"; row.append(cell); }
    head.append(row); table.append(head);
    const visible=orderedTasks(entries.filter(belongs));
    let body=null,lastLevel=null;
    visible.forEach((entry, index) => {
      const level=levelOf(entry);
      if(level!==lastLevel){
        lastLevel=level;
        const group=element("tbody",undefined,"learn-level-heading"),groupRow=element("tr"),cell=element("td");cell.colSpan=6;
        body=element("tbody",undefined,"learn-level-tasks");body.id=`learn-level-${index}`;
        const rows=body,key=`${language}:${level}`,count=visible.filter(task=>levelOf(task)===level).length;
        const toggle=button(`${t(level)} (${count})`,()=>{rows.hidden=!rows.hidden;collapsedLevels.set(key,rows.hidden);toggle.setAttribute("aria-expanded",String(!rows.hidden));});
        rows.hidden=collapsedLevels.get(key)??true;toggle.setAttribute("aria-label",`${t(level)} (${count})`);toggle.setAttribute("aria-expanded",String(!rows.hidden));toggle.setAttribute("aria-controls",rows.id);
        cell.append(toggle);groupRow.append(cell);group.append(groupRow);table.append(group,rows);
      }
      const row = element("tr"); row.append(element("td", String(index + 1).padStart(2, "0")),element("td",localized(entry,"title")));
      row.children[1].setAttribute("aria-label",localized(entry,"title"));
      const reveal = button(entry.solution_available ? "Lösung ansehen" : "Lösung gesperrt",()=>showSolution(entry));
      reveal.className="learn-reveal"; reveal.disabled=!entry.solution_available || local;
      const start=button("Start Challenge",()=>startChallenge(entry));start.className="learn-start";row.children[1].append(start);
      const description = element("td");
      localized(entry,"description").split(/(`[^`]+`)/g).forEach(part => description.append(part.startsWith("`") && part.endsWith("`") ? element("code", part.slice(1,-1)) : document.createTextNode(part)));
      const personal=element("td"),attempts=saved.filter(result=>result.challengeId===entry.id);
      if(attempts.length){const open=button(`Ansehen (${attempts.length})`,()=>showResult(attempts[0]));open.className="learn-reveal primary";personal.append(open);}else personal.append(element("small","Noch kein Ergebnis"));
      const solution=element("td");solution.append(reveal);
      row.append(description,element("td",entry.level || "—"),personal,solution); body.append(row);
    });
    const scroll = element("div",undefined,"learn-table-scroll"); scroll.append(table); content.append(scroll);
    if (!visible.length) content.append(element("p", "No tasks yet."));
  }
  async function load() {
    if (!local) await api("/api/admin/logout", "POST", {});
    message.textContent = "Loading tasks…";
    const result = local ? {entries:defaults, version:0} : await api("/api/learn");
    entries = result.entries;catalog=entries.map(entry=>({...entry})); version = result.version; message.textContent = "";updateChallengeBar(); list();
  }
  async function showSolution(entry) {
    const result = await api(`/api/learn/${encodeURIComponent(entry.id)}/solution`);
    solutionPreview=result;drawSolution();
  }
  function drawSolution(){
    const result=solutionPreview;viewMode="solution";
    content.replaceChildren(); manage.hidden=true; adminActions.replaceChildren();languageSelect.disabled=true;
    content.append(element("h3",t(`Lösung: ${localized(result,"title")}`)),element("p","Vergleiche die Lösung mit deinem eigenen Versuch. Es gibt oft mehrere richtige Wege."));
    const code = element("code"), pre = element("pre",undefined,"learn-solution-code");code.textContent=localized(result,"solution");pre.append(code);content.append(pre,button("Zurück zu den Aufgaben",load));
  }
  function login() {
    dialog.classList.remove("learn-task-admin");
    dialog.classList.add("learn-admin-view");
    manage.hidden = true; content.replaceChildren(); heading.textContent="Manage tasks"; adminActions.replaceChildren();languageSelect.disabled=true;
    const form = element("form", undefined, "learn-login");
    const label = element("label", "Admin password");
    const input = element("input"); input.type = "password"; input.autocomplete = "current-password"; input.required = true; input.id = "learnPassword"; label.htmlFor = input.id;
    const submit = element("button", "Sign in"); submit.type = "submit"; submit.className = "primary";
    form.append(label,input,submit,button("Back",load));
    form.addEventListener("submit", event => {event.preventDefault(); perform(async () => {
      const current = generation;
      await api("/api/admin/login", "POST", {password:input.value}); input.value = "";
      if (!dialog.open || current !== generation) { await api("/api/admin/logout", "POST", {}); return; }
      const privateState = await api("/api/admin/learn");
      if (!dialog.open || current !== generation) { await api("/api/admin/logout", "POST", {}); return; }
      entries = privateState.entries; version = privateState.version;
      edit();
    });}); content.append(form); input.focus();
  }
  function edit() {
    languageSelect.hidden=false;
    manage.hidden = true; heading.textContent="Manage tasks";
    heading.append(element("small",languageName(),"learn-admin-language-label"));
    dialog.classList.add("learn-admin-view","learn-task-admin");
    const draft = structuredClone(entries.filter(belongs));
    const originalDraft=JSON.stringify(draft);
    let expandedEntry=null;
    let filterText="";
    function reveal(card){
      card.scrollIntoView({block:"nearest"});
      const top=dialog.querySelector(".learn-heading").getBoundingClientRect().bottom+8;
      if(card.getBoundingClientRect().top<top)dialog.scrollTop-=top-card.getBoundingClientRect().top;
    }
    function draw() {
      content.replaceChildren();
      const filterBar=element("div",undefined,"learn-task-filter"),filterLabel=element("label"),filterInput=element("input"),countLabel=element("span");
      filterInput.type="search";filterInput.value=filterText;filterInput.placeholder=t("Aufgaben suchen");filterInput.setAttribute("aria-label",t("Aufgaben suchen"));filterLabel.append(filterInput);filterBar.append(filterLabel,countLabel);content.append(filterBar);
      function applyFilter(){
        const query=filterText.trim().toLocaleLowerCase();let count=0;
        [...content.querySelectorAll(".learn-task-card")].forEach((row,index)=>{const entry=draft[index];row.hidden=!!query&&![entry.title,entry.title_en,entry.description,entry.description_en,entry.level,t(entry.level||"")].join(" ").toLocaleLowerCase().includes(query);if(!row.hidden)count++;});
        countLabel.textContent=`${count} / ${draft.length} ${t("Aufgaben")}`;
      }
      filterInput.addEventListener("input",()=>{filterText=filterInput.value;applyFilter();});
      const toggleRelease=()=>{
        const released=!draft.every(entry=>entry.solution_released);
        for(const entry of draft)entry.solution_released=released;
        for(const checkbox of content.querySelectorAll(".learn-release input"))checkbox.checked=released;
        updateToggle();
      };
      const toggleSolutions=button("Alle Lösungen zeigen",toggleRelease),mobileToggleSolutions=button("Alle Lösungen zeigen",toggleRelease);
      function updateToggle(){
        const released=draft.length&&draft.every(entry=>entry.solution_released);
        for(const control of [toggleSolutions,mobileToggleSolutions]){
          control.disabled=!draft.length;
          control.textContent=t(released?"Alle Lösungen verbergen":"Alle Lösungen zeigen");
          control.title=t(released?"Alle Lösungen für Lernende sperren":"Alle Lösungen für Lernende freigeben");
        }
      }
      draft.forEach((entry,index) => {
        const wrapper=element("section",undefined,"learn-task-card"),bar=element("div",undefined,"learn-task-bar");
        const toggle=button("",()=>{
          const opening=expandedEntry!==entry;
          expandedEntry=opening?entry:null;
          for(const row of content.querySelectorAll(".learn-task-card")){
            const open=row===wrapper&&opening;
            row.querySelector(".learn-task-editor").hidden=!open;
            row.querySelector(".learn-task-toggle").setAttribute("aria-expanded",String(open));
          }
          if(opening){editor.querySelectorAll(".learn-description-field textarea").forEach(fitDescription);reveal(bar);}
        });
        toggle.className="learn-task-toggle";toggle.setAttribute("aria-expanded",String(expandedEntry===entry));
        const editor=element("div",undefined,"learn-task-editor");editor.hidden=expandedEntry!==entry;editor.id=`learn-task-editor-${index}`;toggle.setAttribute("aria-controls",editor.id);
        const number=element("span",String(index+1).padStart(2,"0"),"learn-task-number"),caption=element("span",undefined,"learn-task-caption"),taskTitle=element("strong"),preview=element("span",undefined,"learn-task-preview"),badge=element("span",undefined,"learn-task-level");
        function updateCaption(){taskTitle.textContent=localized(entry,"title")||t("Neue Aufgabe");toggle.title=taskTitle.textContent;toggle.setAttribute("aria-label",t(`Aufgabe bearbeiten: ${taskTitle.textContent}`));preview.textContent=(localized(entry,"description")||t("Beschreibung hinzufügen")).replaceAll("`","");preview.title=preview.textContent;badge.textContent=t(entry.level||"Ohne Niveau");wrapper.classList.toggle("is-hidden",entry.visible===false);}
        updateCaption();caption.append(taskTitle,preview);toggle.append(number,caption,badge);bar.append(toggle);
        const card = element("div", undefined, "learn-edit-row");
        const titleLabel = element("label", `Titel (DE) ${index+1}`), title = element("input");
        title.value = entry.title; title.maxLength = 100; title.addEventListener("input",()=>{entry.title=title.value;updateCaption();}); titleLabel.append(title);
        const descriptionLabel = element("label", `Beschreibung (DE) ${index+1}`,"learn-description-field"), description = element("textarea");
        description.value = entry.description; description.maxLength = 2000; description.rows = 1;
        description.addEventListener("input",()=>{entry.description=description.value;fitDescription(description);updateCaption();}); descriptionLabel.append(description);
        const levelLabel = element("label", "Niveau","learn-level-field"), level = element("select");
        level.setAttribute("aria-label",t("Niveau"));
        const normalizeLevel=value=>levelAliases.get(value)||value||"";
        const choices=new Set(["Grundlagen","Aufbau","Fortgeschritten","Experten",...entries.map(task=>normalizeLevel(task.level)),...draft.map(task=>normalizeLevel(task.level))]);
        if(!entry.level)choices.add("");
        for(const value of choices){const option=element("option",value||"Ohne Niveau");option.value=value;level.append(option);}
        let customValue="__custom__";while(choices.has(customValue))customValue+="_";
        const customOption=element("option","Eigenes Niveau …");customOption.value=customValue;level.append(customOption);level.value=normalizeLevel(entry.level);
        const customLevel=element("input");customLevel.hidden=true;customLevel.maxLength=60;customLevel.setAttribute("aria-label",t("Eigenes Niveau"));customLevel.placeholder=t("Eigenes Niveau");
        customLevel.addEventListener("input",()=>{entry.level=customLevel.value;updateCaption();});
        level.addEventListener("change",()=>{customLevel.hidden=level.value!==customValue;if(customLevel.hidden){entry.level=level.value;updateCaption();}else customLevel.focus();});levelLabel.append(level,customLevel);
        const actions = element("div", undefined, "learn-row-actions");
        const visibleLabel=element("label",undefined,"learn-visible"),visible=element("input");visible.type="checkbox";visible.checked=entry.visible!==false;
        visible.addEventListener("change",()=>{entry.visible=visible.checked;updateCaption();});
        visibleLabel.append(visible,document.createTextNode(t("Sichtbar")));actions.append(visibleLabel);
        function move(target,selector){[draft[target],draft[index]]=[draft[index],draft[target]];draw();const moved=content.querySelectorAll(".learn-task-card")[target],control=moved.querySelector(selector);(control.disabled?moved.querySelector(".learn-task-toggle"):control).focus({preventScroll:true});reveal(moved.querySelector(".learn-task-bar"));}
        const up = button("↑",()=>move(index-1,".learn-task-up"));up.className="learn-task-up"; up.disabled = index === 0; up.setAttribute("aria-label",`Move task ${index+1} up`);
        const down = button("↓",()=>move(index+1,".learn-task-down"));down.className="learn-task-down"; down.disabled=index===draft.length-1; down.setAttribute("aria-label",`Move task ${index+1} down`);
        actions.append(up,down,button("Delete",()=>{
          if(window.confirm(`Delete task "${entry.title || `Task ${index+1}`}"?`)){draft.splice(index,1);draw();const rows=[...content.querySelectorAll(".learn-task-card")].filter(row=>!row.hidden),next=rows[Math.min(index,rows.length-1)];if(next){next.querySelector(".learn-task-toggle").focus({preventScroll:true});reveal(next.querySelector(".learn-task-bar"));}else content.querySelector("input[type=search]").focus();}
        }));
        const englishTitleLabel=element("label",`Titel (EN) ${index+1}`),englishTitle=element("input");
        englishTitle.value=entry.title_en || "";englishTitle.maxLength=100;englishTitle.addEventListener("input",()=>{entry.title_en=englishTitle.value;updateCaption();});englishTitleLabel.append(englishTitle);
        const englishDescriptionLabel=element("label",`Beschreibung (EN) ${index+1}`,"learn-description-field"),englishDescription=element("textarea");
        englishDescription.value=entry.description_en || "";englishDescription.maxLength=2000;englishDescription.rows=1;englishDescription.addEventListener("input",()=>{entry.description_en=englishDescription.value;fitDescription(englishDescription);updateCaption();});englishDescriptionLabel.append(englishDescription);
        card.append(titleLabel,englishTitleLabel,descriptionLabel,englishDescriptionLabel,levelLabel);editor.append(card);wrapper.append(bar,editor);content.append(wrapper);
        const details=element("details",undefined,"learn-solution-editor"), summary=element("summary",`${languageName()}-Lösung bearbeiten`);
        const solutionLabel=element("label",`${languageName()}-Lösung (DE) ${index+1}`), solution=element("textarea");
        solution.value=entry.solution || ""; solution.rows=6; solution.maxLength=20000; solution.spellcheck=false; solution.className="learn-solution-code";
        solution.addEventListener("input",()=>entry.solution=solution.value); solutionLabel.append(solution);
        const releaseLabel=element("label",undefined,"learn-release"), release=element("input"); release.type="checkbox"; release.checked=!!entry.solution_released;
        release.addEventListener("change",()=>{entry.solution_released=release.checked;updateToggle();});
        releaseLabel.title=t("Lösung für Lernende freigeben");
        releaseLabel.append(release,element("span","Lösung frei"));release.setAttribute("aria-label",t("Lösung für Lernende freigeben"));
        const englishSolutionLabel=element("label",`${languageName()}-Lösung (EN) ${index+1}`),englishSolution=element("textarea");
        englishSolution.value=entry.solution_en || "";englishSolution.rows=6;englishSolution.maxLength=20000;englishSolution.spellcheck=false;englishSolution.className="learn-solution-code";englishSolution.addEventListener("input",()=>entry.solution_en=englishSolution.value);englishSolutionLabel.append(englishSolution);
        const solutionControls=element("div",undefined,"learn-solution-controls");
        details.append(summary,solutionLabel,englishSolutionLabel);solutionControls.append(details);card.append(solutionControls);
        actions.insertBefore(releaseLabel,up);bar.append(actions);
        if(!editor.hidden)editor.querySelectorAll(".learn-description-field textarea").forEach(fitDescription);
      });
      const save = button("Save changes",async()=>{
        let index=0;
        const merged=entries.flatMap(entry=>belongs(entry)?(index<draft.length?[draft[index++]]:[]):[entry]);
        merged.push(...draft.slice(index));
        await api("/api/learn","PUT",{version,entries:merged}); await load(); message.textContent="Tasks saved.";
      }); save.className="primary";
      const openUsers=()=>{
        if(JSON.stringify(draft)!==originalDraft&&!window.confirm(t("Ungespeicherte Aufgabenänderungen verwerfen?")))return;
        languageSelect.disabled=true;return usersAdmin.overview();
      };
      const add=button("Add task",()=>{
        const entry={title:"",description:"",level:"Grundlagen",language};draft.push(entry);expandedEntry=entry;filterText="";draw();
        const added=content.lastElementChild;
        added.scrollIntoView({block:"start"});dialog.scrollTop-=dialog.querySelector(".learn-heading").offsetHeight;added.querySelector(".learn-task-editor input").focus({preventScroll:true});
      });
      function compactLabel(control,full,short){control.setAttribute("aria-label",t(full));control.textContent="";control.append(element("span",full,"learn-desktop-label"),element("span",short,"learn-compact-label"));}
      compactLabel(add,"Add task","+ Aufgabe");compactLabel(save,"Save changes","Speichern");
      const users=button("Benutzer verwalten",openUsers),cancel=button("Cancel",load),logout=button("Sign out",load);
      for(const control of [users,toggleSolutions,cancel,logout])control.classList.add("learn-secondary-action");
      const more=button("⋯",()=>{}),menu=element("div",undefined,"learn-task-menu");more.className="learn-task-more";more.title=t("Weitere Aktionen");more.setAttribute("aria-label",t("Weitere Aktionen"));more.setAttribute("popovertarget","learnTaskMenu");menu.id="learnTaskMenu";menu.setAttribute("popover","auto");menu.setAttribute("role","group");menu.setAttribute("aria-label",t("Weitere Aktionen"));
      menu.append(button("Benutzer verwalten",openUsers),mobileToggleSolutions,button("Cancel",load),button("Sign out",load));
      menu.addEventListener("beforetoggle",event=>{if(event.newState==="open"){const rect=more.getBoundingClientRect();menu.style.top=`${rect.bottom+8}px`;menu.style.left=`${Math.max(12,Math.min(rect.right-250,innerWidth-262))}px`;}});
      menu.addEventListener("click",event=>{if(event.target.closest("button")&&menu.matches(":popover-open"))menu.hidePopover();});
      adminActions.replaceChildren(users,add,toggleSolutions,save,cancel,logout,more,menu);
      updateToggle();
      applyFilter();
    }
    draw();
    dialog.scrollTop=0;
  }
  manage.addEventListener("click",()=>perform(async()=>{
    if (local) throw new Error("Task editing is available on the published website.");
    await api("/api/admin/logout", "POST", {});
    if (dialog.open) login();
  }));
  languageSelect.addEventListener("change",()=>{language=languageSelect.value;if(!busy)perform(()=>viewMode==="results"?resultsList():list());});
  onLocaleChange(()=>{updateChallengeBar();if(!dialog.open)return;if(viewMode==="solution")drawSolution();else if(!languageSelect.disabled){viewMode==="results"?resultsList():list();}});
  document.querySelector("#learnButton").addEventListener("click",()=>{generation++;language=getLanguage();languageSelect.value=language;dialog.showModal();perform(load);});
  document.querySelector("#learnClose").addEventListener("click",()=>dialog.close());
  let backdrop=false;
  const outside=event=>{const box=dialog.getBoundingClientRect();return event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom;};
  dialog.addEventListener("pointerdown",event=>{backdrop=event.target===dialog && outside(event);});
  dialog.addEventListener("click",event=>{if(backdrop&&event.target===dialog&&outside(event))dialog.close();backdrop=false;});
  document.querySelector("#challengeSave").addEventListener("click",()=>outsideAction(saveResult));
  document.querySelector("#challengeNext").addEventListener("click",()=>outsideAction(()=>{const next=nextChallenge();if(next)startChallenge(next);}));
  document.querySelector("#challengeLearn").addEventListener("click",()=>document.querySelector("#learnButton").click());
  dialog.addEventListener("close",()=>{
    generation++; content.replaceChildren(); adminActions.replaceChildren(); entries=[];
    if (!local) api("/api/admin/logout", "POST", {}).catch(()=>{});
  });
  window.addEventListener("pagehide",()=>{if (!local) api("/api/admin/logout", "POST", {}).catch(()=>{});});
}
