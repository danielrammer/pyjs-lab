// Exercise real Ctrl+click, selection, scrolling and ordinary clicks in the editor.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
async function main(){
 let server,browser;
 try{
  let url=process.env.BASE_URL;
  if(!url){
   server=spawn(process.env.PYTHON||'python',['-u','-c',"from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler; s=ThreadingHTTPServer(('127.0.0.1',0),SimpleHTTPRequestHandler); print(s.server_port,flush=True); s.serve_forever()"],{cwd:require('node:path').resolve(__dirname,'..')});
   server.stderr.on('data',()=>{});
   const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.once('data',d=>resolve(Number(d.toString().trim())))});url=`http://127.0.0.1:${port}`;
  }
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('.cm-editor').waitFor();
  async function setCode(code){await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(code);}
  async function click(lineText,word,control=true){
   const line=page.locator('.cm-line').filter({hasText:lineText}).last();await line.scrollIntoViewIfNeeded();
   const point=await line.evaluate((line,word)=>{
    const offset=line.textContent.indexOf(word),walker=document.createTreeWalker(line,NodeFilter.SHOW_TEXT);let count=0,node;
    while(node=walker.nextNode()){if(count+node.length>offset){const range=document.createRange();range.setStart(node,offset-count);range.setEnd(node,offset-count+1);const box=range.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};}count+=node.length;}
    throw new Error('Token not found');
   },word);
   await page.mouse.move(point.x,point.y);
   if(control){await page.keyboard.down('Control');assert.equal(await page.evaluate(({x,y})=>getComputedStyle(document.elementFromPoint(x,y)).cursor,point),'pointer');}
   await page.mouse.click(point.x,point.y);
   if(control){await page.keyboard.up('Control');assert.equal(await page.locator('.cm-declaration-hover').count(),0);}
  }
  for(const js of [false,true]){
   if(js)await page.locator('[data-language="javascript"]').click();
   const first=js?'const value = 1;':'value = 1',last=js?'console.log(value);':'print(value)',comment=js?'//':'#';
   await setCode(first+'\n'+Array.from({length:90},(_,i)=>`${comment} Spacer ${i}`).join('\n')+'\n'+last);
   await click(last,'value');await page.keyboard.insertText('NAV_TARGET');
   await page.getByText(js?'const NAV_TARGET = 1;':'NAV_TARGET = 1',{exact:true}).waitFor();
   await page.keyboard.press('Control+End');assert((await page.locator('.cm-content').innerText()).includes(last));
   const code=js?'const value=1;\nfunction greet(value){\n  return value;\n}\nconsole.log(greet(value));':'value=1\ndef greet(value):\n    return value\nprint(greet(value))';
   await setCode(code);await click(js?'  return value;':'    return value','value');await page.keyboard.insertText('PARAM_TARGET');
   const content=await page.locator('.cm-content').innerText();assert(content.includes(js?'function greet(PARAM_TARGET)':'def greet(PARAM_TARGET)'));assert(content.startsWith(js?'const value=1;':'value=1'));
   await setCode(code);await click(js?'console.log(greet(value));':'print(greet(value))','greet');await page.keyboard.insertText('FUNCTION_TARGET');
   assert((await page.locator('.cm-content').innerText()).includes(js?'function FUNCTION_TARGET':'def FUNCTION_TARGET'));
   await setCode(code);await click(js?'console.log(greet(value));':'print(greet(value))','value',false);await page.keyboard.insertText('HERE');
   assert((await page.locator('.cm-content').innerText()).includes(js?'const value=1;':'value=1'));
   console.log('PASS '+(js?'JavaScript':'Python')+': Ctrl+click variables/functions/parameters, long-document scrolling and normal click');
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(server)server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
