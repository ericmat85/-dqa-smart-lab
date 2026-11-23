import {appStorage} from './originalBusiness.mjs';
import {isCalendarDate} from './requestDate.mjs';
export const MANAGEMENT_PREFERENCES_KEY='dqa-management-preferences-v1';
export const DEFAULT_MANAGEMENT_PREFERENCES={reportPeriod:'all',exportSummary:true,equipmentDays:14,equipmentStart:''};
function normalize(value){return {reportPeriod:['all','week','month'].includes(value.reportPeriod)?value.reportPeriod:'all',exportSummary:value.exportSummary!==false,equipmentDays:[7,14,30,60,90].includes(Number(value.equipmentDays))?Number(value.equipmentDays):14,equipmentStart:isCalendarDate(value.equipmentStart)?value.equipmentStart:''};}
export function readManagementPreferences(storage=appStorage()){
 try{return normalize(JSON.parse(storage.getItem(MANAGEMENT_PREFERENCES_KEY)||'{}'));}catch{return {...DEFAULT_MANAGEMENT_PREFERENCES};}
}
export function saveManagementPreferences(value,storage=appStorage()){
 if(value.equipmentStart&&!isCalendarDate(value.equipmentStart))throw Error('設備稼動率的起始日期無效。');
 const next=normalize(value);storage.setItem(MANAGEMENT_PREFERENCES_KEY,JSON.stringify(next));
 if(typeof window!=='undefined'&&storage===appStorage())window.dispatchEvent(new Event('dqa:management-preferences'));
 return next;
}
