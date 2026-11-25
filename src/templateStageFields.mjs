export const STAGE_LABELS={REQUESTER:'委託者',REQUEST_MANAGER:'直屬主管',LMS_1:'一階主管',LMS_2:'二階主管',LAB_RECEIVE:'執行者試驗前確認',LAB_COMPLETE:'執行者完成'};
export const STAGE_INPUTS={
 LMS_1:[
 ['permitTypes','委託許可類別','multi',['new_product','design_change','other']],['permitOther','其他許可內容','text'],
 ['allowed','委託需求是否被許可','choice'],['criteriaClear','測試項目規範與判定基準是否清楚','choice'],
 ['outsourced','是否有委外試驗','choice'],['outsourceExpectedDate','委外預計完成日','date'],
 ['resourcesReady','設備工具夾具是否足以執行測試','choice'],['resourcesExpectedDate','設備工具夾具預計備妥日','date'],['sampleCode','測試件編號','text'],
 ...[1,2,3,4].flatMap(i=>[[`equipment${i}`,`耐久設備 ${i}`,'text'],[`equipmentStart${i}`,`設備 ${i} 預估開始日`,'date'],[`equipmentEnd${i}`,`設備 ${i} 預估結束日`,'date']]),
 ['plannedOperator','測試人員','text'],['plannedStartDate','計畫執行開始日','date'],['reportDueDate','報告產出日','date'],
 ],
 LAB_RECEIVE:[['sampleCorrect','樣品數量與狀態是否正確','choice'],['sampleQuantity','樣品數','number'],['sampleReceivedDate','收樣日','date'],['fixturesReady','治工夾具數量正確且功能正常','optionalChoice'],['fixturesImprovedDate','治工夾具改善完成日','date'],['operationFamiliar','是否熟悉物品與工具操作及使用','choice'],['operationImprovedDate','操作熟悉度改善完成日','date'],['outsourceBooked','委外項目是否完成預約','optionalChoice'],['outsourceCompletedDate','委外完成日（如已確定）','date'],['executionAbnormal','試驗前準備是否有異常','pendingChoice'],['abnormalDescription','異常說明','text']],
 LAB_COMPLETE:[['executionAbnormal','執行過程是否有異常','choice'],['abnormalDescription','異常說明','text']],
};
STAGE_INPUTS.LAB_PREPARE=STAGE_INPUTS.LAB_RECEIVE.filter(([key])=>!['executionAbnormal','abnormalDescription'].includes(key));
export const PREAPPROVAL_FLOW='PREAPPROVAL_V2';
export const PREAPPROVAL_DERIVED=['sampleCode','outsourced','outsourceExpectedDate','plannedOperator','plannedStartDate',...[1,2,3,4].flatMap(i=>['equipment'+i,'equipmentStart'+i,'equipmentEnd'+i])];
const rows=[];
function check(id,label,stage,key,equals){rows.push({id,label,stage,key,type:'check',equals});}
function text(id,label,stage,key,type='text'){rows.push({id,label,stage,key,type});if(type==='date')for(const [suffix,t] of [['Year','年'],['Month','月'],['Day','日']])rows.push({id:id+suffix,label:label+'（'+t+'）',stage,key,type:'date'+suffix});}
for(const [id,label,equals] of [['lms1PermitNewProductCheck','一階主管｜許可新產品','new_product'],['lms1PermitDesignChangeCheck','一階主管｜許可設變','design_change'],['lms1PermitOtherCheck','一階主管｜許可其他','other']])check(id,label,'LMS_1','permitTypes',equals);
text('lms1PermitOtherContent','一階主管｜其他許可內容','LMS_1','permitOther');
for(const [prefix,label,key] of [['Allowed','委託需求許可','allowed'],['CriteriaClear','規範與判定基準清楚','criteriaClear'],['Outsourced','委外試驗','outsourced'],['ResourcesReady','設備工具夾具足以執行','resourcesReady']])for(const [suffix,v,t] of [['YesCheck','yes','是'],['NoCheck','no','否']])check('lms1'+prefix+suffix,'一階主管｜'+label+'（'+t+'）','LMS_1',key,v);
for(const [key,label,type] of STAGE_INPUTS.LMS_1.filter(([key])=>!['permitTypes','permitOther','allowed','criteriaClear','outsourced','resourcesReady'].includes(key)))text('lms1'+key[0].toUpperCase()+key.slice(1),'一階主管｜'+label,'LMS_1',key,type);
for(const [key,label,type] of STAGE_INPUTS.LAB_RECEIVE){
 const prefix='lab'+key[0].toUpperCase()+key.slice(1);
 if(['choice','optionalChoice','pendingChoice'].includes(type)){
  for(const [suffix,v,t] of [['YesCheck','yes','是'],['NoCheck','no','否']])check(prefix+suffix,'執行者｜'+label+'（'+t+'）','LAB_RECEIVE',key,v);
  if(type==='optionalChoice')check(prefix+'NotApplicableCheck','執行者｜'+label+'（不適用）','LAB_RECEIVE',key,'not_applicable');
 }else text(prefix,'執行者｜'+label,'LAB_RECEIVE',key,type);
}
for(const [stage,prefix] of [['REQUESTER','requester'],['REQUEST_MANAGER','requestManager'],['LMS_1','lms1'],['LMS_2','lms2'],['LAB_RECEIVE','labReceipt'],['LAB_COMPLETE','labCompletion']]){
 text(prefix+'Signature',STAGE_LABELS[stage]+'｜簽名圖檔',stage,'','signature');text(prefix+'Name',STAGE_LABELS[stage]+'｜姓名',stage,'','actor');
 for(const [suffix,label] of [['SignedDate','簽名日期'],['SignedYear','簽名年'],['SignedMonth','簽名月'],['SignedDay','簽名日']])text(prefix+suffix,STAGE_LABELS[stage]+'｜'+label,stage,'',suffix);
}
export const TEMPLATE_STAGE_FIELDS=Object.freeze(rows);
export const templateStageField=id=>TEMPLATE_STAGE_FIELDS.find(r=>r.id===id);
export function stageForField(field,context){if(context.preflight_required||context.flow_version===PREAPPROVAL_FLOW)return field.stage;if(field.stage==='LAB_RECEIVE'&&['executionAbnormal','abnormalDescription'].includes(field.key)&&context.stages?.LAB_COMPLETE)return 'LAB_COMPLETE';return field.stage;}
function taipeiDate(at){if(!at||!Number.isFinite(Date.parse(at)))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
export function stageFieldValue(field,context){const entry=context.stages?.[stageForField(field,context)]||((context.preflight_required||context.flow_version===PREAPPROVAL_FLOW)&&field.stage==='LAB_RECEIVE'&&field.key?context.stages?.LAB_PREPARE:undefined),v=entry?.fields?.[field.key];if(field.type==='signature')return entry?.signature_data?'已簽名':'';if(field.type==='actor')return entry?.actor||'';if(field.type.startsWith('Signed')){const date=taipeiDate(entry?.at),parts=date.split('-');return field.type==='SignedDate'?date.replaceAll('-','/'):parts[{SignedYear:0,SignedMonth:1,SignedDay:2}[field.type]]||'';}if(field.type.startsWith('date')&&field.type!=='date')return typeof v==='string'?v.split('-')[{dateYear:0,dateMonth:1,dateDay:2}[field.type]]||'':'';if(field.type==='check')return (Array.isArray(v)?v.includes(field.equals):v===field.equals)?'☑':'☐';return v??'';}
export function requiredStageKeys(stage,mapping=[]){const out=new Set();for(const row of mapping){const f=templateStageField(row.field);if(!f?.key)continue;if(f.stage===stage||stage==='LAB_COMPLETE'&&f.stage==='LAB_RECEIVE'&&['executionAbnormal','abnormalDescription'].includes(f.key))out.add(f.key);}for(const [key,dep] of [['permitOther','permitTypes'],['outsourceExpectedDate','outsourced'],['resourcesExpectedDate','resourcesReady'],['fixturesImprovedDate','fixturesReady'],['operationImprovedDate','operationFamiliar'],['abnormalDescription','executionAbnormal']])if(out.has(key))out.add(dep);return [...out];}
export function validateStageFields(stage,fields={},required=[]){
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('階段檢核資料無效。');const defs=STAGE_INPUTS[stage]||[],known=new Set(defs.map(([k])=>k));for(const k of Object.keys(fields))if(!known.has(k))throw Error('階段檢核欄位不符。');
 for(const [key,label,type,choices] of defs){const v=fields[key];if(v===undefined||v==='')continue;if(type==='multi'){if(!Array.isArray(v)||new Set(v).size!==v.length||v.some(x=>!choices.includes(x)))throw Error(label+'選項無效。');}
 else if(type.includes('Choice')||type==='choice'){const allowed=['yes','no',...(type==='optionalChoice'?['not_applicable']:[]),...(type==='pendingChoice'?['pending']:[])];if(!allowed.includes(v))throw Error(label+'選項無效。');}
 else if(type==='number'){if(!Number.isSafeInteger(v)||v<0||v>999999)throw Error(label+'須為零或正整數。');}
 else if(typeof v!=='string'||v.length>1000||type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v))throw Error(label+'格式無效。');}
 for(const key of required){const definition=defs.find(([k])=>k===key);if(!definition)continue;let need=true;if(key==='permitOther')need=fields.permitTypes?.includes('other');if(key==='outsourceExpectedDate')need=fields.outsourced==='yes';if(key==='resourcesExpectedDate')need=fields.resourcesReady==='no';if(key==='fixturesImprovedDate')need=fields.fixturesReady==='no';if(key==='operationImprovedDate')need=fields.operationFamiliar==='no';if(key==='abnormalDescription')need=fields.executionAbnormal==='yes';if(need&&(fields[key]===undefined||fields[key]===''||Array.isArray(fields[key])&&!fields[key].length))throw Error('請填寫'+definition[1]+'。');}
 if(fields.permitTypes?.includes('other')&&!fields.permitOther?.trim())throw Error('請填寫其他許可內容。');if(fields.executionAbnormal==='yes'&&!fields.abnormalDescription?.trim())throw Error('請填寫異常說明。');
 for(let i=1;i<=4;i++)if(fields['equipmentStart'+i]&&fields['equipmentEnd'+i]&&fields['equipmentEnd'+i]<fields['equipmentStart'+i])throw Error('設備預估結束日不可早於開始日。');
 return Object.fromEntries(Object.entries(fields).filter(([,v])=>v!==''&&v!==undefined&&(!Array.isArray(v)||v.length)));
}
