import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {memoryStorage} from '../src/guidedTourStorage.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {defaultTrialCatalog,findTrialDefinition,saveTrialDefinition,readTrialCatalog} from '../src/trialCatalogStore.mjs';
import {historicalTrialNames,matchTrialDefinition,correspondingTrialNames} from '../src/trialTemplateMatching.mjs';
import {readCaseTrialTemplate} from '../src/caseTrialTemplate.mjs';
import {excelModule,inspectReport} from '../src/reportWorkbook.mjs';
import {trialProcedure} from '../src/labFormLayout.mjs';
let storage;const access={requestId:'REQ-2026-998',actorId:'U003'};
beforeEach(()=>{storage=memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS)});globalThis.localStorage=storage;});
afterEach(()=>delete globalThis.localStorage);
function source(name='高溫高濕試驗'){return {id:access.requestId,testItems:[name],status:'已排程',productCode:'SYNTH-MATCH',quantity:2,specification:'本案合成規範；不得以範本參考條件取代。',judgementCriteria:'依本案核准來源確認，結果未提供。'};}
function seed(s=source()){storage.setItem('dqa-request-demo-v2',JSON.stringify([s]));return s;}
test('all twenty standard types and every explicit historical name resolve to the matching database identity',()=>{for(const row of defaultTrialCatalog())for(const name of [row.name,...historicalTrialNames(row)])assert.equal(findTrialDefinition(name).id,row.id,name);assert.equal(findTrialDefinition('  esd 靜電 試驗 ').id,'TRIAL-010');assert.equal(findTrialDefinition('ＩＰＸ６ 防水試驗').id,'TRIAL-008');});
test('twenty actual case downloads preserve request data, type, template identity and blank measurements/signatures',async()=>{const Excel=await excelModule();for(const row of defaultTrialCatalog()){
 const s=seed(source(row.name)),before=storage.getItem('dqa-request-demo-v2'),file=await readCaseTrialTemplate(access,storage),book=new Excel.Workbook();await book.xlsx.load(file.bytes);
 assert.equal(file.trial.id,row.id);assert.match(file.name,new RegExp(row.name));const cover=book.getWorksheet('報告首頁');assert.equal(cover.getCell('C12').text,s.testItems[0]);assert.equal(cover.getCell('C16').text,s.productCode);assert.equal(cover.getCell('I16').text,'DQA-'+s.id);assert.equal(cover.getCell('A24').text,s.specification);assert.equal(cover.getCell('A44').text,'');for(const c of ['C55','F55','I55'])assert.equal(cover.getCell(c).text,'');for(const c of ['C12','G12','C16','G16','C20','G20'])assert.equal(book.getWorksheet('結果與照片').getCell(c).text,'');assert.equal(book.getWorksheet('範本資訊').getCell('B4').text,row.id);assert.equal(storage.getItem('dqa-request-demo-v2'),before);
 }});
test('legacy case names download dedicated reports and pass semantic identity checks rather than generic fallbacks',async()=>{const Excel=await excelModule();for(const name of ['高溫儲存試驗','高溫高濕試驗','高低溫循環試驗','振動耐久試驗']){const s=seed(source(name)),file=await readCaseTrialTemplate(access,storage),book=new Excel.Workbook();await book.xlsx.load(file.bytes);assert.equal(book.getWorksheet('報告首頁').getCell('C12').text,name);const check=await inspectReport(file.bytes,s.id,file.name,s);assert.equal(check.checks.find(r=>r.label==='品番與試驗對應委託').ok,true);assert.equal(check.ok,false);assert(!book.getWorksheet('試驗報告'));}});
test('unknown, missing, multiple and ambiguous trial sources stop before workbook construction',async()=>{for(const value of [null,source('不明試驗'),{...source(),testItems:[]},{...source(),testItems:['高溫試驗','振動試驗']}]){storage.setItem('dqa-request-demo-v2',JSON.stringify(value?[value]:[]));await assert.rejects(readCaseTrialTemplate(access,storage,{build:()=>assert.fail('must not build an unrelated template')}),/找不到|單一試驗/);}assert.equal(findTrialDefinition('IPX5 防水'),null);assert.equal(findTrialDefinition('高溫高濕XYZ'),null);const list=defaultTrialCatalog();assert.throws(()=>matchTrialDefinition('ESD 靜電',[...list,{...list[0],id:'OTHER',name:'ＥＳＤ靜電'}]),/多個範本/);});
test('catalog renames retain case matching and powered-operation procedure remains distinct from storage',()=>{const row=defaultTrialCatalog()[19];saveTrialDefinition({...row,name:'合成高溫通電運作'},INITIAL_ACCOUNTS.find(a=>a.id==='U001'),{storage,expectedRevision:0});assert.equal(findTrialDefinition('高溫運作試驗').id,row.id);assert.equal(findTrialDefinition('高溫運轉試驗').id,row.id);assert.equal(findTrialDefinition('高溫儲存試驗').id,'TRIAL-001');assert.match(trialProcedure(readTrialCatalog().rows[19])[0],/通電/);});
test('source, catalog, assignment changes and revoked access during generation stop the download',async()=>{
 seed();await assert.rejects(readCaseTrialTemplate(access,storage,{build:async()=>{seed({...source(),specification:'來源已更新'});return new Uint8Array([1]);}}),/已更新/);
 seed();await assert.rejects(readCaseTrialTemplate(access,storage,{build:async()=>{const row=readTrialCatalog().rows[2];saveTrialDefinition({...row,version:'NEW'},INITIAL_ACCOUNTS.find(a=>a.id==='U001'),{storage,expectedRevision:0});return new Uint8Array([1]);}}),/已更新/);
 seed();await assert.rejects(readCaseTrialTemplate(access,storage,{build:async()=>{storage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS.map(a=>a.id===access.actorId?{...a,status:'已停用'}:a)));return new Uint8Array([1]);}}),/權限/);
});
test('receipt download uses approved schedule facts and tolerates the existing execution projection update',async()=>{
 const s=seed(),schedule={id:'SCH-MATCH',requestId:s.id,reservationId:'R1',time:'2026-12-01T09:00',end:'2026-12-12T09:00',eq:'合成濕控試驗箱',owner:'合成工程師',sampleCode:'SYNTH-SAMPLE'};
 storage.setItem('dqa-schedules-demo-v1',JSON.stringify([schedule]));storage.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{id:s.id,scheduleId:schedule.id,reservationId:'R1',scheduledStart:schedule.time,scheduledEnd:schedule.end,acceptedAt:'2026-11-18T00:00:00Z',status:'已排程'}]));
 await readCaseTrialTemplate(access,storage,{build:async input=>{assert.equal(input.execution.sampleCode,'SYNTH-SAMPLE');assert.equal(input.execution.equipment,schedule.eq);seed({...s,status:'已排程',execution:{...input.execution,status:'已排程',acceptedAt:'2026-11-18'},executionHistory:[{id:'PROJECTION'}]});return new Uint8Array([1]);}});
 await assert.rejects(readCaseTrialTemplate(access,storage,{build:async()=>{storage.setItem('dqa-schedules-demo-v1',JSON.stringify([{...schedule,reservationId:'R2'}]));return new Uint8Array([1]);}}),/不一致/);
});
test('cancellation and corrupted sources never download or overwrite current business records',async()=>{seed();const controller=new AbortController();await assert.rejects(readCaseTrialTemplate(access,storage,{signal:controller.signal,build:async()=>{controller.abort();return new Uint8Array([1]);}}),{name:'AbortError'});storage.setItem('dqa-request-demo-v2','{broken');await assert.rejects(readCaseTrialTemplate(access,storage),/來源資料/);assert.equal(storage.getItem('dqa-request-demo-v2'),'{broken');});

test('explicit custom definitions override legacy fallback and the library never advertises another template alias',()=>{const base=defaultTrialCatalog()[0],admin=INITIAL_ACCOUNTS.find(a=>a.id==='U001');const custom=saveTrialDefinition({...base,id:undefined,name:'高溫儲存試驗',profileId:'UNVERIFIED'},admin,{storage,expectedRevision:0});assert.equal(findTrialDefinition('高溫儲存試驗').id,custom.id);const catalog=readTrialCatalog().rows;assert(!correspondingTrialNames(catalog[0],catalog).includes('高溫儲存試驗'));assert.equal(findTrialDefinition('高溫運作試驗').id,'TRIAL-020');});

test('database template requires a received booking assigned to the current executor',async()=>{
 const s=seed({...source(),businessDatabase:true}),schedule={id:'SCH-DATABASE',requestId:s.id,reservationId:'DB-RESERVATION',time:'2026-12-01T00:00:00+08:00',end:'2026-12-12T00:00:00+08:00',eq:'資料庫指定設備',owner:'指定執行人',sampleCode:'SAMPLE-DATABASE'};
 storage.setItem('dqa-schedules-demo-v1',JSON.stringify([schedule]));
 const receipt={id:s.id,scheduleId:schedule.id,reservationId:schedule.reservationId,scheduledStart:schedule.time,scheduledEnd:schedule.end,executorId:access.actorId};
 storage.setItem('dqa_lab_demo_requests_v1',JSON.stringify([receipt]));
 await assert.rejects(readCaseTrialTemplate(access,storage),/確認接收/);
 storage.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{...receipt,acceptedAt:'2026-11-23T00:00:00Z',executorId:'OTHER'}]));
 await assert.rejects(readCaseTrialTemplate(access,storage),/執行人員/);
 storage.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{...receipt,acceptedAt:'2026-11-23T00:00:00Z'}]));
 await readCaseTrialTemplate(access,storage,{build:async input=>{assert.equal(input.execution.sampleCode,'SAMPLE-DATABASE');assert.equal(input.execution.equipment,'資料庫指定設備');return new Uint8Array([1]);}});
 await assert.rejects(readCaseTrialTemplate(access,storage,{build:async()=>{storage.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{...receipt,acceptedAt:'2026-11-23T00:00:00Z',executorId:'OTHER'}]));return new Uint8Array([1]);}}),/執行人員/);
});
