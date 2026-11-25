import {stageFormKey} from './templateStageFormState.mjs';
import {useEffect,useState} from 'react';
import {mappingStageContext} from './documentMappingClient.mjs';
import {STAGE_INPUTS,STAGE_LABELS,requiredStageKeys} from './templateStageFields.mjs';
import './TemplateStageForm.css';
const choices={yes:'是',no:'否',not_applicable:'不適用',pending:'尚未執行'};
const permits={new_product:'新產品',design_change:'設計變更',other:'其他'};
export function StageInputFields({stage,fields={},onChange,required=[],disabled=false,prefix='',excludeKeys=[]}){
 const update=(key,value)=>onChange({...fields,[key]:value});
 return <div className="template-stage-grid">{(STAGE_INPUTS[stage]||[]).filter(([key])=>!excludeKeys.includes(key)).map(([key,label,type,options])=>{
  const caption=<>{label}{required.includes(key)&&<small>（對應欄位）</small>}</>;
  if(type==='multi')return <fieldset key={key} className="template-stage-wide template-stage-permits" disabled={disabled}><legend>{caption}</legend><div className="template-stage-checks">{options.map(v=><label key={v}><input type="checkbox" aria-label={prefix+permits[v]} checked={fields[key]?.includes(v)||false} onChange={e=>update(key,e.target.checked?[...(fields[key]||[]),v]:(fields[key]||[]).filter(x=>x!==v))}/>{permits[v]}</label>)}</div></fieldset>;
  return <label key={key}><span>{caption}</span>{['choice','optionalChoice','pendingChoice'].includes(type)?<select aria-label={prefix+label} disabled={disabled} value={fields[key]||''} onChange={e=>update(key,e.target.value)}><option value="">請選擇</option>{['yes','no',...(type==='optionalChoice'?['not_applicable']:[]),...(type==='pendingChoice'?['pending']:[])].map(v=><option value={v} key={v}>{choices[v]}</option>)}</select>:<input aria-label={prefix+label} disabled={disabled} type={type==='date'?'date':type==='number'?'number':'text'} min={type==='number'?0:undefined} max={type==='number'?999999:undefined} step={type==='number'?1:undefined} maxLength={type==='text'?1000:undefined} value={fields[key]??''} onChange={e=>update(key,type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value)}/>}</label>;
 })}</div>;
}
export default function TemplateStageForm({documentId,stage,scope='',actorId,onState,disabled}){
 const key=stageFormKey(documentId,stage,scope),[state,setState]=useState({key,stage,fields:{},required:[],ready:false,error:''}),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;const initial={key,stage,fields:{},required:[],ready:false,error:''};onState(initial);mappingStageContext(documentId,actorId).then(data=>{if(!active)return;if(data.document_id!==documentId)throw Error('委託單版本已變更，請重新開啟。');const next={...initial,required:requiredStageKeys(stage,data.mapping),ready:true};setState(next);onState(next);}).catch(e=>{if(active){const next={...initial,error:e.message};setState(next);onState(next);}});return()=>{active=false;};},[documentId,actorId,key,stage,onState,retry]);
 const update=fields=>{const next={...state,fields};setState(next);onState(next);};
 return <section className="template-stage-form" aria-label={STAGE_LABELS[stage]+'委託單填寫'}><h3>{stage==='LMS_1'?'收件單位填寫／委託確認／排程確認':stage==='LAB_RECEIVE'?'測試人員填寫／接收確認':'執行結果確認'}</h3><p>下列內容與本次簽名一併保存。已設定儲存格對應的欄位需完成填選；日期依實際狀況填寫。</p>{state.error?<p role="alert">{state.error} <button type="button" disabled={disabled} onClick={()=>setRetry(v=>v+1)}>重新讀取</button></p>:!state.ready?<p role="status">讀取本版委託單的檢核設定…</p>:<><StageInputFields stage={stage} fields={state.fields} required={state.required} onChange={update} disabled={disabled}/>{stage==='LAB_RECEIVE'&&<p>接收時尚未執行可選「尚未執行」；完成試驗時須更新已對應的異常欄位。</p>}</>}</section>;
}
