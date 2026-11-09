const {expandLevels}=require('./learn-ui.cjs');
const {chromium}=require("playwright"),assert=require("node:assert/strict");
const {spawn}=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const root=path.resolve(__dirname,".."),key="pyjs.learn.results.v1";
async function main(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"pyjs-files-test-"));let browser,server;
 try{
  server=spawn(process.env.PYTHON||"python",["-u","-c","import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()",path.join(temporary,"learn.sqlite3"),root],{cwd:root});server.stderr.on("data",()=>{});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Server did not start")),15000);server.once("error",reject);server.stdout.once("data",data=>{clearTimeout(timer);resolve(Number(data.toString().trim()));});});const url=`http://127.0.0.1:${port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(url);await page.locator(".cm-editor").waitFor();
  const fixtures=[
   {id:"python-1",challengeId:"hello",language:"python",title:"Hello Python",description:"Test",filename:"hello.py",code:'print("ÄÖÜ")',output:"ÄÖÜ\n",savedAt:"2026-10-11T08:00:00.000Z",runStatus:"Done"},
   {id:"js-1",challengeId:"js-hello",language:"javascript",title:"Hello JavaScript",description:"Test",filename:"hello.js",code:'window.__importExecuted = true;',output:"JS saved\n",savedAt:"2026-10-11T09:00:00.000Z",runStatus:"Not run"},
  ];
  await page.evaluate(({key,results})=>localStorage.setItem(key,JSON.stringify({version:1,results})),{key,results:fixtures});
  await page.locator("#saveButton").click();let downloaded=page.waitForEvent("download");await page.getByRole("button",{name:"Alle Lösungen speichern",exact:true}).click();const download=await downloaded;assert(/^pyjs-solutions-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()));
  const text=fs.readFileSync(await download.path(),"utf8"),backup=JSON.parse(text);assert.equal(backup.format,"pyjs-learn-results");assert.equal(backup.version,1);assert.deepEqual(backup.results,fixtures);
  await page.locator("#openButton").click();let chooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Datei laden",exact:true}).click();await (await chooser).setFiles({name:"single.js",mimeType:"text/javascript",buffer:Buffer.from('console.log("Einzeldatei");')});await page.waitForFunction(()=>document.querySelector("#fileName").textContent==="single.js");assert.equal(await page.locator(".lang.active").textContent(),"JavaScript");
  await page.locator("#saveButton").click();downloaded=page.waitForEvent("download");await page.getByRole("button",{name:"Aktuelle Datei speichern",exact:true}).click();const single=await downloaded;assert.equal(single.suggestedFilename(),"single.js");assert.equal(fs.readFileSync(await single.path(),"utf8"),'console.log("Einzeldatei");');
  await page.evaluate(key=>localStorage.removeItem(key),key);
  async function loadBackup(value){
   if(!await page.locator("#fileActionsDialog").isVisible())await page.locator("#openButton").click();
   const chooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Lösungen laden",exact:true}).click();await (await chooser).setFiles({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(typeof value==="string"?value:JSON.stringify(value))});await page.waitForFunction(()=>!!document.querySelector("#fileActionsMessage").textContent);return page.locator("#fileActionsMessage").textContent();
  }
  assert((await loadBackup(text)).startsWith("2 Ergebnisse geladen; 0"));assert.equal(await page.evaluate(()=>window.__importExecuted),undefined);assert((await page.locator(".cm-content").innerText()).includes("Einzeldatei"));
  assert((await loadBackup(text)).startsWith("0 Ergebnisse geladen; 2"));
  const collision={...fixtures[0],code:"print('Andere Version')",savedAt:"2026-10-11T10:00:00.000Z"};assert((await loadBackup({...backup,results:[collision]})).startsWith("1 Ergebnisse geladen"));assert((await loadBackup({...backup,results:[collision]})).startsWith("0 Ergebnisse geladen; 1"));
  const stored=await page.evaluate(key=>localStorage.getItem(key),key);assert.equal(JSON.parse(stored).results.length,3);assert.equal(new Set(JSON.parse(stored).results.map(r=>r.id)).size,3);
  for(const malformed of ["broken JSON",{...backup,version:999},{...backup,results:[fixtures[0],{...fixtures[1],language:"ruby"}]},{...backup,results:[{...fixtures[0],savedAt:"invalid"}]}]){await loadBackup(malformed);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),stored);}
  await page.locator("#fileActionsClose").click();await page.locator("#learnButton").click();await expandLevels(page);await page.getByRole("button",{name:"Ansehen (1)",exact:true}).waitFor();await page.locator("#learnLanguage").selectOption("python");await expandLevels(page);await page.getByRole("button",{name:"Ansehen (2)",exact:true}).waitFor();await page.locator("#learnClose").click();
  await page.locator("#saveButton").click();await page.keyboard.press("Escape");assert.equal(await page.locator("#fileActionsDialog").isVisible(),false);await page.locator("#openButton").click();await page.mouse.click(1,1);await page.locator("#fileActionsDialog").waitFor({state:"hidden"});
  await page.setViewportSize({width:390,height:844});await page.locator("#saveButton").click();assert.equal(await page.locator("#fileActionsDialog").evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.deepEqual(errors,[]);
  console.log("PASS: Save/Load choices, JSON export, restore/merge/dedup/collisions, invalid imports atomic, code never executed, individual JS file, Learn retrieval, Escape/backdrop/mobile.");
 }finally{if(browser)await browser.close();if(server&&server.exitCode===null){const ended=new Promise(resolve=>server.once("exit",resolve));server.kill();await ended;}if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith("pyjs-files-test-"))fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
