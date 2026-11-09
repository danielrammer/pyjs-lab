// Exercise real NiceGUI/Pyodide, with external requests blocked during GUI runs.
const {chromium}=require("playwright");
const {spawn}=require("node:child_process");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");

async function main(){
  let server,browser;
  try{
    let url=process.env.BASE_URL;
    if(!url){
      const script="from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler\nclass Handler(SimpleHTTPRequestHandler):\n def end_headers(self):\n  self.send_header('Cross-Origin-Opener-Policy','same-origin')\n  self.send_header('Cross-Origin-Embedder-Policy','credentialless')\n  super().end_headers()\ns=ThreadingHTTPServer(('127.0.0.1',0),Handler)\nprint(s.server_port,flush=True)\ns.serve_forever()";
      server=spawn(process.env.PYTHON||"python",["-u","-c",script],{cwd:root});
      server.stderr.on("data",()=>{});
      const port=await new Promise((resolve,reject)=>{server.once("error",reject);server.stdout.once("data",x=>resolve(Number(x.toString().trim())));});
      url=`http://127.0.0.1:${port}`;
    }
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on("pageerror",e=>console.log("PAGE ERROR",e.message));
    page.on("console",msg=>{if(msg.type()==="error")console.log("BROWSER",msg.text());});
    const external=[];
    await page.route("**/*",route=>{
      const address=new URL(route.request().url());
      if(["http:","https:"].includes(address.protocol) && address.origin!==new URL(url).origin){external.push(address.href);return route.abort();}
      return route.continue();
    });
    await page.goto(url);
    await page.locator(".cm-editor").waitFor();
    const status=()=>page.locator("#status").getAttribute("data-state");
    async function run(code){
      await page.locator(".cm-content").click();await page.keyboard.press("Control+A");await page.keyboard.insertText(code);
      await page.locator("#runButton").click();
      await page.waitForFunction(()=>["Done","Error","Cancelled"].includes(document.querySelector("#status").dataset.state),null,{timeout:150000});
      if(await status()==="Error")console.log("PYTHON ERROR",await page.locator("#output").innerText());
    }
    const demo=readFileSync(path.join(root,"examples/nicegui-animation.py"),"utf8");
    await run(demo);
    assert.equal(await status(),"Done");
    let gui=page.frameLocator(".nicegui-frame");
    const green=gui.getByRole("button",{name:"Grün",exact:true});
    await green.click();
    await gui.getByText("Hallo 5RA!",{exact:true}).evaluate(el=>new Promise((resolve,reject)=>{
      const until=Date.now()+10000;const poll=()=>getComputedStyle(el).backgroundColor==="rgb(0, 128, 0)"?resolve():Date.now()>until?reject(new Error("color not updated")):setTimeout(poll,30);poll();
    }));
    await gui.getByRole("button",{name:"Animation starten",exact:true}).click();
    await gui.getByRole("button",{name:"Lila",exact:true}).click();
    await gui.getByRole("button",{name:"Animation starten",exact:true}).waitFor({state:"visible"});
    await page.waitForFunction(()=>document.querySelector('.nicegui-frame').contentDocument.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')==='1');
    await gui.getByRole("button",{name:"Animation starten",exact:true}).click({trial:true});
    assert(await gui.getByRole("button",{name:"Animation starten",exact:true}).isEnabled());
    assert.equal(await gui.locator('[role="progressbar"]').getAttribute("aria-valuenow"),"1");
    assert.equal(await gui.getByText("Hallo 5RA!",{exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(128, 0, 128)");
    assert.equal(external.length,0,`Unexpected external runtime requests: ${external.join(", ")}`);
    console.log("PASS: stock NiceGUI buttons, styles, async animation, no external requests");

    await run("from nicegui import ui\nname=ui.input('Name')\ntext=ui.label('Bereit')\nui.button('Hallo',on_click=lambda: text.set_text('Hallo '+name.value))\nprint('NiceGUI OK')");
    gui=page.frameLocator(".nicegui-frame");
    await gui.getByRole("textbox",{name:"Name"}).fill("Ada");
    await gui.getByRole("button",{name:"Hallo",exact:true}).click();
    await gui.getByText("Hallo Ada",{exact:true}).waitFor();
    assert((await page.locator("#output").innerText()).includes("NiceGUI OK"));
    assert.equal(await gui.getByText("Hallo 5RA!",{exact:true}).count(),0);
    await page.setViewportSize({width:390,height:844});
    const widths=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
    assert(widths[0]<=widths[1],`Page overflows: ${widths}`);
    if(process.env.UI_SCREENSHOT)await page.screenshot({path:process.env.UI_SCREENSHOT,fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    console.log("PASS: input round trip, stdout, clean rerun and mobile width");

    await run("from nicegui import ui\nasync def fail():\n    raise ValueError('callback-test')\nui.button('Fehler',on_click=fail)");
    await page.frameLocator(".nicegui-frame").getByRole("button",{name:"Fehler"}).click();
    await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='Error');
    assert((await page.locator("#output").innerText()).includes("callback-test"));
    await run("from nicegui import ui\nui.run()");
    assert.equal(await status(),"Error");
    assert((await page.locator("#output").innerText()).includes("ui.run"));
    console.log("PASS: callback errors reach editor; ui.run retains explicit unsupported error");

    await run(demo);
    await page.frameLocator(".nicegui-frame").getByRole("button",{name:"Animation starten",exact:true}).click();
    await page.locator("#clearButton").click();
    assert.equal(await page.locator(".nicegui-frame").count(),0);
    await page.waitForTimeout(2400);
    assert.equal(await page.locator(".nicegui-frame").count(),0);
    await page.unroute("**/*");
    await run('print("Normal Python after NiceGUI")');
    assert.equal(await status(),"Done");
    assert((await page.locator("#output").innerText()).includes("Normal Python after NiceGUI"));
    console.log("PASS: Clear disposes GUI during animation; normal Python still works");

    await page.locator(".cm-content").click();await page.keyboard.press("Control+A");await page.keyboard.insertText(demo);
    await page.locator("#runButton").click();await page.locator(".nicegui-preview").waitFor();
    await page.getByRole("button",{name:"Stoppen",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='Cancelled');
    assert.equal(await page.locator(".nicegui-frame").count(),0);
    assert(await page.locator("#runButton").isEnabled());
    console.log("PASS: Stop cancels an in-progress GUI load");

    await page.addInitScript(()=>Object.defineProperty(window,"crossOriginIsolated",{get:()=>false}));
    await page.reload();await page.locator(".cm-editor").waitFor();
    await run('print("Main-thread Python fallback OK")');
    assert.equal(await status(),"Done");
    assert((await page.locator("#output").innerText()).includes("Main-thread Python fallback OK"));
    console.log("PASS: lazy-loaded main-thread Python fallback");
  }finally{await browser?.close();server?.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
