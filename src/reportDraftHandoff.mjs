import {appStorage} from './originalBusiness.mjs';
import {authorizeE3Export} from './e3ReportDraft.mjs';
let pending=null;
export function stageReportDraftHandoff(requestId,{storage=appStorage(),session=globalThis.sessionStorage,now=Date.now()}={}){
 if(!/^REQ-\d{4}-(?:\d{3}|[a-f0-9]{8})$/.test(requestId||''))throw Error('報告委託編號無法核對。');const actor=authorizeE3Export(storage,session);pending={requestId,actor,at:now};return {...pending};
}
export function takeReportDraftHandoff({storage=appStorage(),session=globalThis.sessionStorage,now=Date.now()}={}){
 if(!pending)return null;const value=pending;pending=null;const actor=authorizeE3Export(storage,session);if(actor!==value.actor||now<value.at||now-value.at>300000)throw Error('草稿交接已過期或登入帳號已變更，請重新提出需求。');return {requestId:value.requestId};
}
export function clearReportDraftHandoff(){pending=null;}
