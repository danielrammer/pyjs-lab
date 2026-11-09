const {expandLevels}=require('./learn-ui.cjs');
// Verify language persistence, bilingual tasks and collapsed release controls.
const {chromium}=require('playwright'), assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pyjs-i18n-'));let browser,server;
 try{
  server=spawn(process.env.PYTHON||'python',['-u','-c',"import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()",path.join(temporary,'learn.sqlite3'),root],{cwd:root});
  const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.once('data',d=>resolve(Number(d.toString().trim())));});
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button',{name:/Ausführen/}).waitFor();
  await page.locator('#uiLanguage').selectOption('en');
  await page.getByRole('button',{name:/Run/}).waitFor();
  await page.reload();await page.getByRole('button',{name:/Run/}).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.getByRole('button',{name:'Learn',exact:true}).click();await expandLevels(page);
  await page.getByRole('cell',{name:'Ball: Tilted Platform and Collisions',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Solution locked',exact:true}).count(),41);
  const state=await (await page.request.get(`http://127.0.0.1:${port}/api/learn`)).json();
  assert(state.entries.every(e=>e.title_en && e.description_en && !('solution_en' in e)));
  assert.equal((await page.request.get(`http://127.0.0.1:${port}/learn-solutions-en.json`)).status(),404);
  await page.getByRole('button',{name:'Manage tasks',exact:true}).click();
  await page.getByLabel('Admin password').fill('test-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const release=page.getByLabel('Release solution to learners', {exact:true}).first();
  await release.waitFor();assert(await release.isVisible());
  assert.equal(await page.locator('.learn-solution-editor').first().getAttribute('open'),null);
  await release.check();
  await page.locator('.learn-task-toggle').first().click();await page.getByLabel('Title (EN) 1',{exact:true}).fill('Hello translated');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByText('Tasks saved.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'View solution',exact:true}).click();
  const english=JSON.parse(fs.readFileSync(path.join(root,'learn-solutions-en.json'),'utf8'));
  assert.equal(await page.locator('pre.learn-solution-code').textContent(),english.hello);
  await page.locator('#uiLanguage').selectOption('de');
  const german=JSON.parse(fs.readFileSync(path.join(root,'learn-solutions.json'),'utf8'));
  await page.waitForFunction(code=>document.querySelector('pre.learn-solution-code')?.textContent===code,german.hello);
  await page.keyboard.press('Escape');
  await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.insertText('# My own code\nprint("unchanged")');
  await page.locator('#uiLanguage').selectOption('en');
  assert((await page.locator('.cm-content').innerText()).includes('print("unchanged")'));
  const cases=[
   ['hello',[],['42']],['about',[],['Age: 16','Music']],['score',[],['Points: 12']],
   ['calculator',[],['Sum: 16','Difference: 8','Product: 48']],['level',['12'],['LEVEL UP']],
   ['password',null,['ACCESS GRANTED']],['countdown',[],['10\n9\n8']],['even',['12'],['The number is even.']],
   ['grades',['90'],['Grade 1']],['guessing',['1','100','42'],['TOO LOW','TOO HIGH','CORRECT']],
   ['function',[],['10\n24']],['codebreaker',null,['CODE CRACKED!']],
  ];
  let replies=[];page.on('dialog',async dialog=>{assert.equal(dialog.type(),'prompt');assert(replies.length);await dialog.accept(replies.shift());});
  for(const js of [false,true]){
   if(js){await page.locator('[data-language="javascript"]').click();await page.evaluate(()=>Math.random=()=>.41);}
   for(const [id,values,expected]of cases){
    replies=values?[...values]:id==='password'?[js?'javascript123':'python123']:[js?'4352':'5269'];
    const code=(js?'':'import random\nrandom.seed(7)\n')+english[(js?'js-':'')+id];
    await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(code);
    await page.locator('#runButton').click();
    if(!js)for(const answer of [...replies]){
     await page.locator('#pythonInputForm').waitFor({state:'visible',timeout:240000});
     await page.locator('#pythonInputValue').fill(answer);await page.getByRole('button',{name:'Send',exact:true}).click();replies.shift();
    }
    await page.waitForFunction(()=>['Done','Error'].includes(document.querySelector('#status').dataset.state),null,{timeout:240000});
    const output=await page.locator('#output').innerText();assert.equal(await page.locator('#status').getAttribute('data-state'),'Done',output);
    assert.equal(replies.length,0);for(const value of expected)assert(output.includes(value),output);
   }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: EN/DE persistence, bilingual catalog and solution preview, private solutions, visible collapsed release checkbox, preserved learner code, 24 English solutions executed.');
 }finally{if(browser)await browser.close();if(server){server.kill();await new Promise(r=>server.once('exit',r));}fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
