import {explicitHours,sourceConditions} from './trialSourceFacts.mjs';
import schema from '../render-backend/gateway/lab_context_schema.json' with {type:'json'};
import {readTrialCatalog} from './trialCatalogStore.mjs';
import {equipmentSpaceUnits} from './equipmentSpace.mjs';
import {readE2Settings} from './e2PlanningSettings.mjs';
import {readE2Activity,summarizeE2Activity} from './e2Activity.mjs';
import {readE4Activity,summarizeE4Activity} from './e4Activity.mjs';
const unsafe=new RegExp(schema.unsafe_text,'i'),id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v)&&!unsafe.test(v);
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
function fieldsFor(kind,row){
 const title=row.title||row.testItems?.join('、'),specification=row.specification||row.testSpec,judgment=row.judgment||row.judgementCriteria||row.acceptance;
 const known={...row,title,specification,judgment,time:row.time||row.borrowDate||row.dueDate,end:row.end||row.returnDate,reason:row.reason||row.returnReason,action:row.action||row.type};
 if(kind==='equipment')known.spaceUnits=equipmentSpaceUnits(row);
 if(kind==='reports')known.checkSummary=(row.check?.checks||[]).map(c=>`${c.label||c.name||'欄位'}：${c.ok?'檢查通過':'待確認'}`).join('；');
 let parsedConditions;try{if(known.durationHours===undefined)known.durationHours=explicitHours(known)??undefined;const parsed=sourceConditions(known);if(parsed.supplied)parsedConditions=JSON.stringify(parsed.conditions);}catch{/* Keep invalid source text as text; never invent numeric conditions. */}
 if(parsedConditions)known.conditions=parsedConditions;
 const fields={},omitted=[];
 for(const key of schema.fields_by_module[kind]||[]){
  const value=known[key];if(value===undefined||value===null||value==='')continue;
  if(schema.number_fields.includes(key)){const n=Number(value);if(Number.isFinite(n)&&n>=0&&n<=100000)fields[key]=n;else omitted.push(key);}
  else if(typeof value==='string'&&value.length<=schema.max_text_chars&&!unsafe.test(value)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fields[key]=value;
  else omitted.push(key);
 }
 return {fields,omitted};
}
function labSources(snapshot,metrics,storage){
 const unavailable=new Set((snapshot.sources||[]).filter(s=>s.error).map(s=>s.id)),sources={};
 for(const kind of schema.modules.filter(k=>!['commission_forms','trialCatalog','planningSettings','aiObservations'].includes(k))){
  const rows=kind==='schedules'?(metrics?.schedules||snapshot.schedules):snapshot[kind];
  const bad=unavailable.has(kind)||kind==='requests'&&(unavailable.has('reviews')||unavailable.has('electronic'));
  sources[kind]={rows:!bad&&Array.isArray(rows)?rows:[],coverage:bad||!Array.isArray(rows)?'UNAVAILABLE':kind==='reports'?'METADATA_ONLY':'COMPLETE'};
 }
 // Electronic forms contain the current source specification; merge by id, never sum overlap.
 if(sources.requests.coverage==='COMPLETE'&&sources.electronic.coverage==='COMPLETE')sources.requests.rows=[...new Map([...sources.requests.rows,...sources.electronic.rows].map(row=>[row.id,row])).values()];
 try{sources.trialCatalog={rows:readTrialCatalog(storage).rows,coverage:'COMPLETE'};}catch{sources.trialCatalog={rows:[],coverage:'UNAVAILABLE'};}
 try{const p=readE2Settings(storage).settings;sources.planningSettings={rows:[{id:'E2-PLANNING',name:'AI 排程偏好',configuration:`新請求${p.enabled?'允許':'暫停'}；搜尋上限 ${p.searchDays} 天；準備 ${p.preparationMinutes} 分鐘；清理 ${p.cleanupMinutes} 分鐘；限目前瀏覽器。`}],coverage:'COMPLETE'};}catch{sources.planningSettings={rows:[],coverage:'UNAVAILABLE'};}
 const accountId=globalThis.sessionStorage?.getItem('dqa-lms-account-id');
 if(accountId){const e2=summarizeE2Activity(readE2Activity(accountId)),e4=summarizeE4Activity(readE4Activity('lms',accountId));sources.aiObservations={coverage:'METADATA_ONLY',rows:[{id:'MONITOR-E2',name:'AI 排程觀察',usageSummary:`本帳號本分頁：請求 ${e2.requests}、處理中 ${e2.pending}、失敗 ${e2.errors}；Provider 已知回應 ${e2.live.count}，估算 USD ${e2.live.costUsd??'未確認'}；非正式帳本。`},{id:'MONITOR-E4',name:'AI 助理觀察',usageSummary:`本帳號本分頁：請求 ${e4.requests}、處理中 ${e4.pending}、失敗 ${e4.errors}；非全站監控。`}]};}
 else sources.aiObservations={coverage:'UNAVAILABLE',rows:[]};
 return sources;
}
export function makeE4LabContext(question,snapshot,metrics,system,now=Date.now(),storage=globalThis.localStorage,contextHint=[]){
 if(system!=='lms'||!snapshot)return undefined;
 let catalogHint=false;try{catalogHint=readTrialCatalog(storage).rows.some(r=>[r.name,...r.aliases].some(name=>question.includes(name)));}catch{/* Coverage below records unavailable catalog. */}
 if(!catalogHint&&!/目前|現在|系統|委託|試驗|測試|設備|機台|排程|物料|庫存|報告|借用|中斷|操作|多少|幾|哪些|列出|規範|手法|條件|所有|全部|監控|用量|偏好|REQ-|EQ-|MAT-|SCH-|TRIAL-|current|how many|equipment|schedule|reports?|materials?/i.test(question))return undefined;
 const observed=Number(snapshot.observedAt);if(!Number.isSafeInteger(observed)||now-observed>300000||observed>now+60000)throw Error('資料快照尚未就緒或已過期，請重新整理後再詢問。');
 const sources=labSources(snapshot,metrics,storage);
 if(/這|那|上述|剛|同一|該|它/.test(question)){const candidates=[...contextHint].reverse();const prior=candidates.find(text=>/REQ-|EQ-|MAT-|SCH-|TRIAL-/.test(text)||sources.trialCatalog.rows.some(r=>text.includes(r.name)));if(prior)question+=' '+prior;}
 const req=question.match(/\bREQ-\d{4}-(?:\d{3}|[a-f0-9]{8})\b/)?.[0];
 const draft=/報告/.test(question)&&/製作|生成|產生|草稿|撰寫|寫一份|幫我寫/.test(question);
 if(draft&&!req)throw Error('請指定委託編號後再製作報告草稿。');
 const identifiers=Object.values(sources).flatMap(s=>s.rows.map(r=>r.id||r.requestId)).filter(id),specific=identifiers.filter(v=>question.toLowerCase().includes(v.toLowerCase()));
 const catalogMatches=sources.trialCatalog.rows.filter(r=>[r.name,...r.aliases].some(name=>question.includes(name))).sort((a,b)=>b.name.length-a.name.length);
 let kinds=draft?['requests']:specific.length?['requests','schedules','equipment','materials','reports','labWorkItems','borrows','labOperations','labAudit','trialCatalog']:/監控|用量/.test(question)?['aiObservations']:/偏好|設定/.test(question)&&/排程/.test(question)?['planningSettings']:catalogMatches.length||/試驗(?:資訊|項目|目錄|規範|條件|種類)|(?:種|項)試驗|規範|手法|試驗類型/.test(question)?['trialCatalog']:/報告/.test(question)?['reports']:/借用/.test(question)?['borrows']:/中斷|取消申請/.test(question)?['labOperations']:/操作|歷程/.test(question)?['labAudit']:/設備|機台/.test(question)?['equipment']:/物料|庫存/.test(question)?['materials']:/委託/.test(question)?['requests']:/試驗|排程/.test(question)?['schedules']:Object.keys(sources);
 if(req&&/報告(?:狀態|審核|檢查)/.test(question)&&!draft)kinds=['reports'];
 const overview=/多少|幾|總覽|概況|所有資訊|所有資料|系統資訊/.test(question)&&!specific.length&&!catalogMatches.length&&!draft;
 const context={version:2,source:'BROWSER_LAB_READONLY',observed_at:observed,intent:draft?'REPORT_DRAFT':'LOOKUP',totals:{},coverage:{},state_counts:{},items:[],selection:{matched:0,offset:0,shown:0,complete:true,next_offset:null,omitted_fields:[]}};
 for(const kind of overview?Object.keys(sources):kinds){const src=sources[kind];context.coverage[kind]=src.coverage;context.totals[kind]=src.coverage==='UNAVAILABLE'?null:new Set(src.rows.map(r=>r.id||r.requestId).filter(id)).size;}
 if(context.totals.requests!==undefined){context.totals.commission_forms=context.totals.requests;context.coverage.commission_forms=context.coverage.requests;}
 if(overview){
  for(const kind of kinds){if(context.coverage[kind]==='UNAVAILABLE')continue;const counts={};for(const row of new Map(sources[kind].rows.map(r=>[r.id||r.requestId,r])).values()){const status=schema.statuses.includes(row.status)?row.status:'UNKNOWN';counts[status]=(counts[status]||0)+1;}if(Object.keys(counts).length<=40)context.state_counts[kind]=counts;}
  if(bytes(context)>schema.max_context_bytes)throw Error('總覽摘要超過安全上限，請指定資料類型。');return context;
 }
 const status=question.match(/未排程|已排程|試驗中|已完成|待機中|維護中|校驗中|有衝突|缺料/)?.[0];
 let rows=kinds.flatMap(kind=>sources[kind].rows.map(row=>({kind,row}))).filter(({row})=>!specific.length||specific.includes(row.id)||specific.includes(row.requestId));
 if(catalogMatches.length&&!specific.length){const best=catalogMatches[0].name;rows=rows.filter(x=>x.kind!=='trialCatalog'||x.row.name===best);}
 if(status)rows=rows.filter(({row})=>row.status===status);
 if(draft)rows=rows.filter(({kind,row})=>kind==='requests'&&row.id===req);
 const offsetMatch=question.match(/從第\s*(\d+)\s*筆/),page=question.match(/第\s*(\d+)\s*頁/),offset=offsetMatch?Math.max(0,Number(offsetMatch[1])-1):page?Math.max(0,Number(page[1])-1)*10:0;
 context.selection.matched=rows.length;context.selection.offset=Math.min(offset,rows.length);
 const listing=/清單|列出|哪些|目錄|項目/.test(question)&&!/規範|手法|全文|條件/.test(question);
 for(const {kind,row} of rows.slice(offset,offset+schema.max_items)){
  const identifier=row.id||row.requestId;if(!id(identifier))continue;
  let {fields,omitted}=fieldsFor(kind,row);
  if(/工時|多久|幾小時|時長/.test(question)&&!/規範|手法|全文/.test(question))fields=Object.fromEntries(Object.entries(fields).filter(([key])=>['name','title','durationHours','version','profileId','equipment','calendar'].includes(key)));
  else if(/可用空間|多少.*U|容量/.test(question)&&/設備|機台|EQ-/.test(question)&&!/規格|資訊|全文/.test(question))fields=Object.fromEntries(Object.entries(fields).filter(([key])=>['name','model','spaceUnits','dailyHours','nextCalibration'].includes(key)));
  else if(/條件/.test(question)&&!/規範|手法|全文/.test(question))fields=Object.fromEntries(Object.entries(fields).filter(([key])=>['name','title','conditions','durationHours','version','profileId','equipment'].includes(key)));
  if(listing)fields=Object.fromEntries(Object.entries(fields).filter(([k])=>['name','title','spaceUnits','available','unit'].includes(k)));
  const item={kind,id:identifier,...(row.status!==undefined?{status:schema.statuses.includes(row.status)?row.status:'UNKNOWN'}:{}),fields};
  const previous=[...context.selection.omitted_fields];context.selection.omitted_fields.push(...omitted.map(f=>kind+'.'+f).slice(0,10));context.items.push(item);
  if(bytes(context)>schema.max_context_bytes){context.items.pop();context.selection.omitted_fields=previous;break;}
 }
 context.selection.omitted_fields=[...new Set(context.selection.omitted_fields)].slice(0,20);
 context.selection.shown=context.items.length;context.selection.complete=offset+context.items.length>=rows.length;context.selection.next_offset=context.selection.complete?null:offset+context.items.length;
 if(draft&&!context.items.some(x=>x.kind==='requests'&&x.id===req))throw Error('沒有可讀取的委託內容，或必要規範超過單次摘要上限；未截斷報告證據。');
 if(rows.length&&!context.items.length)throw Error('這筆資料超過單次安全摘要上限，請指定要查詢的條件、工時或資訊範圍；未截斷原始資料。');
 if(bytes(context)>schema.max_context_bytes)throw Error('查詢摘要超過安全上限，請縮小查詢範圍。');
 return context;
}
