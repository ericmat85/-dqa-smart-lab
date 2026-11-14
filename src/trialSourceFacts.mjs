// Existing trial facts take precedence over generated synthetic defaults.
export const present=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
export const numeric=v=>typeof v==='number'?v:typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim())?Number(v):NaN;
const n='(-?\\d+(?:\\.\\d+)?)';
export class TrialInputError extends Error{constructor(message){super(message);this.code='TRIAL_DATA_INCOMPLETE';}}
function interval(text,unit){
 const values=[],range=new RegExp(`${n}\\s*(?:${unit})?\\s*[~～至]\\s*${n}\\s*${unit}`,'gi');
 const rest=text.replace(range,(_,a,b)=>{values.push([Number(a),Number(b)]);return ' ';});
 if(new RegExp(`${n}\\s*-\\s*${n}\\s*${unit}`,'i').test(rest))throw new TrialInputError('試驗規範的範圍格式無法核對，請先確認原始試驗資料。');
 for(const m of rest.matchAll(new RegExp(`${n}\\s*${unit}`,'gi')))values.push([Number(m[1]),Number(m[1])]);
 const unique=new Map(values.map(x=>[x.join(':'),x]));if(unique.size>1)throw new TrialInputError('試驗規範包含多段或不一致條件，請先確認原始試驗資料。');
 return unique.size?[...unique.values()][0]:null;
}
export function sourceConditions(source){
 const text=[source.specification,source.testSpec].filter(x=>typeof x==='string').join('\n').replaceAll('−','-');if(text.length>8000)throw new TrialInputError('試驗規範過長，請先整理可查核的試驗條件。');
 const result={},stored=source.conditions||{};let supplied=false;
 if(typeof stored!=='object'||Array.isArray(stored)||Object.keys(stored).some(k=>!['temperatureMin','temperatureMax','humidityMin','humidityMax','frequencyMin','frequencyMax'].includes(k)&&present(stored[k])))throw new TrialInputError('原始試驗條件格式無法核對，未以範例覆蓋。');
 for(const [name,unit] of [['temperature','(?:°\\s*C|℃)'],['humidity','(?:%\\s*RH|％\\s*RH)'],['frequency','Hz']]){
  const a=stored[name+'Min'],b=stored[name+'Max'];
  if(present(a)||present(b)){
   supplied=true;if(!present(a)||!present(b)||!Number.isFinite(numeric(a))||!Number.isFinite(numeric(b)))throw new TrialInputError('原始試驗資料的溫濕度條件不完整，請先確認委託資料。');
   result[name+'Min']=numeric(a);result[name+'Max']=numeric(b);
  }else{const pair=interval(text,unit);if(pair){supplied=true;[result[name+'Min'],result[name+'Max']]=pair;}}
 }
 if(!supplied&&/(?:溫度|温度|temperature|濕度|湿度|humidity|高溫(?:儲存|試驗)?|高温(?:存储|试验)?|低溫|低温)\s*(?:條件|条件|範圍|范围)?\s*[:：=]?\s*[-\d]|°\s*F|\b\d+\s*K\b/i.test(text))throw new TrialInputError('原始試驗條件的單位或格式無法核對，未以範例覆蓋。');
 if(!present(result.frequencyMin)&&/頻率\s*[:：=]?\s*\d|\bkHz\b/i.test(text))throw new TrialInputError('頻率條件的單位或格式無法核對，未以範例覆蓋。');
 return {conditions:result,supplied,text};
}
export function explicitHours(source){
 if(present(source.durationHours)){const v=numeric(source.durationHours);if(!Number.isFinite(v)||v<=0)throw new TrialInputError('原始試驗時長無效，請先確認試驗資料。');return v;}
 if(present(source.durationMinutes)){const v=numeric(source.durationMinutes);if(!Number.isFinite(v)||v<=0)throw new TrialInputError('原始試驗分鐘數無效。');return v/60;}
 if(present(source.durationDays)){const v=numeric(source.durationDays);if(!Number.isFinite(v)||v<=0)throw new TrialInputError('原始試驗天數無效，請先確認試驗資料。');return v*24;}
 const text=[source.specification,source.testSpec].filter(x=>typeof x==='string').join('\n'),values=[];
 for(const m of text.matchAll(/(?:持續|時長|試驗時間|duration)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(小時|hours?|hrs?|h|天|days?)/gi))values.push(Number(m[1])*(/^(?:天|day)/i.test(m[2])?24:1));
 for(const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:小時|hours?\b|hrs?\b|h\b)/gi)){if(Number(m[1])<=0)throw new TrialInputError('原始試驗時長無效，請先確認試驗資料。');values.push(Number(m[1]));}
 for(const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(分鐘|minutes?\b|mins?\b|秒|seconds?\b|secs?\b)/gi)){if(Number(m[1])<=0)throw new TrialInputError('原始試驗時長無效。');values.push(Number(m[1])/( /^(?:秒|second|sec)/i.test(m[2])?3600:60));}
 if(!values.length&&(/(?:持續|時長|試驗時間|duration)\s*[:：=]?\s*\d/i.test(text)||/\d+\s*(?:循環|cycles?\b)/i.test(text)))throw new TrialInputError('原始試驗時長或循環次數尚無可核對的工時，未以範例覆蓋。');
 const unique=new Set(values);if(unique.size>1)throw new TrialInputError('原始試驗時長不一致，請先確認試驗規範。');return unique.size?[...unique][0]:null;
}
export function explicitDuration(source){const hours=explicitHours(source);return hours===null?null:Math.ceil(hours/24);}
