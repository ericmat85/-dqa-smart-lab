// Offline FAQ UI coverage; every API request is rejected by the local test server.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {ASSISTANT_DEMOS} from '../src/assistantDemo.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
const source=path.resolve(new URL('../',import.meta.url).pathname),dist=path.join(source,'dist'),root=path.dirname(source),evidence=path.join(root,'evidence');
let requests=0,browser;const results=[];
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){requests++;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({trace_id:'I-LOCAL-FAQ-NO-PROVIDER',error:{code:'LOCAL_TEST_NETWORK_DISABLED'}}));return;}
 let file=path.resolve(dist,'.'+new URL(req.url,'http://local.test').pathname);if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403);res.end();return;}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.otf':'font/otf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const keys=['dqa-schedules-demo-v1','dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-equipment-demo-v1','dqa-materials-demo-v1','dqa_lab_demo_requests_v1'];
async function setup(system,reducedMotion='reduce',width=1366){
 const context=await browser.newContext({viewport:{width,height:950},reducedMotion});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);
 await page.addInitScript(({accounts,system})=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-'+system+'-account-id',system==='lms'?'DEMO-LEVEL1':'U003');},{accounts:INITIAL_ACCOUNTS,system});
 await page.goto(origin+'/'+system+'/dashboard');await page.locator('.intelligent-launcher').click();return {page,context};
}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const system of ['lms','lab']){
  const {page,context}=await setup(system);const before=requests,business=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),keys);
  for(const item of ASSISTANT_DEMOS){
   await page.locator('.intelligent-examples summary').click();await page.locator('.intelligent-examples button').filter({hasText:item.question}).click();
   const reply=page.locator('.intelligent-conversation article').last().locator('.intelligent-reply');
   await page.waitForFunction(()=>document.querySelector('.intelligent-conversation article:last-child .intelligent-reply')?.getAttribute('aria-busy')==='false');
   const text=await reply.innerText();assert.match(text,/^常見問題解答（非 AI）/);assert.ok(text.length>30);assert.doesNotMatch(text,/真實Provider|LIVE_PROVIDER|3 秒|HTTP 503/);
   results.push({system,faq:item.id,status:'LOCAL_PASS',network_requests:requests-before});
  }
  assert.equal(requests,before,'FAQ must never request Session or Provider');
  assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),keys),business,'FAQ must never write business state');
  if(system==='lms'){
   await page.evaluate(()=>localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify([{id:'SCH-FAQ-SYNTHETIC',requestId:'REQ-2026-001',status:'未排程',quantity:1,title:'合成問答測試'}])));
   await page.getByLabel('輸入問題',{exact:true}).fill(ASSISTANT_DEMOS.find(x=>x.id==='pending').question);await page.getByRole('button',{name:'送出問題',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.intelligent-conversation article:last-child .intelligent-reply')?.textContent.includes('1 筆待排程'));
   results.push({case:'typed exact FAQ reads fresh storage without network',status:'LOCAL_PASS'});
   await page.evaluate(()=>localStorage.setItem('dqa-schedules-demo-v1','not-json'));
   await page.getByLabel('輸入問題',{exact:true}).fill(ASSISTANT_DEMOS.find(x=>x.id==='pending').question);await page.getByRole('button',{name:'送出問題',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.intelligent-conversation article:last-child .intelligent-reply')?.textContent.includes('不能確認數量'));
   assert.equal(requests,before);results.push({case:'unreadable totals refuse zero or invented counts',status:'LOCAL_PASS'});
   await page.getByLabel('輸入問題',{exact:true}).fill('你好');await page.getByRole('button',{name:'送出問題',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.intelligent-conversation article:last-child .intelligent-reply')?.getAttribute('aria-busy')==='false');
   assert.equal(requests,before+1);assert.doesNotMatch(await page.locator('.intelligent-conversation article').last().innerText(),/常見問題解答（非 AI）/);
   results.push({case:'general chat retains API error and never uses FAQ fallback',status:'LOCAL_PASS'});
  }
  await context.close();
 }
 const {page,context}=await setup('lms','no-preference',390);const before=requests;
 await page.locator('.intelligent-examples summary').click();await page.locator('.intelligent-examples button').filter({hasText:ASSISTANT_DEMOS.find(x=>x.id==='pending').question}).click();
 await page.waitForFunction(()=>{const p=document.querySelector('.intelligent-conversation article:last-child .intelligent-reply');return p?.getAttribute('aria-busy')==='true';});
 await page.waitForFunction(()=>{const p=document.querySelector('.intelligent-conversation article:last-child .intelligent-reply');return p?.getAttribute('aria-busy')==='true'&&p.textContent.length>5;});
 await page.screenshot({path:path.join(evidence,'FAQ_MOBILE_TYPING.png')});
 await page.waitForFunction(()=>document.querySelector('.intelligent-conversation article:last-child .intelligent-reply')?.getAttribute('aria-busy')==='false',{},{timeout:15000});
 assert.equal(requests,before);const box=await page.locator('.intelligent-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
 results.push({case:'immediate loading progressive text and mobile panel preserved',status:'LOCAL_PASS'});await context.close();
 fs.writeFileSync(path.join(evidence,'FAQ_BROWSER_RESULTS.json'),JSON.stringify({status:'LOCAL_PASS',faq_answers:40,additional_checks:4,results,paid_ai_calls:0,cloud_e2e:'NOT_TESTED'},null,2)+'\n');
 console.log(JSON.stringify({status:'LOCAL_PASS',faq_answers:40,additional_checks:4,paid_ai_calls:0}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
