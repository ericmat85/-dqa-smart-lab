export const SPEC_PARAMETER_KEY='dqa-specification-parameters-v1';
export const SPEC_PARAMETER_EVENT='dqa:specification-parameters-updated';
export const DEFAULT_SPEC_PARAMETERS=Object.freeze([
 {id:'TEMPERATURE',label:'溫度',units:['°C']},{id:'ELECTRICAL',label:'電性',units:['V','A','Ω','W']},{id:'VIBRATION',label:'振動',units:['g','mm','m/s²']},{id:'FORCE',label:'拉力',units:['N','kN']},{id:'HUMIDITY',label:'濕度',units:['%RH']},{id:'FREQUENCY',label:'頻率',units:['Hz','kHz']},{id:'PRESSURE',label:'壓力',units:['kPa','MPa']},{id:'OTHER',label:'其他',units:['—']},
].map(r=>Object.freeze({...r,units:Object.freeze(r.units),revision:0,builtin:true})));
export const parameterKindValid=id=>DEFAULT_SPEC_PARAMETERS.some(r=>r.id===id)||/^CUSTOM_[A-F0-9]{32}$/.test(id||'');
export function parameterTextValid(value,max){return typeof value==='string'&&value.trim()===value&&value.length>0&&[...value].length<=max&&![...value].some(c=>c.codePointAt(0)<32||c.codePointAt(0)===127);}
export function validateParameterDefinition(data){if(!data||Array.isArray(data)||Object.keys(data).sort().join()!=='label,units'||!parameterTextValid(data.label,60)||!Array.isArray(data.units)||data.units.length<1||data.units.length>12||data.units.some(u=>!parameterTextValid(u,20))||new Set(data.units).size!==data.units.length)throw Error('請填寫參數名稱及 1～12 個不重複的單位。');return {label:data.label,units:[...data.units]};}
export function parseParameterCatalog(rows){if(!Array.isArray(rows)||rows.length>64)throw Error('規格參數清單格式不正確。');const seen=new Set();return rows.map(r=>{if(!r||!parameterKindValid(r.id)||seen.has(r.id)||!Number.isSafeInteger(r.revision)||r.revision<0||typeof r.builtin!=='boolean')throw Error('規格參數清單格式不正確。');seen.add(r.id);return Object.freeze({id:r.id,...validateParameterDefinition({label:r.label,units:r.units}),revision:r.revision,builtin:r.builtin});});}
export let SPEC_PARAMETER_TYPES=DEFAULT_SPEC_PARAMETERS;
export function configureParameterCatalog(rows){SPEC_PARAMETER_TYPES=rows===undefined?DEFAULT_SPEC_PARAMETERS:parseParameterCatalog(rows);}
export function emitParameterCatalog(){globalThis.dispatchEvent?.(new Event(SPEC_PARAMETER_EVENT));}
export function loadLocalParameterCatalog(storage=globalThis.localStorage){const raw=storage?.getItem(SPEC_PARAMETER_KEY);const rows=raw===null||raw===undefined?DEFAULT_SPEC_PARAMETERS:JSON.parse(raw);configureParameterCatalog(rows);return [...SPEC_PARAMETER_TYPES];}
try{loadLocalParameterCatalog();}catch{SPEC_PARAMETER_TYPES=DEFAULT_SPEC_PARAMETERS;}
