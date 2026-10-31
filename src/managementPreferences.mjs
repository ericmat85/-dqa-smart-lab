export const MANAGEMENT_PREFERENCES_KEY='dqa-management-preferences-v1';
export const DEFAULT_MANAGEMENT_PREFERENCES={reportPeriod:'all',exportSummary:true};
export function readManagementPreferences(storage=globalThis.localStorage){
 try{const value=JSON.parse(storage.getItem(MANAGEMENT_PREFERENCES_KEY)||'{}');return {reportPeriod:['all','week','month'].includes(value.reportPeriod)?value.reportPeriod:'all',exportSummary:value.exportSummary!==false};}catch{return {...DEFAULT_MANAGEMENT_PREFERENCES};}
}
export function saveManagementPreferences(value,storage=globalThis.localStorage){
 const next={reportPeriod:['all','week','month'].includes(value.reportPeriod)?value.reportPeriod:'all',exportSummary:value.exportSummary!==false};
 storage.setItem(MANAGEMENT_PREFERENCES_KEY,JSON.stringify(next));return next;
}
