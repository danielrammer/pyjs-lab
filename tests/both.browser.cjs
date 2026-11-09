// Verify simultaneous text/graphics, input, callbacks, reruns and tab navigation.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
async function main(){
 let browser,server;
 try{
  let url=process.env.BASE_URL;
  if(!url){
   server=spawn(process.env.PYTHON||'python',['-u','-c',"from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler\nclass H(SimpleHTTPRequestHandler):\n def end_headers(self):\n  self.send_header('Cross-Origin-Opener-Policy','same-origin'); self.send_header('Cross-Origin-Embedder-Policy','credentialless'); super().end_headers()\ns=ThreadingHTTPServer(('127.0.0.1',0),H);print(s.server_port,flush=True);s.serve_forever()"],{cwd:path.resolve(__dirname,'..')});
   server.stderr.on('data',()=>{});const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.once('data',d=>resolve(Number(d.toString().trim())))});url=`http://127.0.0.1:${port}`;
  }
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('.cm-editor').waitFor();
  async function code(source){await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(source);}
  async function done(){await page.waitForFunction(()=>['Done','Error'].includes(document.querySelector('#status').dataset.state),null,{timeout:240000});assert.equal(await page.locator('#status').getAttribute('data-state'),'Done',await page.locator('#output').innerText());}
  async function both(){assert(await page.locator('#output').isVisible());assert(await page.locator('#graphics').isVisible());assert.equal(await page.locator('#bothTab').getAttribute('aria-selected'),'true');}
  await page.getByRole('tab',{name:'Beides',exact:true}).click();await both();
  await code('from pyjs_canvas import Canvas\nprint("Before the drawing")\ncan = Canvas(320, 200)\ncan.circle(80, 80, 30)\nname = input("Name: ")\nprint("Hello", name)');await page.locator('#runButton').click();
  await page.locator('#pythonInputForm').waitFor({state:'visible',timeout:240000});await both();assert((await page.locator('#output').innerText()).includes('Before the drawing'));
  await page.locator('#pythonInputValue').fill('Alex');await page.locator('#pythonInputForm button[type=submit]').click();await done();await both();await page.locator('.figure-canvas').waitFor();assert((await page.locator('#output').innerText()).includes('Hello Alex'));
  await page.locator('.lang[data-language="javascript"]').click();
  const js='console.log("JS canvas ready"); const can = graphics.canvas({width:320,height:200}); const ctx=can.getContext("2d"); ctx.fillStyle="purple"; ctx.fillRect(20,20,120,80); can.addEventListener("pointerdown",()=>{console.log("Clicked"); const second=graphics.canvas({width:180,height:120}); second.getContext("2d").fillRect(10,10,50,50);});';
  await code(js);await page.locator('#runButton').click();await done();await both();await page.locator('.figure-canvas').first().click({position:{x:25,y:25}});await page.locator('.figure-card').nth(1).waitFor();await both();assert((await page.locator('#output').innerText()).includes('Clicked'));
  for(const width of [1500,390]){await page.setViewportSize({width,height:1000});await both();const output=await page.locator('#output').boundingBox(),graphics=await page.locator('#graphics').boundingBox();assert(output.height>=60&&graphics.height>30);assert(graphics.y>=output.y+output.height-1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:1500,height:1000});await page.locator('#outputTab').click();assert.equal(await page.locator('#graphics').isVisible(),false);await page.locator('#graphicsTab').click();assert.equal(await page.locator('#output').isVisible(),false);
  await page.locator('#graphicsTab').focus();await page.keyboard.press('End');await both();await page.keyboard.press('Home');assert.equal(await page.locator('#outputTab').getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowLeft');await both();
  await page.locator('#runButton').click();await done();await both();assert.equal(await page.locator('.figure-card').count(),1);await page.locator('#clearButton').click();await both();assert.equal(await page.locator('.figure-card').count(),0);
  await page.locator('#uiLanguage').selectOption('en');await page.getByRole('tab',{name:'Both',exact:true}).waitFor();await both();
  if(process.env.SCREENSHOT){await code(js);await page.locator('#runButton').click();await done();await page.screenshot({path:process.env.SCREENSHOT});}
  assert.deepEqual(errors,[]);console.log('PASS Both view: Python/JS text and graphics, input, callbacks/new canvases, reruns, clear, keyboard navigation, mobile and EN/DE');
 }finally{if(browser)await browser.close();if(server)server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
