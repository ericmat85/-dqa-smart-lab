// Classification describes the experiment; method profiles keep their established scheduling rules.
export const TRIAL_TYPES=Object.freeze([
 {id:'PLACEMENT',label:'放置型',description:'樣品在設定的環境或條件下放置，依試驗規範設定持續時間。'},
 {id:'POWERED_PLACEMENT',label:'作動放置型',description:'接電或能源供給的放置試驗，請在試驗手法中註明能源、負載與作動條件。'},
 {id:'COMPOUND_CONTINUOUS',label:'複合型連續試驗',description:'由放置型、作動放置型或操作試驗組合，各階段需連續進行，不能中斷。'},
 {id:'COMPOUND_DISCONTINUOUS',label:'複合型不連續試驗',description:'由放置型、作動放置型或操作試驗組合，各階段可間隔數日，依各階段分別安排日期。'},
 {id:'OPERATION',label:'操作試驗',description:'需人員手動實作、觀測及紀錄，請在試驗手法中註明操作與觀測要求。'},
 {id:'OUTSOURCED',label:'委外試驗',description:'委託第三方進行，建立委託單時請選擇委外並填寫受託單位與預約條件。'},
 {id:'OTHER',label:'其他',description:'尚未歸類的試驗，請完整說明試驗手法、工時及資源需求。'},
]);
export function inferredTrialType(profile){if(profile==='COMPOUND_ENVIRONMENT')return 'COMPOUND_CONTINUOUS';if(['VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','INSERTION','VOLTAGE','EMC'].includes(profile))return 'OPERATION';if(['HIGH_HUMIDITY','THERMAL_SHOCK','HUMIDITY_CYCLE','THERMAL_CYCLE','LOW_TEMPERATURE','HIGH_TEMPERATURE','SALT_SPRAY','WEATHERING','DUST'].includes(profile))return 'PLACEMENT';return 'OTHER';}
export function trialType(row){return row.trialType||row.test_type||inferredTrialType(row.profileId||row.profile_code);}
export const trialTypeLabel=row=>TRIAL_TYPES.find(t=>t.id===trialType(row))?.label||'其他';
