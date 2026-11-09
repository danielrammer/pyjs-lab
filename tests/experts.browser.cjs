// Execute and interact with all eight graphics solutions in the real editor.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const english=process.env.LOCALE==='en';
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,english?'learn-solutions-en.json':'learn-solutions.json'),'utf8'));
async function main(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pyjs-experts-'));let browser,server;
 try{
  let url=process.env.BASE_URL;
  if(!url){
   server=spawn(process.env.PYTHON||'python',['-u','-c',"import sys; from learn_server import create_server,password_hash; s=create_server(('127.0.0.1',0),sys.argv[1],password_hash('test-password'),False,sys.argv[2]); print(s.server_port,flush=True); s.serve_forever()",path.join(temporary,'learn.sqlite3'),root],{cwd:root});
   server.stderr.on('data',()=>{});
   const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.once('data',d=>resolve(Number(d.toString().trim())));});url=`http://127.0.0.1:${port}`;
  }
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  if(english)await page.addInitScript(()=>localStorage.setItem('pyjs.locale','en'));
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.locator('.cm-editor').waitFor();
  async function run(code){
   await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(code);
   await page.getByRole('button',{name:english?/Run/:/Ausführen/}).click();
   await page.waitForFunction(()=>['Done','Error'].includes(document.querySelector('#status').dataset.state),null,{timeout:240000});
   assert.equal(await page.locator('#status').getAttribute("data-state"),'Done',await page.locator('#output').innerText());
   await page.locator('#graphicsTab').click();await page.locator('.figure-area').waitFor();
   await page.waitForFunction(()=>{const i=document.querySelector('.figure-image');return !i||i.hidden||(i.complete&&i.naturalWidth>0);});
  }
  async function coordinates(){
   const box=await page.locator('.figure-area canvas').boundingBox();
   return p=>({x:box.x+p[0]*box.width/600,y:box.y+p[1]*box.height/360});
  }
  async function centroid(color){
   return page.evaluate(async color=>{
    const source=document.querySelector('.figure-area canvas')||document.querySelector('.figure-image');
    if(source instanceof HTMLImageElement)await source.decode();
    const c=document.createElement('canvas');c.width=source.width||source.naturalWidth;c.height=source.height||source.naturalHeight;
    const ctx=c.getContext('2d');ctx.drawImage(source,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height).data;
    let x=0,y=0,count=0;for(let i=0;i<data.length;i+=4)if(data[i]===color[0]&&data[i+1]===color[1]&&data[i+2]===color[2]&&data[i+3]>200){x+=(i/4)%c.width;y+=Math.floor(i/4/c.width);count++;}
    return {x:x/count,y:y/count,count};
   },color);
  }
  async function drag(a,b,release=true){await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});if(release)await page.mouse.up();await page.waitForTimeout(150);}
  for(const js of [false,true]){
   if(js){await page.locator('[data-language="javascript"]').click();await page.waitForFunction(()=>document.querySelector('[data-language="javascript"]').classList.contains('active'));}
   const prefix=js?'js-':'';
   await run(catalog[prefix+'shapes']);
   for(const color of [[128,0,128],[154,205,50],[255,165,0],[65,105,225]])assert((await centroid(color)).count>50);
   console.log('PASS '+prefix+'shapes');
   await run(catalog[prefix+'drag-circles']);
   let convert=await coordinates(true);
   const purple=await centroid([128,0,128]),orange=await centroid([255,165,0]);
   await drag(convert([180,180]),convert([240,120]));
   assert(Math.abs((await centroid([128,0,128])).x-purple.x)>20);assert(Math.abs((await centroid([255,165,0])).x-orange.x)<2);
   const moved=await centroid([128,0,128]);await page.mouse.move(convert([300,180]).x,convert([300,180]).y);await page.waitForTimeout(150);
   assert(Math.abs((await centroid([128,0,128])).x-moved.x)<2);
   await drag(convert([420,180]),convert([300,180]));assert(Math.abs((await centroid([255,165,0])).x-orange.x)>20);
   console.log('PASS '+prefix+'drag-circles');
   await run(catalog[prefix+'rotate-rectangle']);
   const before=await centroid([128,0,128]);
   await page.getByLabel(english?'Angle':'Winkel').fill('90');
   await page.waitForTimeout(200);const after=await centroid([128,0,128]);assert(Math.abs(after.x-before.x)<2&&Math.abs(after.y-before.y)<2);
   console.log('PASS '+prefix+'rotate-rectangle');
   for(const [variant,fps] of [['bouncing-ball',null],['framerate',10],['framerate',30],['framerate',60]]){
   await run(catalog[prefix+variant]);
   if(fps)await page.getByLabel('FPS').fill(String(fps));
   convert=await coordinates(true);
   await drag(convert([300,339]),convert([300,90]),false);
   const held=await centroid([65,105,225]);await page.waitForTimeout(350);assert(Math.abs((await centroid([65,105,225])).y-held.y)<2,'Held ball must remain stationary');
   await page.mouse.up();let previous=held.y,fall=false,bounce=false;
   for(let i=0;i<35;i++){await page.waitForTimeout(80);const next=(await centroid([65,105,225])).y;if(next>previous+2)fall=true;if(fall&&next<previous-2)bounce=true;previous=next;if(bounce)break;}
   assert(fall,'Ball must fall');assert(bounce,'Ball must bounce');
   await page.locator('#clearButton').click();await page.waitForTimeout(250);assert.equal(await page.locator('.figure-card').count(),0);
   console.log('PASS '+prefix+variant+(fps?' at '+fps+' FPS':'')+' and timer cleanup');
   }
   await run(catalog[prefix+'collision']);convert=await coordinates();
   await drag(convert([300,339]),convert([300,90]),false);
   const held=await centroid([65,105,225]);await page.waitForTimeout(200);
   assert(Math.abs((await centroid([65,105,225])).y-held.y)<2);
   await page.mouse.up();let surfaceBounce=false,lastY=held.y;
   for(let i=0;i<30;i++){
     await page.waitForTimeout(45);const ball=await centroid([65,105,225]);
     if(ball.y<lastY-1&&ball.y<280&&ball.x<295){surfaceBounce=true;break;}lastY=ball.y;
   }
   assert(surfaceBounce,'Ball must bounce sideways off the tilted platform before reaching the floor');
   await page.locator('#clearButton').click();await page.waitForTimeout(150);assert.equal(await page.locator('.figure-card').count(),0);
   console.log('PASS '+prefix+'collision: tilted surface bounce and sideways velocity');
  }
  assert.deepEqual(errors,[]);console.log('PASS all twelve expert solutions, including delta time and tilted rectangle collision.');
 }finally{if(browser)await browser.close();if(server&&server.exitCode===null){const ended=new Promise(resolve=>server.once('exit',resolve));server.kill();await ended;}fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
