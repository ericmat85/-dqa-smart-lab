import {createHash} from 'node:crypto';import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const allowed=new Map([['electronic','dqa-request-demo-v2'],['reviews','dqa-lms-reviews-v1'],['schedules','dqa-schedules-demo-v1'],['equipment','dqa-equipment-demo-v1'],['materials','dqa-materials-demo-v1'],['borrows','dqa-borrow-requests-v1'],['labOperations','dqa-lab-operations-v1'],['labWorkItems','dqa_lab_demo_requests_v1'],['labAudit','dqa_lab_demo_audit_v1'],['trialCatalog','dqa-trial-catalog-v1'],['cancellations','dqa-cancelled-requests-v1'],['adminOperations','dqa-admin-operations-v1']]);
function hasRestrictedFields(value){if(!value||typeof value!=='object')return false;return Object.entries(value).some(([k,v])=>/password|passwd|token|secret|cookie|signature|attachment|base64|dataurl|session|bearer/i.test(k)||['__proto__','constructor','prototype','bytes','file','files','image','images','photo','photos','pdf','workbook'].includes(k.toLowerCase())||hasRestrictedFields(v));}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function inspect(bundle){
 if(bundle?.format!=='DQA_BUSINESS_EXPORT_V1'||!bundle.payload||bundle.sha256!==hash(bundle.payload))throw Error('EXPORT_INTEGRITY_MISMATCH');
 const p=bundle.payload;if(p.version!==1||!['DQA_BROWSER_BUSINESS_EXPORT','DQA_BUILTIN_DEMO_BUSINESS_EXPORT'].includes(p.kind)||!Array.isArray(p.collections)||p.binary_files_included!==false||p.credentials_included!==false||p.cloud_import_performed!==false)throw Error('EXPORT_SCHEMA_INVALID');
 const issues=[],seen=new Set(),groups=Object.create(null),summary=[];
 for(const c of p.collections){
  if(!c||allowed.get(c.name)!==c.key||seen.has(c.name)||!Array.isArray(c.rows)||c.rows.length>20000||c.sha256!==hash(c.rows)||c.row_count!==c.rows.length)throw Error('COLLECTION_INTEGRITY_MISMATCH');
  if(hasRestrictedFields(c.rows))throw Error('RESTRICTED_FIELDS_NOT_ALLOWED');
  seen.add(c.name);groups[c.name]=c.rows;summary.push({name:c.name,rows:c.rows.length,omitted_fields:c.omitted_fields.length});
  const ids=new Set();for(const row of c.rows){if(!row||typeof row!=='object'||Array.isArray(row)){issues.push({collection:c.name,code:'INVALID_ROW'});continue;}if(row.id){if(ids.has(row.id))issues.push({collection:c.name,id:row.id,code:'DUPLICATE_ID'});ids.add(row.id);}}
 }
 const issue=(collection,row,code)=>issues.push({collection,id:row.id||null,code});
 for(const row of groups.equipment||[]){const u=Object.hasOwn(row,'spaceUnits')?row.spaceUnits:row.capacity;if(u===null||u===undefined||String(u).trim()===''||!Number.isSafeInteger(Number(u))||Number(u)<1||Number(u)>100000)issue('equipment',row,'SPACE_U_REQUIRED_NO_LITRE_CONVERSION');}
 for(const row of groups.materials||[]){const n=Number(row.quantity),a=Number(row.available);if(!Number.isFinite(n)||!Number.isFinite(a)||n<0||a<0||a>n)issue('materials',row,'STOCK_INVARIANT');if(typeof row.unit!=='string'||!row.unit.trim())issue('materials',row,'UNIT_REQUIRED');}
 const requestIds=new Set([...(groups.electronic||[]),...(groups.reviews||[])].map(r=>r.id));
 for(const row of groups.schedules||[]){if(row.requestId&&!requestIds.has(row.requestId))issue('schedules',row,'REQUEST_REFERENCE_UNRESOLVED');if(row.status&&!['DRAFT','草稿','未排程'].includes(row.status))issue('schedules',row,'WORKFLOW_STATE_REQUIRES_EXPLICIT_MIGRATION_POLICY');}
 for(const name of ['electronic','reviews'])for(const row of groups[name]||[]){if(row.status&&!['DRAFT','草稿'].includes(row.status))issue(name,row,'WORKFLOW_STATE_REQUIRES_EXPLICIT_MIGRATION_POLICY');}
 for(const [name,rows] of Object.entries(groups))for(const row of rows)if(['actorId','ownerId','executorId','requesterId','accountId','personId','supervisorId'].some(k=>typeof row[k]==='string'&&row[k]))issue(name,row,'LEGACY_ACTOR_MAPPING_REQUIRED');
 const multi=new Set((groups.reviews||[]).map(r=>r.id));for(const row of groups.electronic||[])if(multi.has(row.id))issue('electronic',row,'REQUEST_SOURCES_OVERLAP_REVIEW_REQUIRED');
 return {status:issues.length?'REVIEW_REQUIRED':'STRUCTURE_CHECK_PASS',source_kind:p.kind,source_origin:p.source_origin,source_sha256:bundle.sha256,collections:summary,issues,write_performed:false,promotion_allowed:false,workflow_gate:'RULE_NOT_APPROVED',note:'僅檢查匯出結構與必要來源資料，不代表設備相容、正式簽名、檔案、身分或業務規則已完成驗收。未對雲端寫入。'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [file,out]=process.argv.slice(2);if(!file||!out)throw Error('Usage: node preflight.mjs input.json result.json');const raw=await readFile(file);if(raw.length>10485760)throw Error('EXPORT_TOO_LARGE');const result=inspect(JSON.parse(raw));await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,collections:result.collections.length,issues:result.issues.length,write_performed:false}));}
