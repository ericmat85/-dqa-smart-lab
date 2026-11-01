import {useEffect,useState} from 'react';
import {SESSION_KEYS,expireIdleSessions,recordSessionActivity,pendingSessionNotices,dismissSessionNotices} from './idleSessions.mjs';
export default function useIdleSessions(path,navigate){
 const [notice,setNotice]=useState([]),[version,setVersion]=useState(0);
 useEffect(()=>{
  const active=Object.hasOwn(SESSION_KEYS,path.split('/')[1])?path.split('/')[1]:null;
  function check(){
   try{
    const expired=expireIdleSessions(),pending=pendingSessionNotices();
    const relevant=active?pending.filter(system=>system===active):pending;
    if(relevant.length)setNotice(previous=>previous.join()===relevant.join()?previous:relevant);
    if(active&&expired.includes(active)){setVersion(value=>value+1);navigate(`/${active}/login`,true);return true;}
    return !active&&relevant.length>0;
   }catch{return false;}
  }
  const activity=event=>{
   if(!event.isTrusted||event.target instanceof Element&&event.target.closest('.session-timeout-dialog'))return;
   if(check()){event.preventDefault();event.stopImmediatePropagation();return;}
   try{recordSessionActivity(active?[active]:Object.keys(SESSION_KEYS));}catch{/* Login already reports unavailable browser storage. */}
  };
  check();const timer=window.setInterval(check,1000);
  const events=['pointerdown','pointermove','keydown','wheel','touchmove'];
  events.forEach(name=>window.addEventListener(name,activity,{capture:true,passive:false}));
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);window.addEventListener('dqa:session-change',check);
  return()=>{clearInterval(timer);events.forEach(name=>window.removeEventListener(name,activity,{capture:true}));window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);window.removeEventListener('dqa:session-change',check);};
 },[path,navigate]);
 function dismiss(){try{dismissSessionNotices(notice);}catch{/* The in-memory message can still close. */}setNotice([]);}
 return {notice,dismiss,version};
}
