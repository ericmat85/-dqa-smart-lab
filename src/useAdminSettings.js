import {useCallback,useEffect,useState} from 'react';
import {ADMIN_KEY,ADMIN_EVENT,readAdminSettings} from './adminCenterStore.mjs';
const read=()=>{try{return {data:readAdminSettings(),error:''};}catch(error){return {data:null,error:error.message};}};
export default function useAdminSettings(){
 const [state,setState]=useState(read);const refresh=useCallback(()=>setState(read()),[]);
 useEffect(()=>{const onStorage=e=>{if(e.key===ADMIN_KEY||e.key===null)refresh();};window.addEventListener('storage',onStorage);window.addEventListener(ADMIN_EVENT,refresh);return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener(ADMIN_EVENT,refresh);};},[refresh]);
 return {...state,refresh};
}
