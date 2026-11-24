import {useCallback,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {APPEARANCE_DEFAULTS,appearanceVariables,validateWorkspaceAppearance} from './workspaceAppearance.mjs';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {appStorage,businessIdentity,businessSessionVersion,originalBusinessEnabled,subscribeOriginalBusiness} from './originalBusiness.mjs';
import {WorkspaceAppearanceContext} from './workspaceAppearanceContext.mjs';
const KEY='dqa-workspace-appearance-v1';
function packet(data){
 if(!data||!Number.isSafeInteger(data.revision)||data.revision<0||typeof data.can_manage!=='boolean')throw Error('配色設定回應格式不正確，請重新讀取。');
 return {...data,configuration:validateWorkspaceAppearance(data.configuration)};
}
function demoRead(canManage){let configuration=APPEARANCE_DEFAULTS;try{configuration=validateWorkspaceAppearance(JSON.parse(appStorage().getItem(KEY)));}catch{/* A missing demo preference uses the defaults. */}return {configuration,revision:0,can_manage:canManage,source:'BROWSER'};}
export default function WorkspaceAppearanceProvider({children,client=businessClient,connected=originalBusinessEnabled(),demoCanManage=true}){
 const epoch=useSyncExternalStore(subscribeOriginalBusiness,businessSessionVersion,()=>0),member=businessIdentity()?.member?.id,scope=connected?(member?`${member}:${epoch}`:null):'demo';
 const [state,setState]=useState({scope:null,data:null,error:'',loading:false,saving:false,uncertain:false});const currentScope=useRef(scope),working=useRef(false),readSequence=useRef(0);
 useLayoutEffect(()=>{currentScope.current=scope;},[scope]);
 const load=useCallback(async(signal)=>{
  if(!scope)return;const sequence=++readSequence.current;setState(s=>({...s,scope,data:s.scope===scope?s.data:null,loading:true,error:'',saving:s.scope===scope?s.saving:false,uncertain:s.scope===scope?s.uncertain:false}));
  try{const data=connected?packet((await client.request('/access?section=appearance&version=2',{signal,background:true})).data):demoRead(demoCanManage);if(currentScope.current!==scope||sequence!==readSequence.current||signal?.aborted)return;setState(s=>({...s,scope,data,loading:false,error:'',uncertain:false}));return data;}
  catch(error){if(currentScope.current!==scope||sequence!==readSequence.current||signal?.aborted)return;setState(s=>({...s,scope,loading:false,error:businessErrorMessage(error)}));}
 },[scope,connected,client,demoCanManage]);
 useEffect(()=>{working.current=false;const controller=new AbortController();if(scope)void load(controller.signal);return()=>controller.abort();},[scope,load]);
 useEffect(()=>{if(!scope)return;const controller=new AbortController();const refresh=()=>{if(!working.current&&document.visibilityState==='visible')void load(controller.signal);};const storage=e=>{if(!connected&&e.key===KEY)refresh();};window.addEventListener('focus',refresh);window.addEventListener('storage',storage);return()=>{controller.abort();window.removeEventListener('focus',refresh);window.removeEventListener('storage',storage);};},[scope,connected,load]);
 const active=state.scope===scope?state:{data:null,loading:!!scope,saving:false,error:'',uncertain:false};
 const configuration=active.data?.configuration||APPEARANCE_DEFAULTS;
 useLayoutEffect(()=>{const variables=appearanceVariables(configuration);for(const [key,value] of Object.entries(variables))document.documentElement.style.setProperty(key,value);return()=>{for(const key of Object.keys(variables))document.documentElement.style.removeProperty(key);};},[configuration]);
 async function save(configuration,revision){
  if(working.current||active.loading||active.uncertain||!active.data?.can_manage)return false;
  const validated=validateWorkspaceAppearance(configuration),captured=scope;working.current=true;readSequence.current++;setState(s=>({...s,saving:true,error:''}));
  try{let data;if(connected)data=packet((await client.request('/access',{method:'POST',body:{action:'save_appearance',configuration:validated,expected_revision:revision}})).data);else{appStorage().setItem(KEY,JSON.stringify(validated));data={...active.data,configuration:validated,revision:revision+1};}if(currentScope.current!==captured)return false;setState(s=>({...s,data,saving:false,error:'',uncertain:false}));return true;}
  catch(error){if(currentScope.current===captured)setState(s=>({...s,saving:false,error:(error.outcomeUnknown||connected&&!error.code)?'儲存結果待確認，請先重新讀取設定，勿重複送出。':businessErrorMessage(error),uncertain:!!error.outcomeUnknown||connected&&!error.code}));return false;}
  finally{if(currentScope.current===captured)working.current=false;}
 }
 return <WorkspaceAppearanceContext.Provider value={{...active,configuration,connected,save,reload:load}}>{children}</WorkspaceAppearanceContext.Provider>;
}
