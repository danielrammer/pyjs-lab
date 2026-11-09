// Browser integration: real Pyodide, stdin, Matplotlib, widgets and navigation.
// Requires Playwright and a Chromium browser; PYTHON may select the interpreter.
const {chromium} = require("playwright");
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

async function main() {
  let server, browser;
  try {
    let url = process.env.BASE_URL;
    if (!url) {
      const serverCode = "from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler\nclass Handler(SimpleHTTPRequestHandler):\n def end_headers(self):\n  self.send_header('Cross-Origin-Opener-Policy', 'same-origin')\n  self.send_header('Cross-Origin-Embedder-Policy', 'credentialless')\n  super().end_headers()\ns = ThreadingHTTPServer(('127.0.0.1', 0), Handler)\nprint(s.server_port, flush=True)\ns.serve_forever()";
      server = spawn(process.env.PYTHON || "python", ["-u", "-c", serverCode], {cwd:root});
      server.stderr.on("data", () => {});
      const port = await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(new Error("Test server did not start")), 15000);
        server.once("error", error => {clearTimeout(timer);reject(error);});
        server.stdout.once("data", data => {clearTimeout(timer);resolve(Number(data.toString().trim()));});
      });
      url = `http://127.0.0.1:${port}`;
    }
    browser = await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = [], prompts = [];
    let answers = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", async dialog => {
      prompts.push(dialog.message());
      if (!answers.length) {errors.push(`Unexpected dialog: ${dialog.message()}`);await dialog.dismiss();return;}
      const answer = answers.shift();
      answer === null ? await dialog.dismiss() : await dialog.accept(answer);
    });
    await page.goto(url);
    await page.locator(".cm-editor").waitFor();
    assert((await page.locator(".cm-content").innerText()).split("\n").every(line=>!line.trim()||line.trim().startsWith("#")));
    const status = () => page.locator("#status").getAttribute("data-state");
    const output = () => page.locator("#output").innerText();
    async function run(code, replies = []) {
      answers = [...replies]; prompts.length = 0;
      await page.locator(".cm-content").click();
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText(code);
      await page.getByRole("button", {name:/Ausführen/}).click();
      while(true){
        await page.waitForFunction(() => ["Done","Error","Cancelled"].includes(document.querySelector("#status").dataset.state)||!document.querySelector("#pythonInputForm").hidden, null, {timeout:240000});
        if(["Done","Error","Cancelled"].includes(await status()))break;
        prompts.push(await page.locator("#pythonInputLabel").textContent());
        assert(answers.length,"Unexpected inline input"); const answer=answers.shift();
        if(answer===null)await page.getByRole("button",{name:"Abbrechen",exact:true}).click();
        else{await page.locator("#pythonInputValue").fill(answer);await page.getByRole("button",{name:"Senden",exact:true}).click();}
      }
    }

    const game = "import random\n_saved_sample = random.sample\nrandom.sample = lambda digits, count: list('1234')\n" + fs.readFileSync(path.join(root,"examples/code-breaker.py"),"utf8") + "\nrandom.sample = _saved_sample\n";
    await run(game, ["12","a234","1123","4321","5678","1234"]);
    assert.equal(await status(), "Done");
    assert.equal(prompts.length, 6);
    assert.equal(prompts[0], "Versuch 1/10: ");
    assert.equal(prompts[5], "Versuch 3/10: ");
    assert((await output()).includes("CODE GEKNACKT!"));
    assert((await output()).includes("Keine Ziffer darf doppelt vorkommen."));
    assert((await output()).includes("Richtige Ziffer, falsche Position: 4"));
    await run(game, Array(10).fill("5678"));
    assert.equal(prompts.length, 10);
    assert((await output()).includes("Verloren! Der Code war: 1234"));
    await run('answer = input("Empty: ")\nprint(repr(answer))', [""]);
    assert.equal(await status(), "Done"); assert((await output()).includes("''"));
    await run('input("Cancel: ")\nprint("must not run")', [null]);
    assert.equal(await status(), "Cancelled"); assert(!(await output()).includes("must not run"));
    assert.equal(await page.getByRole("button",{name:/Ausführen/}).isEnabled(), true);
    await run('print(input("Again: "))', ["Works again"]);
    assert.equal(await status(), "Done"); assert((await output()).includes("Works again"));
    await run('import sys\nprint(sys.stdin.readline().strip())', ["Standard input"]);
    assert.equal(await status(), "Done"); assert((await output()).includes("Standard input"));
    await run('import sys\nprint(repr(sys.stdin.readline()))', [null]);
    assert.equal(await status(), "Done"); assert((await output()).includes("''"));
    await run('import sys\nprint(sys.stdin.readline().strip())', ["After EOF"]);
    assert.equal(await status(), "Done"); assert((await output()).includes("After EOF"));
    console.log("PASS: code-breaker win/loss, prompt messages, validation, empty input, cancel, rerun, stdin.");

    await page.getByRole("tab",{name:"Grafik",exact:true}).click();
    await page.locator("#graphicsExample").click();
    await page.getByRole("button",{name:/Ausführen/}).click();
    await page.waitForFunction(()=>["Done","Error"].includes(document.querySelector("#status").dataset.state), null, {timeout:240000});
    assert.equal(await status(), "Done");
    assert.equal(await page.locator(".figure-card").count(), 1);
    const image = page.locator(".figure-image");
    await image.evaluate(element=>element.decode());
    const changed = previous => page.waitForFunction(value=>document.querySelector(".figure-image").src!==value, previous);
    let box = await page.locator(".figure-area").boundingBox();
    let before = await image.getAttribute("src");
    await page.mouse.move(box.x+box.width*0.5, box.y+box.height*0.90);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*0.7, box.y+box.height*0.90,{steps:6});
    await page.mouse.up(); await changed(before);
    await page.getByRole("button",{name:"Zoom",exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.figure-toolbar button')].find(button=>button.textContent==="Zoom")?.getAttribute("aria-pressed")==="true");
    before = await image.getAttribute("src");
    await page.mouse.move(box.x+box.width*0.3, box.y+box.height*0.3); await page.mouse.down();
    await page.mouse.move(box.x+box.width*0.6, box.y+box.height*0.6,{steps:6}); await page.mouse.up(); await changed(before);
    await page.getByRole("button",{name:"Zurücksetzen",exact:true}).click();
    await page.getByRole("button",{name:"Zoom",exact:true}).click();
    before = await image.getAttribute("src");
    await page.getByRole("button",{name:"Verschieben",exact:true}).click();
    await page.mouse.move(box.x+box.width*0.4, box.y+box.height*0.4); await page.mouse.down();
    await page.mouse.move(box.x+box.width*0.6, box.y+box.height*0.4,{steps:6}); await page.mouse.up(); await changed(before);
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button",{name:"PNG speichern",exact:true}).click();
    assert.equal((await downloaded).suggestedFilename(), "python-plot.png");
    await page.getByRole("button",{name:"Vollbild",exact:true}).click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    await page.getByRole("button",{name:"Vollbild",exact:true}).click();
    await page.waitForFunction(()=>!document.fullscreenElement);
    if (process.env.SCREENSHOT) await page.screenshot({path:process.env.SCREENSHOT});
    await page.getByRole("button",{name:/Ausführen/}).click();
    await page.waitForFunction(()=>["Done","Error"].includes(document.querySelector("#status").dataset.state));
    assert.equal(await status(), "Done"); assert.equal(await page.locator(".figure-card").count(), 1);
    await run('import matplotlib.pyplot as plt\nplt.figure()\nplt.plot([1,2,3])\nplt.figure()\nplt.bar([1,2],[2,4])\nprint("two figures")');
    assert.equal(await status(), "Done"); assert.equal(await page.locator(".figure-card").count(), 2);
    await page.getByRole("button",{name:"Leeren",exact:true}).click();
    assert.equal(await page.locator(".figure-card").count(), 0); assert.equal(await output(), "");
    await run('import matplotlib.pyplot as plt\nplt.plot([1,2],[1,3])\nplt.show()\nplt.close("all")');
    assert.equal(await status(), "Done"); assert.equal(await page.locator(".figure-card").count(), 0);
    await run('import matplotlib.pyplot as plt\nfrom matplotlib.widgets import Button\nfig, ax = plt.subplots()\nline, = ax.plot([1,2],[1,2])\nbutton = Button(fig.add_axes([0.3,0.02,0.4,0.08]), "Click me")\ndef click(event):\n    line.set_ydata([2,1])\n    fig.canvas.draw_idle()\n    print("button clicked")\nbutton.on_clicked(click)\nplt.show()');
    assert.equal(await status(), "Done"); await image.evaluate(element=>element.decode());
    before = await image.getAttribute("src"); box = await page.locator(".figure-area").boundingBox();
    await page.mouse.click(box.x+box.width*0.5,box.y+box.height*0.94); await changed(before);
    await page.waitForFunction(()=>document.querySelector("#output").textContent.includes("button clicked"));
    await run('print("only text")');
    assert.equal(await page.getByRole("tab",{name:"Ausgabe",exact:true}).getAttribute("aria-selected"), "true");
    await run('raise ValueError("expected test error")');
    assert.equal(await status(), "Error"); assert((await output()).includes("expected test error"));
    await page.getByRole("button",{name:"JavaScript",exact:true}).click();
    assert((await page.locator(".cm-content").innerText()).split("\n").every(line=>!line.trim()||line.trim().startsWith("//")));
    await run('console.log("JavaScript still works");'); assert.equal(await status(), "Done");
    await page.getByRole("button",{name:/Helles Design/}).click();
    await page.getByRole("button",{name:"Python",exact:true}).click();
    await page.getByRole("tab",{name:"Grafik",exact:true}).click();
    await page.locator("#graphicsExample").click();
    await page.getByRole("button",{name:/Ausführen/}).click();
    await page.waitForFunction(()=>["Done","Error"].includes(document.querySelector("#status").dataset.state));
    assert.equal(await status(), "Done");
    await page.setViewportSize({width:390,height:844}); await image.evaluate(element=>element.decode());
    await page.locator(".figure-message").scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth), false);
    before = await image.getAttribute("src"); box = await page.locator(".figure-area").boundingBox();
    await page.mouse.click(box.x+box.width*0.7,box.y+box.height*0.9); await changed(before);
    assert.deepEqual(errors, []);
    console.log("PASS: Matplotlib sliders/buttons, axes zoom/pan, PNG, full screen, reruns, multiple figures, close/clear, errors, JavaScript, mobile.");
  } finally {
    if (browser) await browser.close();
    server?.kill();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
