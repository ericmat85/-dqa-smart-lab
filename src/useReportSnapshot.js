import {originalBusinessEnabled,businessIdentity} from './originalBusiness.mjs';
import {useSyncExternalStore} from 'react';
import {allReports} from './reportStore.mjs';
import {reportMetadata} from './reportRules.mjs';
import {projectReportState} from './reportWorkflow.mjs';
import {caseResetVersion} from './resetCases.mjs';
import {refreshLabSnapshot} from './useLabSnapshot.js';
const identity=()=>originalBusinessEnabled()?(businessIdentity()?.user.id||'signed-out')+':'+(businessIdentity()?.member.id||''):'native';let cacheIdentity;
const listeners=new Set(),empty=[];let cached=empty,timer,busy=false,signature='',readError='';
export async function refreshReportSnapshot(){
 if(busy)return;busy=true;const who=identity();try{const epoch=caseResetVersion();const records=await allReports();if(epoch!==caseResetVersion()||who!==identity())return;let changed=false;
 for(const report of records)if(report.stage)changed=projectReportState(report)||changed;
 if(changed){refreshLabSnapshot();window.dispatchEvent(new Event('dqa:review-updated'));window.dispatchEvent(new Event('dqa:schedules-updated'));}
 if(readError){readError='';listeners.forEach(listener=>listener());}
 const meta=records.map(reportMetadata).filter(Boolean),next=JSON.stringify(meta);const changedIdentity=cacheIdentity!==who;cacheIdentity=who;if(next!==signature||changedIdentity){signature=next;cached=meta;listeners.forEach(listener=>listener());}
 }catch{const message='報告資料讀取／同步失敗；原有資料未清除。請檢查瀏覽器儲存權限後重試。';if(readError!==message){readError=message;listeners.forEach(listener=>listener());}}finally{busy=false;}
}
function subscribe(listener){listeners.add(listener);if(listeners.size===1){refreshReportSnapshot();timer=window.setInterval(refreshReportSnapshot,1500);}return()=>{listeners.delete(listener);if(!listeners.size)window.clearInterval(timer);};}
export default function useReportSnapshot(){return useSyncExternalStore(subscribe,()=>cacheIdentity===identity()?cached:empty,()=>empty);}

export function useReportSnapshotError(){return useSyncExternalStore(subscribe,()=>readError,()=>"");}
