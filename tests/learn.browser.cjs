const {expandLevels}=require('./learn-ui.cjs');
// Real browser/server test: password required every time the task editor opens.
const {chromium} = require("playwright");
const {spawn} = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "pyjs-learn-test-"));
  let server, browser;
  try {
    server = spawn(process.env.PYTHON || "python", ["-u", "-c", "import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()", path.join(temporary,"learn.sqlite3"),root], {cwd:root});
    server.stderr.on("data",()=>{});
    const port = await new Promise((resolve,reject)=>{
      const timer = setTimeout(()=>reject(new Error("Learn test server did not start")),15000);
      server.once("error",error=>{clearTimeout(timer);reject(error);});
      server.stdout.once("data",data=>{clearTimeout(timer);resolve(Number(data.toString().trim()));});
    });
    browser = await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
    const page = await browser.newPage();
    const errors = []; page.on("pageerror",error=>errors.push(error.message));
    const url = `http://127.0.0.1:${port}`;
    const state = async()=> (await page.request.get(`${url}/api/learn`)).json();
    const locked = async()=>{
      await page.waitForFunction(async()=>!(await (await fetch("/api/admin/session")).json()).authenticated);
      assert.equal((await page.request.put(`${url}/api/learn`,{data:await state()})).status(),401);
    };
    async function open() {
      await page.getByRole("button",{name:"Lernen",exact:true}).click();await expandLevels(page);
      await page.getByRole("cell",{name:"Codebreaker",exact:true}).waitFor();
      assert(await page.getByRole("button",{name:"Aufgaben verwalten"}).evaluate(node=>!!node.closest(".learn-heading")));
    }
    async function manage() {
      await page.getByRole("button",{name:"Aufgaben verwalten"}).click();
      await page.getByLabel("Admin-Passwort").waitFor();
      assert.equal(await page.getByRole("button",{name:"Änderungen speichern"}).count(),0);
      await locked();
    }
    async function login() {
      await page.getByLabel("Admin-Passwort").fill("test-password");
      await page.getByRole("button",{name:"Anmelden",exact:true}).click();
      await page.getByRole("button",{name:"Änderungen speichern"}).waitFor();
      for(const name of ["Aufgabe hinzufügen","Änderungen speichern","Abbrechen","Abmelden"]){
        assert(await page.getByRole("button",{name,exact:true}).evaluate(node=>!!node.closest(".learn-heading")));
      }
    }
    await page.goto(url); await page.locator(".cm-editor").waitFor();
    await open(); const original = (await state()).entries;
    await manage();
    await page.getByLabel("Admin-Passwort").fill("wrong-password");
    await page.getByRole("button",{name:"Anmelden",exact:true}).click();
    await page.getByText("Falsches Passwort.").waitFor(); await locked();
    assert.equal(await page.getByRole("button",{name:"Änderungen speichern"}).count(),0);
    await login();
    assert.equal(await page.locator("#learnIntro").isVisible(),false);
    assert.equal(await page.getByText("Aufgaben bearbeiten, die Reihenfolge ändern und dann speichern.",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Alle Lösungen zeigen",exact:true}).click();
    assert(await page.locator(".learn-release input").evaluateAll(nodes=>nodes.every(node=>node.checked)));
    assert(await page.locator(".learn-solution-editor").evaluateAll(nodes=>nodes.every(node=>!node.open)));
    assert((await state()).entries.every(entry=>!entry.solution_available),"Bulk release must wait for Save changes");
    await page.getByRole("button",{name:"Änderungen speichern",exact:true}).click();
    await page.getByText("Aufgaben gespeichert.").waitFor();
    assert((await state()).entries.filter(entry=>entry.language==="python").every(entry=>entry.solution_available));
    assert((await state()).entries.filter(entry=>entry.language==="javascript").every(entry=>!entry.solution_available));
    await manage();await login();
    await page.getByRole("button",{name:"Alle Lösungen verbergen",exact:true}).click();
    assert(await page.locator(".learn-release input").evaluateAll(nodes=>nodes.every(node=>!node.checked)));
    assert(await page.locator(".learn-solution-editor").evaluateAll(nodes=>nodes.every(node=>!node.open)));
    await page.getByRole("button",{name:"Änderungen speichern",exact:true}).click();
    await page.getByText("Aufgaben gespeichert.").waitFor();
    assert((await state()).entries.every(entry=>!entry.solution_available));
    await manage();await login();
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:844});
      await page.locator("#learnDialog").evaluate(node=>node.scrollTop=node.scrollHeight);
      assert(await page.locator("#learnDialog>.learn-heading").evaluate(node=>{
        const header=node.getBoundingClientRect(),dialog=document.querySelector("#learnDialog").getBoundingClientRect();
        return Math.abs(header.top-dialog.top)<=2;
      }),"Sticky header must sit against the dialog's top edge without a gap");
      assert(await page.getByRole("button",{name:"Änderungen speichern",exact:true}).evaluate(node=>{
        const button=node.getBoundingClientRect(),dialog=document.querySelector("#learnDialog").getBoundingClientRect();
        return button.top>=dialog.top && button.bottom<=dialog.bottom;
      }),"Admin buttons must stay visible while scrolling on desktop and mobile");
    }
    await page.setViewportSize({width:1280,height:720});
    const count=await page.locator(".learn-edit-row").count();
    await page.getByRole("button",{name:"Aufgabe hinzufügen",exact:true}).click();
    assert(await page.getByLabel(`Titel (DE) ${count+1}`,{exact:true}).evaluate(node=>{
      const box=node.getBoundingClientRect(),dialog=document.querySelector("#learnDialog").getBoundingClientRect();
      return document.activeElement===node && box.top>=dialog.top && box.bottom<=dialog.bottom;
    }),"New task title must be focused and visible without manual scrolling");
    await page.getByLabel(`Titel (DE) ${count+1}`,{exact:true}).fill("Temporary challenge");
    const deleteLast=page.getByRole("button",{name:"Löschen",exact:true}).last();
    let confirmation=page.waitForEvent("dialog").then(async confirm=>{
      assert.equal(confirm.type(),"confirm");assert(confirm.message().includes("Temporary challenge"));await confirm.dismiss();
    });
    await deleteLast.click();await confirmation;
    assert.equal(await page.locator(".learn-edit-row").count(),count+1);
    confirmation=page.waitForEvent("dialog").then(confirm=>confirm.accept());await deleteLast.click();await confirmation;
    await page.waitForFunction(expected=>document.querySelectorAll(".learn-edit-row").length===expected,count);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator("#learnDialog").evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
    await page.setViewportSize({width:1280,height:720});
    await page.getByRole("button",{name:"Abbrechen",exact:true}).click();
    await page.getByRole("cell",{name:"Codebreaker",exact:true}).waitFor(); await locked();
    await manage(); await login(); await page.getByRole("button",{name:"Lernen schließen"}).click();
    await locked(); await open(); await manage(); await login();
    await page.keyboard.press("Escape"); await page.locator("#learnDialog").waitFor({state:"hidden"});
    await locked(); await open(); await manage(); await login();
    await page.getByRole("button",{name:"Änderungen speichern"}).click();
    await page.getByText("Aufgaben gespeichert.").waitFor(); await locked(); await manage();
    // A pre-existing valid cookie must never bypass the password dialog.
    assert.equal((await page.request.post(`${url}/api/admin/login`,{data:{password:"test-password"}})).status(),200);
    await page.getByRole("button",{name:"Zurück",exact:true}).click();
    await page.getByRole("cell",{name:"Codebreaker",exact:true}).waitFor();
    assert.equal((await page.request.post(`${url}/api/admin/login`,{data:{password:"test-password"}})).status(),200);
    await manage();
    // Closing during a login request must not leave a late authenticated session.
    await page.route("**/api/admin/login",async route=>{
      await new Promise(resolve=>setTimeout(resolve,150)); await route.continue();
    });
    await page.getByLabel("Admin-Passwort").fill("test-password");
    const pending = page.waitForResponse(response=>response.url().endsWith("/api/admin/login"));
    await page.getByRole("button",{name:"Anmelden",exact:true}).click();
    await page.getByRole("button",{name:"Lernen schließen"}).click();
    await pending; await locked(); await open(); await manage();
    assert.deepEqual((await state()).entries,original); assert.deepEqual(errors,[]);
    console.log("PASS: password every time, wrong password blocked, cancel/save/close/Escape logout, old session revoked, closing during login, anonymous writes rejected.");
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      const ended = new Promise(resolve=>server.once("exit",resolve)); server.kill(); await ended;
    }
    // Only remove the directory created by this test in the system temp directory.
    if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith("pyjs-learn-test-")) fs.rmSync(temporary,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
