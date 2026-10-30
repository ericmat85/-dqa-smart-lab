import {effectiveScheduleStatus} from './scheduleProgress.mjs';
import {accessSystem} from './demoPermissions.mjs';
import {customRole} from './customRoles.mjs';
export function canControlTrial(account,storage){
 if(!accessSystem(account,'lms',storage))return false;
 const role=customRole(account,storage);
 return role?role.level===1&&role.pages.includes('schedule'):account.role==='一階主管';
}
export function isActiveTrial(row,now=Date.now()){return Boolean(row?.pauseStartedAt)||['試驗中','進行中','暫停中'].includes(row?.status)||['試驗中','進行中'].includes(effectiveScheduleStatus(row||{},now));}
