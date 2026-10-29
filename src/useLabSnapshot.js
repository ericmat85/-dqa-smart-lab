import {useSyncExternalStore} from 'react';
import {LAB_SOURCES,readLabSnapshot} from './labData.mjs';

const keys=[...LAB_SOURCES.map(source=>source.key),'dqa-cancelled-requests-v1'];
const events=['storage','focus','dqa:request-updated','dqa:review-updated','dqa:schedules-updated','dqa:equipment-updated'];
let cached=null,signature='',timer;
const listeners=new Set();
const serverStorage={getItem:()=>null};
export function getLabSnapshot() {
  if(typeof window==='undefined')return cached||(cached=readLabSnapshot(serverStorage));
  let next,storage;
  try{storage=window.localStorage;next=JSON.stringify(keys.map(key=>storage.getItem(key)));}catch{next='unreadable';storage={getItem(){throw Error('Storage unavailable');}};}
  if(!cached||signature!==next){signature=next;cached=readLabSnapshot(storage);}
  return cached;
}
export function refreshLabSnapshot() {
  const before=cached;getLabSnapshot();
  if(before!==cached)listeners.forEach(listener=>listener());
}
function subscribe(listener) {
  listeners.add(listener);
  if(listeners.size===1){timer=window.setInterval(refreshLabSnapshot,1000);events.forEach(event=>window.addEventListener(event,refreshLabSnapshot));}
  return()=>{listeners.delete(listener);if(!listeners.size){window.clearInterval(timer);events.forEach(event=>window.removeEventListener(event,refreshLabSnapshot));}};
}
export default function useLabSnapshot() {return useSyncExternalStore(subscribe,getLabSnapshot,getLabSnapshot);}
