const {expandLevels}=require('./learn-ui.cjs');
// Execute every stored Learn solution in the actual PYJS editor/Pyodide worker.
const {chromium}=require("playwright"), assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const root=path.resolve(__dirname,".."), catalog=JSON.parse(fs.readFileSync(path.join(root,"learn-solutions.json"),"utf8"));

async function main(){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"pyjs-solutions-test-"));
  let browser,server;
  try{
    let url=process.env.BASE_URL;
    if(!url){
      server=spawn(process.env.PYTHON||"python",["-u","-c","import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()",path.join(temporary,"learn.sqlite3"),root],{cwd:root});
      server.stderr.on("data",()=>{});
      const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Server did not start")),15000);server.once("error",error=>{clearTimeout(timer);reject(error);});server.stdout.once("data",data=>{clearTimeout(timer);resolve(Number(data.toString().trim()));});});
      url=`http://127.0.0.1:${port}`;
    }
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("dialog",async dialog=>{errors.push("Unexpected blocking dialog");await dialog.dismiss();});
    await page.goto(url);await page.locator(".cm-editor").waitFor();
    assert(await page.evaluate(()=>crossOriginIsolated),"Inline input requires an isolated page");
    const status=()=>page.locator("#status").getAttribute("data-state"), output=()=>page.locator("#output").innerText();
    async function run(code,answers=[],expected=[]){
      await page.locator(".cm-content").click();await page.keyboard.press("Control+A");await page.keyboard.insertText(code);
      await page.getByRole("button",{name:/Ausführen/}).click();let index=0;
      while(true){
        await page.waitForFunction(()=>["Done","Error","Cancelled"].includes(document.querySelector("#status").dataset.state)||!document.querySelector("#pythonInputForm").hidden,null,{timeout:240000});
        if(["Done","Error","Cancelled"].includes(await status()))break;
        assert(index<answers.length,"Unexpected extra input");
        assert(await page.locator("#output").isVisible(),"Console must remain visible while waiting");
        assert.equal(await page.locator("#pythonInputForm").evaluate(e=>e.getBoundingClientRect().top>=document.querySelector("#output").getBoundingClientRect().top),true);
        if(process.env.SCREENSHOT && code.includes("correct_position") && index===3)await page.screenshot({path:process.env.SCREENSHOT});
        const value=answers[index++];
        if(value===null)await page.getByRole("button",{name:"Abbrechen",exact:true}).click();
        else{await page.locator("#pythonInputValue").fill(value);await page.getByRole("button",{name:"Senden",exact:true}).click();}
      }
      assert.equal(await status(),answers.includes(null)?"Cancelled":"Done",await output());
      assert.equal(index,answers.length);const result=await output();
      assert(!result.includes("Python is loading for the first run"),"Runtime loading status must not appear in program output");
      for(const text of expected)assert(result.includes(text),`Missing ${text}: ${result}`);
      return result;
    }
    const cases=[
      ["hello",[],["Mein Name ist Alex.","Ich lerne Python.","42"]],
      ["about",[],["Name: Alex","Alter: 16","Hobby: Musik"]],
      ["score",[],["Punkte: 12"]],
      ["calculator",[],["Summe: 16","Differenz: 8","Produkt: 48"]],
      ["level",["12"],["LEVEL UP"]],
      ["password",["python123"],["ZUGANG ERLAUBT"]],
      ["countdown",[],["10\n9\n8\n7\n6\n5\n4\n3\n2\n1"]],
      ["even",["12"],["Die Zahl ist gerade."]],
      ["grades",["90"],["Note 1"]],
      ["guessing",["abc","1","100","42"],["Bitte eine ganze Zahl eingeben.","ZU NIEDRIG","ZU HOCH","RICHTIG"]],
      ["function",[],["10\n24"]],
      ["codebreaker",["abc","1123","9652","5269"],["Bitte genau 4 Ziffern","Keine Ziffer darf doppelt vorkommen.","Richtige Ziffer, falsche Position: 4","CODE GEKNACKT!"]],
    ];
    assert.equal(cases.length,Object.keys(catalog).filter(id=>!id.startsWith("js-")&&!id.startsWith("basics-")&&!["shapes","drag-circles","rotate-rectangle","bouncing-ball","framerate","collision"].includes(id)).length);
    for(const [id,answers,expected]of cases){await run("import random\nrandom.seed(7)\n"+catalog[id],answers,expected);console.log("PASS solution: "+id);}
    for(const [value,message] of [["9","TRY AGAIN"],["10","LEVEL UP"],["-1","Punkte dürfen nicht negativ sein."],["abc","Bitte eine ganze Zahl eingeben."]])await run(catalog.level,[value],[message]);
    await run(catalog.password,["wrong"],["ZUGANG VERWEIGERT"]);
    await run(catalog.even,["-3"],["Die Zahl ist ungerade."]);
    for(const [points,grade]of [[80,2],[65,3],[50,4],[0,5]])await run(catalog.grades,[String(points)],["Note "+grade]);
    await run(catalog.grades,["101"],["Bitte Punkte zwischen 0 und 100 eingeben."]);
    await run("import random\nrandom.seed(7)\n"+catalog.codebreaker,Array(10).fill("0123"),["Verloren! Der Code war: 5269"]);
    for(const [secret,guess,position,other]of [["4271","1234",1,2],["0123","0231",1,3]]){
      await run(`import random\n_saved_sample = random.sample\nrandom.sample = lambda digits, count: list('${secret}')\n`+catalog.codebreaker+"\nrandom.sample = _saved_sample\n",[guess,secret],["Tipp: "+guess,"Richtige Position: "+position,"Richtige Ziffer, falsche Position: "+other,"CODE GEKNACKT!"]);
    }
    await run('print("Dieser Hinweis bleibt sichtbar")\ninput("Dein Versuch: ")',[null],["Dieser Hinweis bleibt sichtbar","Eingabe abgebrochen."]);
    await run('print(input("Weiter: "))',["äöü"],["äöü"]);
    if(!process.env.BASE_URL){
      const publicState=await (await page.request.get(url+"/api/learn")).json();
      assert(publicState.entries.every(entry=>!entry.solution_available && !("solution"in entry)));
      assert.equal((await page.request.get(url+"/api/admin/learn")).status(),401);
      for(const id of Object.keys(catalog))assert.equal((await page.request.get(url+`/api/learn/${id}/solution`)).status(),403);
      assert.equal((await page.request.get(url+"/learn-solutions.json")).status(),404);
      await page.getByRole("button",{name:"Lernen",exact:true}).click();await expandLevels(page);await page.getByRole("cell",{name:"Codebreaker",exact:true}).waitFor();
      assert.equal(await page.getByRole("button",{name:"Lösung gesperrt",exact:true}).count(),41);
      async function login(){await page.getByRole("button",{name:"Aufgaben verwalten"}).click();await page.getByLabel("Admin-Passwort").fill("test-password");await page.getByRole("button",{name:"Anmelden",exact:true}).click();await page.getByRole("button",{name:"Änderungen speichern"}).waitFor();}
      await login();await page.locator(".learn-task-toggle").first().click();await page.locator(".learn-solution-editor summary").first().click();
      assert.equal(await page.getByLabel("Python-Lösung (DE) 1",{exact:true}).inputValue(),catalog.hello);
      await page.getByLabel("Lösung für Lernende freigeben",{exact:true}).first().check();await page.getByRole("button",{name:"Änderungen speichern"}).click();await page.getByText("Aufgaben gespeichert.").waitFor();
      assert.equal(await page.getByRole("button",{name:"Lösung ansehen",exact:true}).count(),1);
      await page.getByRole("button",{name:"Lösung ansehen",exact:true}).click();assert.equal(await page.locator("pre.learn-solution-code").textContent(),catalog.hello);
      await page.getByRole("button",{name:"Zurück zu den Aufgaben"}).click();await page.getByRole("cell",{name:"Codebreaker",exact:true}).waitFor();
      await login();await page.locator(".learn-task-toggle").first().click();await page.locator(".learn-solution-editor summary").first().click();await page.getByLabel("Lösung für Lernende freigeben",{exact:true}).first().uncheck();
      await page.getByRole("button",{name:"Änderungen speichern"}).click();await page.getByText("Aufgaben gespeichert.").waitFor();assert.equal(await page.getByRole("button",{name:"Lösung gesperrt",exact:true}).count(),41);
      assert.equal((await page.request.get(url+"/api/learn/hello/solution")).status(),403);
      await page.setViewportSize({width:390,height:844});assert.equal(await page.locator("#learnDialog").evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
    }
    assert.deepEqual(errors,[]);console.log("PASS: all 12 solutions executed in PYJS, branches/input/cancel, visible console"+(!process.env.BASE_URL?", server-side release and relock":"")+".");
  }finally{
    if(browser)await browser.close();
    if(server && server.exitCode===null){const ended=new Promise(resolve=>server.once("exit",resolve));server.kill();await ended;}
    if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith("pyjs-solutions-test-"))fs.rmSync(temporary,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
