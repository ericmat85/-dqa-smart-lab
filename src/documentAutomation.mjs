import {useCallback,useEffect,useRef,useState} from 'react';
import {mappingCatalog,mappingPending,recoverMapping} from './documentMappingClient.mjs';
import {TEMPLATE_EVENT} from './reportTemplateStore.mjs';
import {TRIAL_TEMPLATE_EVENT} from './trialTemplateDeliveryClient.mjs';
async function automationCatalog(actorId){const data=await mappingCatalog(actorId);if(!Array.isArray(data?.targets)||data.targets.some(t=>!t||!['REQUEST','REPORT'].includes(t.kind)||typeof t.file_id!=='string'||!Array.isArray(t.mapping)))throw Error('資訊代入狀態資料不完整，請重新讀取。');return data;}
export function useDocumentAutomations(actorId,{enabled=true}={}){
 const life=useRef(0),[state,setState]=useState({owner:'',targets:[],error:'',loading:true});
 const reload=useCallback(async()=>{if(!enabled)return;const token=++life.current;try{const data=await automationCatalog(actorId);if(token===life.current)setState({owner:actorId,targets:data.targets,error:'',loading:false});}catch(e){if(token===life.current)setState({owner:actorId,targets:[],error:e.message,loading:false});}},[actorId,enabled]);
 const invalidate=useCallback(()=>{life.current++;},[]);
 useEffect(()=>{if(!enabled)return;const frame=requestAnimationFrame(()=>void reload());const refresh=()=>void reload();window.addEventListener(TEMPLATE_EVENT,refresh);window.addEventListener(TRIAL_TEMPLATE_EVENT,refresh);window.addEventListener('focus',refresh);return()=>{cancelAnimationFrame(frame);invalidate();window.removeEventListener(TEMPLATE_EVENT,refresh);window.removeEventListener(TRIAL_TEMPLATE_EVENT,refresh);window.removeEventListener('focus',refresh);};},[reload,enabled,invalidate]);
 const ready=enabled&&state.owner===actorId;
 async function open(kind,fileId){if(!enabled||mappingPending())return false;const token=++life.current;try{const data=await automationCatalog(actorId);if(token!==life.current)return false;const target=data.targets.find(t=>t.kind===kind&&t.file_id===fileId);setState({owner:actorId,targets:data.targets,error:target?'':'範本綁定已更新，請先確認目前綁定再設定代入。',loading:false});if(!target)return false;window.history.pushState({},'',`/lms/settings/documents/mapping/${kind}/${encodeURIComponent(fileId)}`);window.dispatchEvent(new Event('dqa:navigate'));return true;}catch(e){if(token===life.current)setState({owner:actorId,targets:[],error:e.message,loading:false});return false;}}
 async function recover(){const token=++life.current;try{await recoverMapping(actorId);if(token!==life.current)return false;await reload();return true;}catch(e){if(token!==life.current)return false;setState({owner:actorId,targets:[],error:e.message,loading:false});return false;}}
 return {enabled,targets:ready?state.targets:[],error:ready?state.error:'',loading:enabled&&(!ready||state.loading),pending:!!mappingPending(),reload,open,recover};
}
