import {businessClient} from './businessClient.mjs';
import {businessIdentity,businessSessionVersion,originalBusinessEnabled} from './originalBusiness.mjs';
import {validateUploadedTemplate} from './reportTemplateStore.mjs';
export const TRIAL_TEMPLATE_EVENT='dqa:trial-template-bindings';
const identity=()=>`${businessIdentity()?.user?.id||''}:${businessIdentity()?.member?.id||''}`;
function guard(actorId){if(actorId&&businessIdentity()?.member?.id!==actorId)throw Object.assign(Error('登入帳號已變更，請重新開啟。'),{code:'SESSION_CHANGED'});if(!originalBusinessEnabled())throw Error('範本綁定需連接工作區資料庫。');const id=identity(),epoch=businessSessionVersion();return()=>{if(id!==identity()||epoch!==businessSessionVersion())throw Error('登入帳號已變更，已停止下載或儲存。');};}
const messages={TRIAL_TEMPLATE_ACCESS_DENIED:'僅目前指派的執行者可取得本案範本。',TRIAL_TEMPLATE_ADMIN_REQUIRED:'目前帳號沒有綁定試驗範本的管理權限。',TRIAL_TEMPLATE_NOT_FOUND:'範本或試驗已不存在，請重新讀取。',TRIAL_TEMPLATE_FILE_INVALID:'Excel、試驗名稱或完整性驗證不符，未保存。',TRIAL_TEMPLATE_FIELDS_INVALID:'範本欄位或格式無效。',TRIAL_TEMPLATE_REVISION_CONFLICT:'此試驗的綁定已被更新，請重新讀取。',TRIAL_TEMPLATE_OPERATION_CONFLICT:'操作內容不一致，請查詢原操作結果。',TRIAL_TEMPLATE_LIMIT:'工作區最多保存 100 份試驗範本版本。',TRIAL_TEMPLATE_CLAIM_STALE:'下載要求已更新，請重新讀取本案範本。'};
export const trialTemplateMessage=e=>e.outcomeUnknown?'操作結果尚未確認，請查詢結果；不會自動再次送出。':messages[e.code]||e.message;
async function call(path,options){const check=guard();try{const {data}=await businessClient.request('/trial-templates'+path,options);check();return data;}catch(e){try{check();}catch(changed){throw Object.assign(changed,{code:'SESSION_CHANGED',outcomeUnknown:options?.method==='POST'});}throw Object.assign(Error(trialTemplateMessage(e)),{code:e.code,outcomeUnknown:e.outcomeUnknown});}}
const pendingKey=()=>`dqa-trial-template-pending:${identity()}`;
export function pendingTrialTemplate(){try{return JSON.parse(sessionStorage.getItem(pendingKey())||'null');}catch{return null;}}
function clear(key,operation){try{if(JSON.parse(sessionStorage.getItem(key)||'null')?.operation===operation)sessionStorage.removeItem(key);}catch{}}
export async function trialTemplateCatalog(actorId){const check=guard(actorId),data=await call('');if(!Array.isArray(data?.trials)||!Array.isArray(data?.files))throw Error('範本綁定列表資料不完整。');check();return data;}
export async function recoverTrialTemplate(actorId){const check=guard(actorId),key=pendingKey(),p=pendingTrialTemplate();if(!p)return null;const data=await call('/result/'+p.operation);if(data?.id!==p.operation||data.state!=='SAVED')throw Error('操作結果尚未確認，請稍後再查詢；未再次送出。');check();clear(key,p.operation);globalThis.dispatchEvent?.(new Event(TRIAL_TEMPLATE_EVENT));return data;}
export async function saveTrialTemplate({trialId,revision,fileId=null,file,version,actorId}){
 const check=guard(actorId),key=pendingKey();if(pendingTrialTemplate())throw Error('有一筆綁定結果尚未確認，請先查詢操作結果。');
 let payload={trial_id:trialId,expected_revision:revision,file_id:fileId,name:null,version:null,sha256:null,content:null};
 if(file){if(file.size>2*1024*1024)throw Error('試驗範本只接受 2 MB 以下的 .xlsx。');const bytes=new Uint8Array(await file.arrayBuffer());await validateUploadedTemplate(bytes,file.name);check();let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));payload={...payload,file_id:crypto.randomUUID(),name:file.name,version,sha256:await digest(bytes),content:btoa(raw)};}
 else if(fileId){const source=await trialTemplateFile(fileId);check();payload.sha256=source.sha256;}
 check();const operation=crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({operation}));
 try{const data=await call('/save',{method:'POST',retry:false,body:{operation_id:operation,...payload}});if(data?.id!==operation||data.state!=='SAVED')throw Object.assign(Error('操作結果尚未確認。'),{outcomeUnknown:true});clear(key,operation);globalThis.dispatchEvent?.(new Event(TRIAL_TEMPLATE_EVENT));return data;}catch(e){if(!e.outcomeUnknown)clear(key,operation);throw e;}
}
async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
async function decode(data){if(typeof data?.content!=='string'||data.content.length>2796204)throw Error('範本內容不完整。');const bytes=Uint8Array.from(atob(data.content),c=>c.charCodeAt(0));if(bytes.length>2097152||bytes.length!==data.byteLength||await digest(bytes)!==data.sha256)throw Error('範本完整性驗證失敗，已停止下載。');await validateUploadedTemplate(bytes,data.name);return {...data,bytes};}
export async function trialTemplateFile(id,actorId){const check=guard(actorId),data=await decode(await call('/file/'+id));check();return data;}
export async function trialTemplateInbox(actorId){const check=guard(actorId),data=await call('/inbox');check();if(!Array.isArray(data?.rows))throw Error('執行範本清單資料不完整。');return data.rows;}
export async function requestTrialTemplate(documentId,actorId){const check=guard(actorId),data=await call('/request/'+documentId);if(data?.has_template===false){check();return null;}const file=await decode(data);check();return file;}
export async function prepareTrialTemplateDownload(row,{manual=false,actorId}={}){
 const check=guard(actorId),attempt=crypto.randomUUID(),claim=await call('/claim',{method:'POST',retry:false,body:{document_id:row.document_id,attempt,manual}});if(claim.attempt!==attempt)throw Error('下載要求識別不符。');if(!manual&&claim.state!=='CLAIMED')return null;
 if(!['CLAIMED','DISPATCHED','IN_PROGRESS'].includes(claim.state))throw Error('下載要求無法確認。');
 const file=await requestTrialTemplate(row.document_id);check();if(!file||file.id!==row.file_id||file.sha256!==row.sha256||file.document_id!==row.document_id)throw Error('案件或範本版本已更新，請重新讀取。');
 // Record the dispatch request before starting a browser download. This is not proof of a saved file.
 if(claim.state==='CLAIMED'){const ack=await call('/ack',{method:'POST',retry:false,body:{document_id:row.document_id,attempt}});if(ack.state!=='DISPATCHED'||ack.attempt!==attempt)throw Error('下載要求結果尚未確認，請使用手動下載。');}
 check();return {...file,name:`${row.request_code}_${file.name}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_')};
}
