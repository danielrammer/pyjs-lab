// Execute new lessons in PYJS and check grouped navigation, scaffolds and visibility.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'learn-solutions.json'),'utf8')),english=JSON.parse(fs.readFileSync(path.join(root,'learn-solutions-en.json'),'utf8')),cases=JSON.parse(fs.readFileSync(path.join(__dirname,'basics-cases.json'),'utf8'));
async function main(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pyjs-basics-'));let server,browser;
 try{
  server=spawn(process.env.PYTHON||'python',['-u','-c',"import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()",path.join(temporary,'learn.sqlite3'),root],{cwd:root});
  server.stderr.on('data',()=>{});const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.once('data',d=>resolve(Number(d.toString().trim())))}),url=`http://127.0.0.1:${port}`;
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];let answers=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async dialog=>{if(dialog.type()==='confirm'){await dialog.accept();return;}assert.equal(dialog.type(),'prompt');assert(answers.length);await dialog.accept(answers.shift());});
  await page.goto(url);await page.locator('.cm-editor').waitFor();
  async function code(source){await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(source);}
  async function run(source,replies=[],expected=[],js=false,status='Done'){
   answers=[...replies];await code(source);await page.locator('#runButton').click();
   if(!js)for(const reply of replies){await page.locator('#pythonInputForm').waitFor({state:'visible',timeout:240000});await page.locator('#pythonInputValue').fill(reply);await page.locator('#pythonInputForm button[type=submit]').click();answers.shift();}
   await page.waitForFunction(()=>['Done','Error'].includes(document.querySelector('#status').dataset.state),null,{timeout:240000});
   const output=await page.locator('#output').innerText();assert.equal(await page.locator('#status').getAttribute('data-state'),status,output);assert.equal(answers.length,0);
   for(const text of expected)assert(output.includes(text),output+' missing '+text);
  }
  await run('print("Canvas" in globals())',[],['False']);
  await run('can = Canvas()',[],['NameError'],false,'Error');
  await code('from pyjs_canvas import Canvas\ncan = Canvas()\ncan.cir');await page.keyboard.press('Control+Space');
  await page.getByRole('option',{name:/^circle/}).click();assert((await page.locator('.cm-content').innerText()).includes('can.circle(300, 180, 30'));
  await run(await page.locator('.cm-content').innerText());
  await run('can = Canvas()\ncan.circle(100, 100, 20)');
  console.log('PASS Canvas completion, import on a fresh runtime and retained names on later runs');
  for(const locale of ['de','en']){
   await page.locator('#uiLanguage').selectOption(locale);
   for(const js of [false,true]){
    await page.locator(`.lang[data-language="${js?'javascript':'python'}"]`).click();
    for(const entry of cases.filter(entry=>entry.id.startsWith('js-')===js))await run((locale==='en'?english:catalog)[entry.id],entry.answers,locale==='en'?entry.output_en:entry.output,js);
    console.log(`PASS 23 ${js?'JS':'Python'} foundations solutions (${locale})`);
   }
  }
  await page.locator('#uiLanguage').selectOption('de');await page.locator('.lang[data-language="python"]').click();await code('# Ready');
  async function learn(){await page.locator('#learnButton').click();await page.locator('.learn-level-heading button').first().waitFor();}
  await learn();const publicState=await (await page.request.get(url+'/api/learn')).json();assert.equal(publicState.entries.length,94);
  assert(publicState.entries.every(entry=>!('solution' in entry)&&!('solution_en' in entry)));
  assert.equal(await page.locator('.learn-level-heading').count(),4);
  const basics=page.getByRole('button',{name:'Grundlagen (18)',exact:true});assert(await page.locator('.learn-level-heading button').evaluateAll(nodes=>nodes.every(node=>node.getAttribute('aria-expanded')==='false')));await basics.click();assert.equal(await basics.getAttribute('aria-expanded'),'true');await basics.click();assert.equal(await basics.getAttribute('aria-expanded'),'false');assert.equal(await page.getByRole('cell',{name:'Hello Python',exact:true}).count(),0);
  await page.keyboard.press('Escape');await page.locator('#learnButton').click();await basics.waitFor();assert.equal(await basics.getAttribute('aria-expanded'),'false');await basics.click();
  for(const js of [false,true]){
   await page.locator('#learnLanguage').selectOption(js?'javascript':'python');
   await require('./learn-ui.cjs').expandLevels(page);
   for(const id of ['shapes','drag-circles','rotate-rectangle','bouncing-ball','framerate','collision']){
    const entry=publicState.entries.find(entry=>entry.id===(js?'js-':'')+id);
    const row=page.locator('.learn-level-tasks tr').filter({has:page.getByRole('cell',{name:entry.title,exact:true})});await row.getByRole('button',{name:'Aufgabe starten',exact:true}).click();
    const source=await page.locator('.cm-content').innerText();assert(source.includes(js?'graphics.canvas':'from pyjs_canvas import Canvas'));
    if(id!=='shapes'&&id!=='rotate-rectangle')assert(source.includes(js?'canvas.addEventListener("pointerdown", press)':'canvas.on("press", press)'));
    await run(source,[],[],js);await learn();await page.locator('#learnLanguage').selectOption(js?'javascript':'python');
   }
  }
  console.log('PASS grouped folding and all 12 starter scaffolds run in PYJS');
  await page.locator('#learnLanguage').selectOption('python');await page.locator('#learnManage').click();await page.getByLabel('Admin-Passwort').fill('test-password');await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  const visible=page.getByLabel('Sichtbar',{exact:true}).first();await visible.waitFor();assert(await visible.isChecked());await visible.uncheck();await page.getByRole('button',{name:'Änderungen speichern',exact:true}).click();await page.getByText('Aufgaben gespeichert.',{exact:true}).waitFor();assert.equal(await page.getByRole('cell',{name:'Hello Python',exact:true}).count(),0);
  assert.equal((await (await page.request.get(url+'/api/learn')).json()).entries.length,93);
  await page.locator('#learnManage').click();await page.getByLabel('Admin-Passwort').fill('test-password');await page.getByRole('button',{name:'Anmelden',exact:true}).click();await visible.waitFor();assert.equal(await visible.isChecked(),false);await visible.check();await page.getByRole('button',{name:'Änderungen speichern',exact:true}).click();await page.getByRole('cell',{name:'Hello Python',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS task visibility can hide and restore a challenge independently of solution release');
 }finally{if(browser)await browser.close();if(server&&server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('pyjs-basics-'))fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
