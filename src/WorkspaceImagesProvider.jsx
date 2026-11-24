import {useState,useRef,useEffect,useLayoutEffect,useCallback,useSyncExternalStore} from 'react';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {businessIdentity,businessSessionVersion,subscribeOriginalBusiness,originalBusinessEnabled,appStorage} from './originalBusiness.mjs';
import {WorkspaceImagesContext} from './workspaceImagesContext.mjs';
import {IMAGE_KINDS,validateImageChange,validateImagesPacket} from './workspaceImages.mjs';
const EMPTY=()=>Object.fromEntries(IMAGE_KINDS.map(k=>[k,{image:null,name:'',revision:0}]));
export default function WorkspaceImagesProvider({children,connected=originalBusinessEnabled(),client=businessClient}){
 const epoch=useSyncExternalStore(subscribeOriginalBusiness,businessSessionVersion,()=>0),member=businessIdentity()?.member?.id,scope=connected?(member?`${member}:${epoch}`:null):'demo';
 const [state,setState]=useState({scope:null,data:null,loading:false,busy:false,error:'',uncertain:false});const activeScope=useRef(scope),sequence=useRef(0),working=useRef(false);
 useLayoutEffect(()=>{activeScope.current=scope;working.current=false;},[scope]);
 const load=useCallback(async(signal)=>{if(!scope)return false;const order=++sequence.current;setState(s=>({...s,scope,data:s.scope===scope?s.data:null,loading:true,error:''}));try{
  let data;if(connected){data=validateImagesPacket((await client.request('/images',{signal,background:true})).data,member);}
  else{let logo=null;try{logo=JSON.parse(appStorage().getItem('dqa-workspace-logo-v1'));}catch{/* Default logo. */}data={images:{...EMPTY(),logo:logo||EMPTY().logo},can_manage:true};}
  if(activeScope.current!==scope||sequence.current!==order||signal?.aborted)return false;setState({scope,data,loading:false,busy:false,error:'',uncertain:false});return true;
 }catch(e){if(activeScope.current===scope&&sequence.current===order&&!signal?.aborted)setState(s=>({...s,loading:false,error:businessErrorMessage(e)}));return false;}},[scope,member,connected,client]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]);
 useEffect(()=>{const c=new AbortController();const refresh=()=>{if(!working.current&&document.visibilityState==='visible')void load(c.signal);};window.addEventListener('focus',refresh);return()=>{c.abort();window.removeEventListener('focus',refresh);};},[load]);
 const active=state.scope===scope?state:{data:null,loading:!!scope,busy:false,error:'',uncertain:false};
 async function save(kind,image,name,revision){if(!scope||working.current||active.loading||!active.data||active.uncertain)throw Error('請先重新讀取圖片設定。');validateImageChange({kind,image,name,expected_revision:revision});if(kind==='logo'&&!active.data.can_manage)throw Error('只有工作區管理者可以替換公司標誌。');working.current=true;sequence.current++;const captured=scope;setState(s=>({...s,busy:true,error:''}));try{
  let data;if(connected){data=validateImagesPacket((await client.request('/images',{method:'POST',body:{kind,image,name,expected_revision:revision}})).data,member);}
  else{const item={image,name,revision:revision+1};appStorage().setItem('dqa-workspace-logo-v1',JSON.stringify(item));data={...active.data,images:{...active.data.images,[kind]:item}};}
  if(activeScope.current!==captured)return false;setState({scope,data,busy:false,loading:false,error:'',uncertain:false});return true;
 }catch(e){if(activeScope.current===captured)setState(s=>({...s,busy:false,error:businessErrorMessage(e),uncertain:!!e.outcomeUnknown||connected&&!e.code}));throw e;}finally{if(activeScope.current===captured)working.current=false;}}
 return <WorkspaceImagesContext.Provider value={{...active,connected,save,reload:load}}>{children}</WorkspaceImagesContext.Provider>;
}
