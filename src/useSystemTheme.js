import {appStorage} from './originalBusiness.mjs';
import {useSyncExternalStore} from 'react';
const KEY='dqa-global-theme';let volatile=null;
function snapshot(){if(volatile)return volatile;try{return appStorage().getItem(KEY)==='dark'?'dark':'light';}catch{return 'light';}}
function subscribe(listener){const storage=event=>{if(event.key===KEY||event.key===null){volatile=null;listener();}};window.addEventListener('storage',storage);window.addEventListener('dqa:theme',listener);return()=>{window.removeEventListener('storage',storage);window.removeEventListener('dqa:theme',listener);};}
function toggleTheme(){const next=snapshot()==='dark'?'light':'dark';try{appStorage().setItem(KEY,next);volatile=null;}catch{volatile=next;}window.dispatchEvent(new CustomEvent('dqa:theme',{detail:next}));}
export default function useSystemTheme(){const theme=useSyncExternalStore(subscribe,snapshot,()=> 'light');return {theme,dark:theme==='dark',toggleTheme};}
