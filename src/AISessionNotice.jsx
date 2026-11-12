import {useEffect,useState} from 'react';
import {aiSessionState} from './aiSessionState.mjs';
export default function AISessionNotice(){
 const system=()=>location.pathname.split('/')[1];const [state,setState]=useState(()=>aiSessionState(system()));
 useEffect(()=>{const update=()=>setState(aiSessionState(system()));window.addEventListener('dqa:ai-revocation-state',update);window.addEventListener('dqa:navigate',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('dqa:ai-revocation-state',update);window.removeEventListener('dqa:navigate',update);window.removeEventListener('popstate',update);};},[]);
 if(!['PENDING','UNCONFIRMED','CONFIRMED'].includes(state.status))return null;
 const text=state.status==='PENDING'?'AI 對話已從畫面清除，正在等待後端撤銷確認。':state.status==='UNCONFIRMED'?'AI 對話撤銷未確認；舊對話禁止復用，重新登入後將建立新對話。':'AI 對話撤銷已由後端確認。';
 return <div role={state.status==='UNCONFIRMED'?'alert':'status'} data-ai-session-status={state.status} style={{position:'fixed',bottom:12,left:12,zIndex:30000,maxWidth:'min(90vw,520px)',padding:'10px 14px',background:'var(--ui-surface,#fff)',color:'var(--ui-text,#172b4d)',border:'1px solid #cbd5e1',borderRadius:8,boxShadow:'0 4px 16px #0002'}}>{text}</div>;
}
