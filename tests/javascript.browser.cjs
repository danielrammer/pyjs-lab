const {expandLevels}=require('./learn-ui.cjs');
// Real PYJS: JS Learn solutions, independent releases, graphics and pane resizing.
const {chromium}=require("playwright"),assert=require("node:assert/strict");
const {spawn}=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const root=path.resolve(__dirname,".."),catalog=JSON.parse(fs.readFileSync(path.join(root,"learn-solutions.json"),"utf8"));
async function main(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"pyjs-javascript-test-"));let browser,server;
 try{
  let url=process.env.BASE_URL;
  if(!url){
   server=spawn(process.env.PYTHON||"python",["-u","-c","import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()",path.join(temporary,"learn.sqlite3"),root],{cwd:root});
   server.stderr.on("data",()=>{});
   const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Server did not start")),15000);server.once("error",reject);server.stdout.once("data",data=>{clearTimeout(timer);resolve(Number(data.toString().trim()));});});url=`http://127.0.0.1:${port}`;
  }
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];let answers=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("dialog",async dialog=>{if(dialog.type()!=="prompt"||!answers.length){errors.push("Unexpected dialog: "+dialog.message());await dialog.dismiss();return;}const answer=answers.shift();answer===null?await dialog.dismiss():await dialog.accept(answer);});
  await page.goto(url);await page.locator(".cm-editor").waitFor();await page.getByRole("button",{name:"JavaScript",exact:true}).click();
  await page.evaluate(()=>{Math.random=()=>0.41;});
  async function run(code,replies=[],expected=[]){
   answers=[...replies];await page.locator(".cm-content").click();await page.keyboard.press("Control+A");await page.keyboard.insertText(code);await page.locator("#runButton").click();
   await page.waitForFunction(()=>["Done","Error"].includes(document.querySelector("#status").dataset.state));
   const output=await page.locator("#output").innerText();assert.equal(await page.locator("#status").getAttribute("data-state"),"Done",output);assert.equal(answers.length,0);
   for(const text of expected)assert(output.includes(text),`Missing ${text}: ${output}`);
  }
  const cases=[
   ["hello",[],["Ich lerne JavaScript.","42"]],["about",[],["Name: Alex","Alter: 16","Hobby: Musik"]],
   ["score",[],["Punkte: 12"]],["calculator",[],["Summe: 16","Differenz: 8","Produkt: 48"]],
   ["level",["12"],["LEVEL UP"]],["password",["javascript123"],["ZUGANG ERLAUBT"]],
   ["countdown",[],["10\n9\n8\n7\n6\n5\n4\n3\n2\n1"]],["even",["12"],["Die Zahl ist gerade."]],
   ["grades",["90"],["Note 1"]],["guessing",["abc","1","100","42"],["Bitte eine ganze Zahl","ZU NIEDRIG","ZU HOCH","RICHTIG"]],
   ["function",[],["10\n24"]],["codebreaker",["abc","1123","2534","4352"],["Bitte genau 4 Ziffern","Keine Ziffer darf doppelt vorkommen.","Richtige Ziffer, falsche Position: 4","CODE GEKNACKT!"]],
  ];
  assert.equal(cases.length,Object.keys(catalog).filter(id=>id.startsWith("js-")&&!id.startsWith("js-basics-")&&!["shapes","drag-circles","rotate-rectangle","bouncing-ball","framerate","collision"].includes(id.slice(3))).length);
  for(const [id,replies,expected]of cases){await run(catalog["js-"+id],replies,expected);console.log("PASS JS solution: "+id);}
  for(const [value,message] of [["9","TRY AGAIN"],["10","LEVEL UP"],["-1","Punkte dürfen nicht negativ sein."],["abc","Bitte eine ganze Zahl eingeben."]])await run(catalog["js-level"],[value],[message]);
  await run(catalog["js-password"],["wrong"],["ZUGANG VERWEIGERT"]);
  await run(catalog["js-even"],["-3"],["ungerade"]);await run(catalog["js-even"],["abc"],["Bitte eine ganze Zahl"]);
  for(const [points,grade]of [[80,2],[65,3],[50,4],[0,5]])await run(catalog["js-grades"],[String(points)],["Note "+grade]);
  await run(catalog["js-grades"],["101"],["Bitte Punkte zwischen"]);
  await run(catalog["js-codebreaker"],Array(10).fill("0123"),["Verloren! Der Code war: 4352"]);
  await page.evaluate(()=>{Math.random=()=>0;});
  await run(catalog["js-codebreaker"],["0231","0123"],["Tipp: 0231","Richtige Position: 1","Richtige Ziffer, falsche Position: 3","CODE GEKNACKT!"]);
  await page.evaluate(()=>{let i=0;const values=[.41,.23,.65,.15];Math.random=()=>values[i++%4];});
  await run(catalog["js-codebreaker"],["1234","4271"],["Tipp: 1234","Richtige Position: 1","Richtige Ziffer, falsche Position: 2","CODE GEKNACKT!"]);
  await page.evaluate(()=>{Math.random=()=>.41;});
  for(const id of ["password","even","grades","guessing","codebreaker"])await run(catalog["js-"+id],[null],["Abgebrochen."]);
  await page.locator("#learnButton").click();await expandLevels(page);await page.getByRole("cell",{name:"Hello JavaScript",exact:true}).waitFor();
  assert.equal(await page.locator("#learnLanguage").inputValue(),"javascript");assert((await page.locator("#learnIntro").textContent()).includes("JavaScript"));
  assert.equal(await page.getByRole("button",{name:"Lösung gesperrt",exact:true}).count(),41);
  assert((await page.locator(".learn-table").textContent()).includes("console.log()"));assert(!(await page.locator(".learn-table").textContent()).includes("range()"));
  if(!process.env.BASE_URL){
   const original=await (await page.request.get(url+"/api/learn")).json();
   async function login(){await page.locator("#learnManage").click();await page.getByLabel("Admin-Passwort").fill("test-password");await page.getByRole("button",{name:"Anmelden",exact:true}).click();await page.getByRole("button",{name:"Änderungen speichern",exact:true}).waitFor();}
   await login();assert.equal(await page.locator(".learn-edit-row").count(),41);assert(await page.locator("#learnLanguage").isDisabled());
   await page.locator(".learn-task-toggle").first().click();await page.locator(".learn-solution-editor summary").first().click();assert.equal(await page.getByLabel("JavaScript-Lösung (DE) 1",{exact:true}).inputValue(),catalog["js-hello"]);
   await page.getByLabel("Lösung für Lernende freigeben",{exact:true}).first().check();await page.getByRole("button",{name:"Änderungen speichern",exact:true}).click();await page.getByText("Aufgaben gespeichert.").waitFor();
   const saved=await (await page.request.get(url+"/api/learn")).json();assert.deepEqual(saved.entries.filter(e=>e.language==="python"),original.entries.filter(e=>e.language==="python"));
   await page.getByRole("button",{name:"Lösung ansehen",exact:true}).click();assert.equal(await page.locator("pre.learn-solution-code").textContent(),catalog["js-hello"]);
   await page.getByRole("button",{name:"Zurück zu den Aufgaben",exact:true}).click();await page.getByRole("cell",{name:"Hello JavaScript",exact:true}).waitFor();
   await login();await page.locator(".learn-task-toggle").first().click();await page.locator(".learn-solution-editor summary").first().click();await page.getByLabel("Lösung für Lernende freigeben",{exact:true}).first().uncheck();await page.getByRole("button",{name:"Änderungen speichern",exact:true}).click();await page.getByText("Aufgaben gespeichert.").waitFor();
   assert.equal((await page.request.get(url+"/api/learn/js-hello/solution")).status(),403);
  }
  await page.locator("#learnLanguage").selectOption("python");await expandLevels(page);await page.getByRole("cell",{name:"Hello Python",exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Lösung gesperrt",exact:true}).count(),41);
  await page.locator("#learnClose").click();
  const divider=page.locator("#paneDivider");let box=await divider.boundingBox(),before=await page.locator("#editorPanel").boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+100);await page.mouse.down();await page.mouse.move(box.x-180,box.y+100,{steps:5});await page.mouse.up();
  assert((await page.locator("#editorPanel").boundingBox()).width<before.width-100);assert.equal(await page.locator(".resizing-panes").count(),0);
  await divider.focus();await page.keyboard.press("ArrowRight");assert(Number(await divider.getAttribute("aria-valuenow"))>40);
  await divider.dblclick();assert.equal(await divider.getAttribute("aria-valuenow"),"60");
  await page.locator("#graphicsTab").click();await page.locator("#graphicsExample").click();assert((await page.locator(".cm-content").innerText()).includes("graphics.plot"));
  await page.locator("#runButton").click();await page.waitForFunction(()=>document.querySelector("#status").dataset.state==="Done");
  assert.equal(await page.locator(".figure-card").count(),1);const image=page.locator(".figure-image");let source=await image.getAttribute("src");
  await page.getByRole("slider",{name:"Amplitude",exact:true}).focus();await page.keyboard.press("ArrowRight");assert.notEqual(await image.getAttribute("src"),source);
  await page.getByRole("button",{name:"Amplitude zurücksetzen",exact:true}).click();assert.equal(await page.getByRole("slider",{name:"Amplitude",exact:true}).inputValue(),"1");
  await image.evaluate(e=>e.decode());box=await page.locator(".figure-area").boundingBox();source=await image.getAttribute("src");
  await page.getByRole("button",{name:"Zoom",exact:true}).click();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:4});await page.mouse.up();assert.notEqual(await image.getAttribute("src"),source);
  await page.getByRole("button",{name:"Zurück",exact:true}).click();assert.equal(await image.getAttribute("src"),source);
  await page.getByRole("button",{name:"Vorwärts",exact:true}).click();assert.notEqual(await image.getAttribute("src"),source);
  await page.getByRole("button",{name:"Zurücksetzen",exact:true}).click();await page.getByRole("button",{name:"Verschieben",exact:true}).click();source=await image.getAttribute("src");
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4,{steps:4});await page.mouse.up();assert.notEqual(await image.getAttribute("src"),source);
  let download=page.waitForEvent("download");await page.getByRole("button",{name:"PNG speichern",exact:true}).click();assert.equal((await download).suggestedFilename(),"javascript-plot.png");
  await run('const canvas = graphics.canvas({title:"Click to draw",width:400,height:250}); const ctx=canvas.getContext("2d"); ctx.fillStyle="purple"; ctx.fillRect(20,20,100,100); canvas.addEventListener("pointerdown",()=>{ctx.fillStyle="lime";ctx.fillRect(20,20,100,100);console.log("Canvas clicked");});');
  const canvas=page.locator(".figure-canvas");source=await canvas.evaluate(e=>e.toDataURL());await canvas.click();assert.notEqual(await canvas.evaluate(e=>e.toDataURL()),source);assert((await page.locator("#output").innerText()).includes("Canvas clicked"));
  download=page.waitForEvent("download");await page.getByRole("button",{name:"PNG speichern",exact:true}).click();assert.equal((await download).suggestedFilename(),"javascript-plot.png");
  await run('graphics.plot([0,1],[0,1]); const second=graphics.plot([0,1],[1,0]); second.close();');assert.equal(await page.locator(".figure-card").count(),1);
  await page.locator("#clearButton").click();assert.equal(await page.locator(".figure-card").count(),0);
  await page.locator("#graphicsExample").click();await page.locator("#runButton").click();await page.waitForFunction(()=>document.querySelector("#status").dataset.state==="Done");
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector("#paneDivider").getAttribute("aria-orientation")==="horizontal");await divider.scrollIntoViewIfNeeded();box=await divider.boundingBox();before=await page.locator("#editorPanel").boundingBox();
  await page.mouse.move(box.x+100,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+100,box.y-80,{steps:5});await page.mouse.up();assert((await page.locator("#editorPanel").boundingBox()).height<before.height-50);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole("slider",{name:"Amplitude",exact:true}).focus();await page.keyboard.press("ArrowRight");
  if(process.env.SCREENSHOT){await page.setViewportSize({width:1440,height:900});await page.screenshot({path:process.env.SCREENSHOT});}
  assert.deepEqual(errors,[]);console.log("PASS: JS Learn, independent releases, desktop/mobile resizing, plots/sliders/buttons/pan/zoom/history/PNG, Canvas, callbacks and clear.");
 }finally{if(browser)await browser.close();if(server&&server.exitCode===null){const ended=new Promise(resolve=>server.once("exit",resolve));server.kill();await ended;}if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith("pyjs-javascript-test-"))fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
