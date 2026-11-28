import {useRef,useState} from 'react';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {businessIdentity,businessSessionVersion,refreshOriginalBusiness} from './originalBusiness.mjs';
import {BATCH_SCHEDULE_PREFIX,validateBatchPacket} from './batchScheduling.mjs';
const scope=()=>{const m=businessIdentity();return m?BATCH_SCHEDULE_PREFIX+':'+m.user.id+':'+m.member.id:null;};
export function pendingScheduleBatch(){try{const p=JSON.parse(sessionStorage.getItem(scope())||'null');return /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p?.id||'')&&Array.isArray(p.ids)?p:null;}catch{return null;}}
export default function useBatchScheduling(){
 const [pending,setPending]=useState(pendingScheduleBatch),[packet,setPacket]=useState(null),[busy,setBusy]=useState(''),[unknown,setUnknown]=useState(!!pending),[error,setError]=useState(''),[notice,setNotice]=useState(''),working=useRef(false);
 function remember(p){const key=scope();if(!key)throw Error('請先登入。');if(p)sessionStorage.setItem(key,JSON.stringify(p));else sessionStorage.removeItem(key);setPending(p);}
 function current(){return {key:scope(),member:businessIdentity()?.member.id,epoch:businessSessionVersion()};}
 function guard(s){if(s.key!==scope()||s.member!==businessIdentity()?.member.id||s.epoch!==businessSessionVersion())throw Error('登入帳號或工作區已變更，請重新開啟。');}
 async function sync(){try{await refreshOriginalBusiness({afterWrite:true});return true;}catch(e){setError('批次草稿已確認儲存，列表重新讀取未完成。'+businessErrorMessage(e));return false;}}
 async function preview(command){if(working.current||pending)return;working.current=true;setBusy('PREPARING');setError('');setNotice('');const s=current(),p={id:crypto.randomUUID(),ids:command.selection.map(j=>j.request_id),phase:'PREPARE'};let sent=false;
  try{remember(p);sent=true;const {data}=await businessClient.request('/schedule-batches/prepare',{method:'POST',body:{operation_id:p.id,command}});guard(s);const next=validateBatchPacket(data,p.id,p.ids);setPacket(next);setUnknown(false);remember({...p,phase:'PREVIEW'});setNotice('已完成批次預覽，確認後可一次儲存可安排的草稿。');return next;
  }catch(e){if(sent&&(e.outcomeUnknown||e.code==='RESPONSE_INVALID'||!e.code)){setUnknown(true);setError('本次安排結果尚未確認，請先查詢處理結果，不會自動重送。');}else{try{remember(null);}catch{/* preserve original failure */}setError(businessErrorMessage(e));}return null;}finally{setBusy('');working.current=false;}
 }
 async function save(){if(working.current||unknown||!pending||packet?.state!=='PLANNED')return;working.current=true;setBusy('SAVING');setError('');setNotice('');const s=current(),p={...pending,phase:'EXECUTE'};
  try{remember(p);const {data}=await businessClient.request('/schedule-batches/execute',{method:'POST',body:{operation_id:p.id}});guard(s);const next=validateBatchPacket(data,p.id,p.ids);if(next.state!=='SAVED')throw Error('尚未取得批次儲存確認。');setPacket(next);setUnknown(false);remember({...p,phase:'SAVED'});setNotice(`已一次儲存 ${next.results.length} 筆排程草稿。`);await sync();return next;
  }catch(e){if(e.outcomeUnknown||e.code==='RESPONSE_INVALID'||!e.code){setUnknown(true);setError('儲存結果尚未確認，請查詢結果；請勿重複送出。');}else{setError(businessErrorMessage(e));setPacket(null);try{remember(null);}catch{setUnknown(true);}await refreshOriginalBusiness({background:true}).catch(()=>{});}return null;}finally{working.current=false;setBusy('');}
 }
 async function lookup(){if(working.current||!pending)return;working.current=true;setBusy('LOOKUP');setError('');const s=current(),p=pending;
  try{const {data}=await businessClient.request('/schedule-batches/result/'+p.id);guard(s);const next=validateBatchPacket(data,p.id,p.ids);
   if(next.state==='PROCESSING'){setUnknown(true);setNotice('伺服器仍在處理，請稍後再次查詢。');return next;}
   if(['EXPIRED','NOT_FOUND'].includes(next.state)){remember(null);setPacket(null);setUnknown(false);setNotice(next.state==='EXPIRED'?'這批安排已到期，可重新設定；尚未提交新的草稿。':'未找到已提交的批次操作，可重新產生安排。');return next;}
   setPacket(next);setUnknown(false);remember({...p,phase:next.state==='SAVED'?'SAVED':'PREVIEW'});setNotice(next.state==='SAVED'?`資料庫已確認儲存 ${next.results.length} 筆草稿。`:'已取回安排預覽，尚未提交，可確認後儲存。');if(next.state==='SAVED')await sync();return next;
  }catch(e){setError(businessErrorMessage(e));setUnknown(true);return null;}finally{working.current=false;setBusy('');}
 }
 function reset(){if(working.current||unknown)return;try{remember(null);setPacket(null);setError('');setNotice('');}catch{setError('無法清除本次操作記錄，請重新開啟並查詢結果。');}}
 return {pending,packet,busy,unknown,error,notice,preview,save,lookup,reset,sync,locked:!!busy||unknown};
}
