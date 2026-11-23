import {isVirtualRequest} from './requestExecutionKind.mjs';
import {scheduleTimestamp} from './scheduleProgress.mjs';
// Native trials finish at the saved schedule deadline, even for a one-hour test.
export function canConfirmLabCompletion(item,now){
 if(!item?.businessDatabase||item.status!=='試驗中'||isVirtualRequest(item)||item.pendingOperationId)return false;
 const end=scheduleTimestamp(item.scheduledEnd,true);
 return Number.isFinite(now)&&end!==null&&now>=end;
}
export function canStopBusinessSchedule(account,row){
 if(!account?.businessIdentity||!row?.businessDatabase||row.readOnly||!row.databaseId||!['已排程','試驗中','暫停中'].includes(row.status))return false;
 if(!account.businessSystems?.includes('lms')||!account.businessPages?.includes('schedule'))return false;
 return !!account.businessAdmin||(account.businessReviewLevel===1&&account.businessPermissions?.includes('schedules.book'));
}
