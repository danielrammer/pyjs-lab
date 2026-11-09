const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const tasks=JSON.parse(fs.readFileSync(path.join(root,'learn-gui.json'),'utf8'));
async function main(){
  let server,browser,temporary;
  try{
    let url=process.env.BASE_URL;
    if(!url){
      temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pyjs-gui-learn-'));
      const script="import sys;from learn_server import create_server,password_hash;s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]);print(s.server_port,flush=True);s.serve_forever()";
      server=spawn(process.env.PYTHON||'python',['-u','-c',script,path.join(temporary,'learn.sqlite3'),root],{cwd:root});
      server.stderr.on('data',data=>process.stderr.write(data));
      const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.once('data',data=>resolve(Number(data.toString().trim())));});url=`http://127.0.0.1:${port}`;
    }
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});page.on('dialog',d=>d.accept());
    page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER',msg.text());});
    if(!process.env.BASE_URL)await page.route('**/nicegui-dist/**',async route=>{
      const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
      const file=path.resolve(root,'.'+pathname),base=path.resolve(root,'nicegui-dist');
      assert(file.startsWith(base+path.sep));
      const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2','.py':'text/plain'}[path.extname(file)]||'application/octet-stream';
      await route.fulfill({path:file,contentType:type,headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless'}});
    });
    await page.goto(url);await page.locator('.cm-editor').waitFor();
    const state=await (await page.request.get(url+'/api/learn')).json();
    for(const task of tasks){
      const entry=state.entries.find(e=>e.id===task.id);assert(entry,task.id);assert.equal(entry.level,'GUI');assert.equal(entry.solution_available,false);
      assert(!('solution' in entry));assert(!('solution_en' in entry));
      assert.equal((await page.request.get(url+'/api/learn/'+task.id+'/solution')).status(),403);
    }
    async function run(code){
      await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(code);await page.locator('#runButton').click();
      await page.waitForFunction(()=>['Done','Error','Cancelled'].includes(document.querySelector('#status').dataset.state),null,{timeout:150000});
      assert.equal(await page.locator('#status').getAttribute('data-state'),'Done',await page.locator('#output').innerText());
      return page.frameLocator('.nicegui-frame');
    }
    async function text(gui,value){await gui.getByText(value,{exact:true}).waitFor();}
    for(const task of tasks){
      await page.locator('#learnButton').click();
      const group=page.getByRole('button',{name:/^GUI \(\d+\)$/});await group.waitFor();
      if(await group.getAttribute('aria-expanded')==='false')await group.click();
      const row=page.locator('.learn-level-tasks tr').filter({has:page.getByRole('cell',{name:task.title,exact:true})});
      await row.getByRole('button',{name:'Aufgabe starten',exact:true}).click();
      const starter=await page.locator('.cm-content').innerText();
      assert(starter.startsWith('# Challenge: '+task.title_en),task.id);
      assert(starter.isWellFormed());assert(!/anzeige|gruen|pruefen|TODO:.*(Ergänze|Ändere)/.test(starter));
      await run(starter);
      let gui=await run(task.solution);
      switch(task.id){
        case 'gui-import-module':case 'gui-import-name': {const n=Number((await page.locator('#output').innerText()).trim());assert(Number.isInteger(n)&&n>=1&&n<=20);break;}
        case 'gui-hello':await text(gui,'Hello Fadi!');await gui.getByRole('button',{name:'Start',exact:true}).waitFor();break;
        case 'gui-label':await text(gui,'Welcome to Fadi!');break;
        case 'gui-click':await text(gui,'Ready');await gui.getByRole('button',{name:'Click me',exact:true}).click();await text(gui,'Clicked!');break;
        case 'gui-style':await text(gui,'Styled text');assert.equal(await gui.getByText('Styled text',{exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(0, 128, 0)');break;
        case 'gui-reset':
          for(const [button,expected] of [['Green','Green selected!'],['Purple','Purple selected!'],['Reset','Hello!'],['Green','Green selected!']]){await gui.getByRole('button',{name:button,exact:true}).click();await text(gui,expected);}break;
        case 'gui-input':
          await gui.getByRole('button',{name:'Greet',exact:true}).click();await text(gui,'Enter your name.');
          await gui.getByRole('textbox',{name:'Your name'}).fill(' Ada ');await gui.getByRole('button',{name:'Greet',exact:true}).click();await text(gui,'Hello Ada!');break;
        case 'gui-condition':
          for(const [value,expected] of [[24,'Cool'],[25,'Warm'],[28,'Warm']]){gui=await run(task.solution.replace('value=20',`value=${value}`));await gui.getByRole('button',{name:'Check',exact:true}).click();await text(gui,expected);}break;
        case 'gui-score':
          await gui.getByRole('button',{name:'Add point',exact:true}).click();await text(gui,'Score: 1');await gui.getByRole('button',{name:'Add point',exact:true}).click();await text(gui,'Score: 2');
          await gui.getByRole('button',{name:'Reset',exact:true}).click();await text(gui,'Score: 0');await gui.getByRole('button',{name:'Add point',exact:true}).click();await text(gui,'Score: 1');break;
        case 'gui-quiz':
          for(const [answer,expected] of [['','Enter an answer.'],['wrong','Try again.'],[' GRAPHICAL USER INTERFACE ','Correct!']]){await gui.getByRole('textbox',{name:'Your answer'}).fill(answer);await gui.getByRole('button',{name:'Check',exact:true}).click();await text(gui,expected);}break;
        case 'gui-mini-pro1':
          await gui.getByRole('spinbutton',{name:'Tickets',exact:true}).fill('5');await gui.getByRole('button',{name:'Calculate',exact:true}).click();await text(gui,'Within budget: EUR 10.00');
          await gui.getByRole('spinbutton',{name:'Tickets',exact:true}).fill('11');await gui.getByRole('button',{name:'Calculate',exact:true}).click();await text(gui,'Over budget: EUR 22.00');
          await gui.getByRole('spinbutton',{name:'Tickets',exact:true}).fill('');await gui.getByRole('button',{name:'Calculate',exact:true}).click();await text(gui,'Enter two non-negative numbers.');
          await gui.getByRole('button',{name:'Reset',exact:true}).click();await text(gui,'Ready');break;
      }
      console.log('PASS: '+task.id+' starter, solution and interaction');
    }
    await page.locator('#learnButton').click();await page.getByRole('button',{name:/^GUI \(\d+\)$/}).waitFor();
    await page.keyboard.press('Escape');await page.locator('#uiLanguage').selectOption('en');await page.locator('#learnButton').click();
    await page.getByRole('cell',{name:tasks[0].title_en,exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:tasks[0].title,exact:true}).count(),0);
    await page.locator('#learnLanguage').selectOption('javascript');assert.equal(await page.getByRole('button',{name:/^GUI \(\d+\)$/}).count(),0);
    await page.locator('#learnLanguage').selectOption('python');
    await page.setViewportSize({width:390,height:844});assert(await page.locator('#learnDialog').isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);console.log('PASS: bilingual GUI category, private solutions and mobile width');
  }finally{await browser?.close();if(server)server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
