import {useEffect,useRef,useState} from 'react';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {businessIdentity,refreshOriginalBusiness,originalBusinessEnabled} from './originalBusiness.mjs';
export default function useResourceMutation(){
 const identity=businessIdentity(),key=identity?'dqa-resource-pending-v1:'+identity.user.id+':'+identity.member.id:null;
 const [pending,setPending]=useState(()=>{try{return key?JSON.parse(sessionStorage.getItem(key)||'null'):null;}catch{return null;}}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const working=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function clear(){try{if(key)sessionStorage.removeItem(key);}catch{/* An acknowledged result remains authoritative even if browser cleanup fails. */}setPending(null);}
 async function refresh(){try{await refreshOriginalBusiness({afterWrite:true});}catch(e){setError('資料庫已確認處理結果，但畫面重新讀取未完成。'+businessErrorMessage(e));}}
 async function submit(command,message){if(working.current||pending)return false;working.current=true;setBusy(true);setError('');setNotice('');let dispatched=false;const operation_id=crypto.randomUUID();
 try{await businessClient.request('/resources/prepare',{method:'POST',body:{operation_id,command}});try{sessionStorage.setItem(key,JSON.stringify({operation_id}));}catch{throw Error('無法保存操作識別，本次未送出資料異動。請檢查瀏覽器儲存權限。');}dispatched=true;await businessClient.request('/resources/execute',{method:'POST',body:{operation_id,command}});clear();setNotice(message||'資料已儲存至資料庫。');await refresh();return true;
 }catch(e){if(dispatched&&e.outcomeUnknown)setPending({operation_id});else if(dispatched)clear();setError(!dispatched&&e.outcomeUnknown?'預備結果尚未確認，本次尚未送出資料異動。請稍後重試。':e.code?businessErrorMessage(e):e.message);return false;}finally{working.current=false;if(alive.current)setBusy(false);}}
 async function lookup(){if(working.current||!pending)return null;working.current=true;setBusy(true);setError('');try{const {data}=await businessClient.request('/resources/result/'+pending.operation_id);if(data.state==='SAVED'){clear();setNotice('資料庫已確認儲存完成。');await refresh();}else if(data.state==='EXPIRED'){clear();setNotice('本次操作未提交且已到期；請重新確認資料後再操作。');await refresh();}else setNotice('資料庫尚未確認完成，請稍後再次查詢；不會自動重送。');return data.state;}catch(e){setError(businessErrorMessage(e));return null;}finally{working.current=false;if(alive.current)setBusy(false);}}
 return {enabled:originalBusinessEnabled(),busy,pending,error,notice,submit,lookup,locked:busy||!!pending,resetMessages:()=>{setError('');setNotice('');}};
}
