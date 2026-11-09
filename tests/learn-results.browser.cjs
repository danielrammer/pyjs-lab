const {expandLevels}=require('./learn-ui.cjs');
// Actual editor/runtime workflow, durable browser results, privacy and backdrop close.
const {chromium}=require("playwright"),assert=require("node:assert/strict");
const {spawn}=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const root=path.resolve(__dirname,".."),key="pyjs.learn.results.v1";
async function main(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"pyjs-results-test-"));let browser,server;
 try{
  server=spawn(process.env.PYTHON||"python",["-u","-c","import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()",path.join(temporary,"learn.sqlite3"),root],{cwd:root});server.stderr.on("data",()=>{});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Server did not start")),15000);server.once("error",reject);server.stdout.once("data",data=>{clearTimeout(timer);resolve(Number(data.toString().trim()));});});const url=`http://127.0.0.1:${port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const stored=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.results || [],key);
  const rows=()=>page.locator(".learn-level-tasks tr");
  async function open(){await page.locator("#learnButton").click();await expandLevels(page);await rows().first().waitFor();}
  async function code(source){await page.locator(".cm-content").click();await page.keyboard.press("Control+A");await page.keyboard.insertText(source);}
  async function run(source){await code(source);await page.locator("#runButton").click();await page.waitForFunction(()=>["Done","Error"].includes(document.querySelector("#status").dataset.state),null,{timeout:180000});assert.equal(await page.locator("#status").getAttribute("data-state"),"Done");}
  async function save(){await page.locator("#challengeSave").click();assert.equal(await page.locator("#challengeMessage").textContent(),"Im Browser gespeichert.");}
  await page.goto(url);await page.locator(".cm-editor").waitFor();const original=await (await page.request.get(url+"/api/learn")).json();
  for(const language of ["python","javascript"]){
    await open();await page.locator("#learnLanguage").selectOption(language);await expandLevels(page);
    await rows().filter({has:page.getByRole("cell",{name:"Codebreaker",exact:true})}).getByRole("button",{name:"Aufgabe starten",exact:true}).click();
    const source=await page.locator(".cm-content").innerText(),prefix=language==="python"?"#":"//";
    const lines=source.split("\n").filter(line=>line.startsWith(prefix));
    assert(lines.length>8,"Long instructions must use multiple comment lines");
    assert(lines.every(line=>line.startsWith(prefix)&&line.length<=76));
    const description=original.entries.find(row=>row.id===(language==="python"?"codebreaker":"js-codebreaker")).description;
    assert.equal(lines.slice(1).map(line=>line.slice(prefix.length).trim()).join(" "),description);
    if(language==="python")assert(source.includes("import random"));
    await code(prefix+" Starter checked");
  }
  await open();assert((await page.locator("#learnDialog").boundingBox()).width>1000);
  await page.locator("#learnLanguage").selectOption("python");await expandLevels(page);
  assert.equal(await page.getByRole("columnheader",{name:"Meine Ergebnisse",exact:true}).count(),1);assert.equal(await page.locator("#learnTabs").count(),0);
  await rows().first().getByRole("button",{name:"Aufgabe starten",exact:true}).click();assert.equal(await page.locator("#learnDialog").isVisible(),false);
  assert((await page.locator("#challengeTitle").textContent()).includes("Hello Python"));assert((await page.locator(".cm-content").innerText()).includes("Gib mit `print()`"));
  await run('print("Mein Ergebnis")');await save();let results=await stored();assert.equal(results.length,1);assert.equal(results[0].challengeId,"hello");assert.equal(results[0].code,'print("Mein Ergebnis")');assert.equal(results[0].output,"Mein Ergebnis\n");assert.equal(results[0].runStatus,"Done");
  await page.locator("#challengeNext").click();assert((await page.locator("#challengeTitle").textContent()).includes("About Me"));
  await run('print("About Me gespeichert")');await save();
  await open();await rows().first().getByRole("button",{name:"Ansehen (1)",exact:true}).click();assert.equal(await page.locator("pre.learn-solution-code").first().textContent(),'print("Mein Ergebnis")');assert.equal(await page.locator("pre.learn-solution-code").last().textContent(),"Mein Ergebnis\n");assert((await page.locator(".cm-content").innerText()).includes("About Me gespeichert"),"Viewing a result must preserve the current editor");
  await page.getByRole("button",{name:"Im Editor öffnen",exact:true}).click();assert.equal(await page.locator("#output").textContent(),"Mein Ergebnis\n");
  await code('print("Neue Version noch nicht ausgeführt")');await save();results=await stored();assert.equal(results.filter(r=>r.challengeId==="hello").length,2);assert.equal(results[0].output,"");assert.equal(results[0].runStatus,"Not run");
  await page.reload();await page.locator(".cm-editor").waitFor();assert.equal(await page.locator("#challengeBar").isVisible(),false);
  await open();await rows().first().getByRole("button",{name:"Ansehen (2)",exact:true}).click();assert.equal(await page.locator("pre.learn-solution-code").first().textContent(),'print("Neue Version noch nicht ausgeführt")');assert.equal(await page.getByRole("button",{name:"Ansehen",exact:true}).count(),0);
  await page.getByRole("button",{name:"Zurück zur Übersicht",exact:true}).click();assert.equal(await rows().first().getByRole("button",{name:"Ansehen (2)",exact:true}).count(),1);assert.equal(await page.locator("#learnLanguage").isEnabled(),true);
  await page.getByRole("button",{name:"Alle Ergebnisse",exact:true}).click();assert.equal(await page.getByRole("button",{name:"Ansehen",exact:true}).count(),3);
  await page.getByRole("button",{name:"Ansehen",exact:true}).last().click();assert.equal(await page.locator("pre.learn-solution-code").first().textContent(),'print("Mein Ergebnis")');await page.getByRole("button",{name:"Zurück zur Übersicht",exact:true}).click();
  await rows().first().getByRole("button",{name:"Ansehen (2)",exact:true}).click();await page.getByRole("button",{name:"Im Editor öffnen",exact:true}).click();assert((await page.locator(".cm-content").innerText()).includes("Neue Version"));
  await open();await page.locator("#learnLanguage").selectOption("javascript");await expandLevels(page);await rows().first().getByRole("button",{name:"Aufgabe starten",exact:true}).click();assert((await page.locator("#challengeTitle").textContent()).includes("Hello JavaScript"));
  await run('console.log("JS gespeichert");');await save();results=await stored();assert.equal(results[0].language,"javascript");assert.equal(results[0].output,"JS gespeichert\n");
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException("Full","QuotaExceededError");};});
  const count=results.length;await page.locator("#challengeSave").click();assert((await page.locator("#challengeMessage").textContent()).includes("Speichern im Browser fehlgeschlagen"));assert.equal((await stored()).length,count);assert((await page.locator(".cm-content").innerText()).includes("JS gespeichert"));await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});
  await open();assert.equal(await rows().first().getByRole("button",{name:"Ansehen (1)",exact:true}).count(),1);
  await rows().first().getByRole("button",{name:"Ansehen (1)",exact:true}).click();assert.equal(await page.locator("pre.learn-solution-code").first().textContent(),'console.log("JS gespeichert");');
  let confirmation=page.waitForEvent("dialog").then(d=>d.dismiss());await page.getByRole("button",{name:"Ergebnis löschen",exact:true}).click();await confirmation;assert.equal((await stored()).length,count);
  confirmation=page.waitForEvent("dialog").then(d=>d.accept());await page.getByRole("button",{name:"Ergebnis löschen",exact:true}).click();await confirmation;assert.equal((await stored()).length,count-1);assert.equal((await stored()).filter(r=>r.language==="python").length,3);
  await page.getByRole("button",{name:"Zurück zu den Aufgaben",exact:true}).click();await rows().first().waitFor();await rows().first().locator("td").nth(2).click();assert(await page.locator("#learnDialog").isVisible());
  await page.mouse.click(1,1);await page.locator("#learnDialog").waitFor({state:"hidden"});
  await open();await page.locator("#learnManage").click();await page.getByLabel("Admin-Passwort").fill("test-password");await page.getByRole("button",{name:"Anmelden",exact:true}).click();await page.getByRole("button",{name:"Änderungen speichern",exact:true}).waitFor();await page.mouse.click(1,1);await page.locator("#learnDialog").waitFor({state:"hidden"});await page.waitForFunction(async()=>!(await (await fetch("/api/admin/session")).json()).authenticated);
  assert.deepEqual(await (await page.request.get(url+"/api/learn")).json(),original);
  const persisted=await context.storageState();const restored=await browser.newContext({storageState:persisted});const restoredPage=await restored.newPage();await restoredPage.goto(url);await restoredPage.locator("#learnButton").click();await expandLevels(restoredPage);await restoredPage.getByRole("button",{name:"Ansehen (2)",exact:true}).waitFor();await restored.close();
  const separate=await browser.newContext();const separatePage=await separate.newPage();await separatePage.goto(url);assert.equal(await separatePage.evaluate(key=>localStorage.getItem(key),key),null);await separate.close();
  await open();await page.locator("#learnLanguage").selectOption("python");await expandLevels(page);if(process.env.SCREENSHOT)await page.screenshot({path:process.env.SCREENSHOT});await page.setViewportSize({width:390,height:844});assert.equal(await page.locator("#learnDialog").evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  assert.deepEqual(errors,[]);console.log("PASS: start/run/save/next, Python/JS, version history, reload/browser persistence, output matching, quota failure, delete confirmation, isolation, wider Learn and backdrop/logout.");
 }finally{if(browser)await browser.close();if(server&&server.exitCode===null){const ended=new Promise(resolve=>server.once("exit",resolve));server.kill();await ended;}if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith("pyjs-results-test-"))fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
