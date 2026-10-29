import {useSyncExternalStore} from 'react';
import {allReports} from './reportStore.mjs';
import {reportMetadata} from './reportRules.mjs';
import {projectReportState} from './reportWorkflow.mjs';
import {caseResetVersion} from './resetCases.mjs';
import {refreshLabSnapshot} from './useLabSnapshot.js';
const listeners=new Set(),empty=[];let cached=empty,timer,busy=false,signature='';
export async function refreshReportSnapshot(){
 if(busy)return;busy=true;try{const epoch=caseResetVersion();const records=await allReports();if(epoch!==caseResetVersion())return;let changed=false;
 for(const report of records)if(report.stage)changed=projectReportState(report)||changed;
 if(changed){refreshLabSnapshot();window.dispatchEvent(new Event('dqa:review-updated'));window.dispatchEvent(new Event('dqa:schedules-updated'));}
 const meta=records.map(reportMetadata).filter(Boolean),next=JSON.stringify(meta);if(next!==signature){signature=next;cached=meta;listeners.forEach(listener=>listener());}
 }catch{/* Preserve committed binary reports and retry metadata synchronization on the next tick. */}finally{busy=false;}
}
function subscribe(listener){listeners.add(listener);if(listeners.size===1){refreshReportSnapshot();timer=window.setInterval(refreshReportSnapshot,1500);}return()=>{listeners.delete(listener);if(!listeners.size)window.clearInterval(timer);};}
export default function useReportSnapshot(){return useSyncExternalStore(subscribe,()=>cached,()=>empty);}
