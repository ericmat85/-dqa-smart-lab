import catalog from '../render-backend/gateway/e4_demo_catalog.json' with {type:'json'};
import {readLabSnapshot,deriveLabMetrics} from './labData.mjs';
const modules=['requests','schedules','equipment','materials','electronic','labWorkItems','borrows','labOperations','labAudit','reports'];
const statuses=new Set(['未排程','已排程','試驗中','進行中','暫停中','已完成','完成','有衝突','取消','已取消','待核准','待確認','待審查','審查完成','已結案','退回補正','待補件','已退回','草稿','待送簽','已核准','待機中','使用中','維護中','校驗中','停用','缺料','可用','借出']);
const safeId=value=>typeof value==='string'&&/^(?:REQ-\d{4}-(?:\d{3}|[a-f0-9]{8})|SCH-[A-Za-z0-9-]{1,32}|EQ-\d{3}|MAT-\d{3})$/.test(value)?value:null;
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export function readE4CurrentData(snapshot,metrics,system,storage,now=Date.now()){
 if(system!=='lms')return {snapshot,metrics};
 const fresh=readLabSnapshot(storage,now);
 return {snapshot:{...fresh,reports:snapshot?.reports},metrics:deriveLabMetrics(fresh,now)};
}
function project(kind,row){
 const id=safeId(row?.id);if(!id)return null;
 const fields={};const approved=catalog[kind]?.[id]||{};
 for(const [k,v] of Object.entries(approved))if(row[k]===v)fields[k]=v;
 for(const k of ['quantity','available','minStock']){const n=typeof row[k]==='number'?row[k]:typeof row[k]==='string'&&/^\d{1,6}$/.test(row[k])?Number(row[k]):null;if(Number.isFinite(n)&&n>=0&&n<=100000)fields[k]=n;}
 for(const k of ['time','end'])if(typeof row[k]==='string'&&/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d)?$/.test(row[k]))fields[k]=row[k];
 if(safeId(row.requestId))fields.requestId=row.requestId;
 return {kind,id,status:statuses.has(row.status)?row.status:'UNKNOWN',fields};
}
// Only projections of the supplied page snapshot are read; no storage writes or remote tools.
export function makeE4ReadonlyContext(question,snapshot,metrics,system,now=Date.now()){
 if(system!=='lms'||!snapshot||!/(目前|現在|委託|試驗|設備|排程|物料|報告|借用|狀況|多少|幾|哪些|這筆|上述|剛剛|剛才|所有|系統|REQ-\d{4}|EQ-\d|MAT-\d|SCH-|how many|current|requests|trials|equipment|schedules|reports|materials)/i.test(question))return undefined;
 const observed=Number(snapshot.observedAt);if(!Number.isSafeInteger(observed)||observed>now+60000||now-observed>300000)throw Error('資料快照尚未就緒或已過期，請重新整理資料後再詢問。');
 const sources=new Map((snapshot.sources||[]).map(x=>[x.id,x]));
 const context={version:1,source:'BROWSER_DEMO_READONLY',observed_at:observed,intent:/報告/.test(question)&&/(生成|製作|產生|草稿|撰寫|寫一份|幫我寫)/.test(question)?'REPORT_DRAFT':'LOOKUP',totals:{},coverage:{},schedule_status:{},state_counts:{},items:[],selection:{matched:0,shown:0,complete:true}};
 for(const key of modules){
  const invalid=!!sources.get(key)?.error||(key==='requests'&&(sources.get('reviews')?.error||sources.get('electronic')?.error));
  const rows=snapshot[key];context.coverage[key]=invalid||!Array.isArray(rows)?'UNAVAILABLE':key==='reports'?'INDEX_ONLY':'COMPLETE';
  context.totals[key]=context.coverage[key]==='COMPLETE'?new Set(rows.map(x=>x?.id).filter(x=>typeof x==='string')).size:null;
 }
 const formsComplete=context.coverage.requests==='COMPLETE'&&context.coverage.electronic==='COMPLETE';
 context.coverage.commission_forms=formsComplete?'COMPLETE':'UNAVAILABLE';
 context.totals.commission_forms=formsComplete?new Set([...snapshot.requests,...snapshot.electronic].map(row=>row?.id).filter(id=>typeof id==='string')).size:null;
 for(const [s,n] of Object.entries(metrics?.counts||{}))if(statuses.has(s)&&Number.isSafeInteger(n)&&n>=0&&n<=100000)context.schedule_status[s]=n;
 if(context.coverage.schedules!=='COMPLETE')context.schedule_status={};
 const statusKinds=context.intent==='REPORT_DRAFT'?[]:/設備/.test(question)?['equipment']:/物料|庫存/.test(question)?['materials']:/借用/.test(question)?['borrows']:/中斷|取消申請/.test(question)?['labOperations']:/委託/.test(question)?['requests']:[];
 for(const kind of statusKinds)if(context.coverage[kind]==='COMPLETE'){
  const unique=new Map(snapshot[kind].map(row=>[row.id,row]));const counts={};
  for(const row of unique.values()){const status=statuses.has(row.status)?row.status:'UNKNOWN';counts[status]=(counts[status]||0)+1;}
  context.state_counts[kind]=counts;
 }
 const id=question.match(/\b(?:REQ-\d{4}-(?:\d{3}|[a-f0-9]{8})|EQ-\d{3}|MAT-\d{3}|SCH-[A-Za-z0-9-]+)\b/)?.[0];
 let kinds=context.intent==='REPORT_DRAFT'?['requests']:id?['requests','schedules','equipment','materials']:/設備/.test(question)?['equipment']:/物料|庫存/.test(question)?['materials']:/排程|試驗/.test(question)?['schedules','requests']:['requests'];
 const desiredStatus=[...statuses].sort((a,b)=>b.length-a.length).find(s=>question.includes(s))||(/待機|可用設備/.test(question)?'待機中':null);
 const candidates=kinds.flatMap(kind=>context.coverage[kind]!=='COMPLETE'?[]:(kind==='schedules'?(metrics?.schedules||snapshot[kind]):snapshot[kind]).filter(row=>(!id||row.id===id||row.requestId===id)&&(!desiredStatus||id||row.status===desiredStatus)).map(row=>project(kind,row)).filter(Boolean));
 const listRequested=!!id||/哪些|列出|明細|清單|報告/.test(question);context.selection.matched=listRequested?candidates.length:0;
 if(listRequested)context.items=candidates.slice(0,3);
 if(context.intent==='REPORT_DRAFT'){
  if(!id?.startsWith('REQ-'))throw Error('請在聊天中指定委託編號，例如「製作 REQ-2026-001 的報告草稿」。');
  if(!context.items.some(x=>x.kind==='requests'&&x.id===id))throw Error('目前可讀資料沒有這筆委託，無法製作報告草稿。');
 }
 const update=()=>{context.selection.shown=context.items.length;context.selection.complete=context.selection.shown===context.selection.matched;};update();
 while(bytes(context)>2800&&context.items.length>0){
  if(context.intent==='REPORT_DRAFT'&&context.items.length===1)throw Error('報告必要資料超過安全摘要上限；未截斷關鍵證據。');
  context.items.pop();update();
 }
 if(bytes(context)>2800)throw Error('唯讀摘要超過安全上限；未送出模型。');
 return context;
}
