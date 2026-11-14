import {getSignatureHistory} from './signatureHistory.mjs';
import {getReport} from './reportStore.mjs';
import {readReportWorkbook} from './reportWorkbookView.mjs';
import {inspectReport} from './reportWorkbook.mjs';
import {canReadReport} from './reportRules.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
function signatureImage(value){if(typeof value!=='string'||value.length>2800000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;try{const raw=atob(value.split(',')[1]);return raw.startsWith('\x89PNG\r\n\x1a\n')||raw.startsWith('\xff\xd8\xff');}catch{return false;}}
const present=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
export function reviewE1Request(request,{report=null}={}){
 if(!request?.id)throw Error('缺少委託來源，無法審查。');const checks=[];
 const check=(scope,title,ok,detail)=>checks.push({scope,title,status:ok===null?'UNKNOWN':ok?'PASS':'ISSUE',detail});
 for(const [title,value]of [['產品代碼',request.productCode||request.product],['產品類型',request.productType],['試驗項目',request.title||request.testItems?.join('、')],['試驗規範／手法',request.specification||request.testSpec],['判定基準',request.judgment||request.judgementCriteria],['需求日期',request.requestedDate||request.dueDate]])check('REQUEST',title,present(value),present(value)?'已提供':'來源欄位未填寫');
 check('REQUEST','樣品數量',Number.isSafeInteger(Number(request.quantity))&&Number(request.quantity)>0,'須為正整數，未代填數量。');
 const signatures=getSignatureHistory(request);check('SIGNATURE','簽名歷程',signatures.length?true:null,signatures.length?'已取得本機簽名紀錄':'尚無可核對的簽名證據');
 const seen=new Set();for(const [i,s]of signatures.entries()){
  check('SIGNATURE',`第 ${i+1} 筆簽名欄位`,!!s.actorId&&Number.isFinite(Date.parse(s.at||''))&&signatureImage(s.signature),'核對簽署人識別、時間及圖片格式；未驗證筆跡或憑證真偽。');
  if(typeof s.stage==='number'&&s.decision==='核准'){const token=s.actorId;check('SIGNATURE',`第 ${i+1} 筆跨階重複`,token?(!seen.has(token)&&![request.ownerId,request.supervisorId].includes(token)):null,'原有禁止自審與跨階簽核規則持續由系統執行。');if(token)seen.add(token);}
 }
 if(report){check('REPORT','報告與委託關聯',report.requestId===request.id,'核對委託編號。');for(const c of report.check?.checks||[])check('REPORT',c.label,typeof c.ok==='boolean'?c.ok:null,c.detail||'已保存的檔案檢查摘要。');}
 const issues=checks.filter(c=>c.status!=='PASS');return {engine:'E1',mode:'RULE_BASED_ONLY',real_ai:false,provider:'NONE',provider_status:'E1_PROVIDER_NOT_ENABLED',trace_id:'I-'+crypto.randomUUID().replaceAll('-',''),requestId:request.id,createdAt:new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),checks,checkedFields:checks.length,findings:issues.map(c=>({level:c.status==='ISSUE'?'error':'warning',title:c.title,detail:c.detail,scope:c.scope})),summary:`已查核 ${checks.length} 項來源欄位，${issues.length} 項需確認；未呼叫 AI 模型。`,writes:'NONE',signature_authenticity:'NOT_VERIFIED'};
}
export async function reviewE1Report({actorId,requestId,expectedRevision},storage=globalThis.localStorage,repository={get:getReport}){
 const report=await repository.get(requestId),file=await readReportWorkbook({actorId,requestId,expectedRevision},storage,repository);
 const inspection=await inspectReport(file.bytes,requestId,file.fileName,file.request),result=reviewE1Request(file.request,{report:{...report,check:inspection}});
 // File parsing can be asynchronous; recheck the latest source and permission before returning findings.
 const latest=await repository.get(requestId),accounts=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||JSON.stringify(INITIAL_ACCOUNTS)),requests=JSON.parse(storage.getItem('dqa-request-demo-v2')||'[]'),actor=accounts.find(a=>a.id===actorId),request=requests.find(r=>r.id===requestId);
 if(latest?.revision!==file.revision||!canReadReport(actor,latest,request,storage))throw Error('報告版本或查閱權限已變更，請重新開啟審查。');return result;
}
