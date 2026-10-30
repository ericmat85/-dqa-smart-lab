import {effectiveScheduleStatus} from './scheduleProgress.mjs';
import {accessSystem} from './demoPermissions.mjs';
import {customRole} from './customRoles.mjs';
export function canControlTrial(account,storage){
 if(!accessSystem(account,'lms',storage))return false;
 const role=customRole(account,storage);
 return role?role.level===1&&role.pages.includes('schedule'):account.role==='一階主管';
}
export function isActiveTrial(row,now=Date.now()){return Boolean(row?.pauseStartedAt)||['試驗中','進行中','暫停中'].includes(row?.status)||['試驗中','進行中'].includes(effectiveScheduleStatus(row||{},now));}

export function trialPauseAvailability(account,row,now,storage){
 if(!canControlTrial(account,storage))return {enabled:false,reason:'僅 lv1 一階主管可暫停／恢復試驗。'};
 if(row?.pauseStartedAt&&row.status==='暫停中')return {enabled:true,reason:'恢復後，預估結束時間保留累計暫停期間。'};
 const status=effectiveScheduleStatus(row||{},now);
 if(!['試驗中','進行中'].includes(status))return {enabled:false,reason:`目前狀態：${status||'未排程'}。完成排程、實驗室確認接收並開始試驗後，才能暫停。`};
 return {enabled:true,reason:'暫停後設備持續占用，預估結束時間隨暫停期間順延。'};
}
