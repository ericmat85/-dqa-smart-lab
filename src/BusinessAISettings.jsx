import {ActionTable} from './tableActionIcons.jsx';
import {useCallback,useEffect,useRef,useState} from 'react';
import {businessClient} from './businessClient.mjs';
import {businessIdentity} from './originalBusiness.mjs';
import {aiErrorMessage} from './businessAIClient.mjs';
import './BusinessAISettings.css';
import {modelOptions} from './businessModelCatalog.mjs';
const formOf=data=>({enabled:data.enabled,model:data.model,per_call_usd:data.per_call_usd,total_cap_usd:data.total_cap_usd,max_output_tokens:data.max_output_tokens,engine_controls:{...(data.engine_controls||{})},key_action:'KEEP',api_key:''});
export default function BusinessAISettings({engine,onSaved,client=businessClient}){
 const admin=businessIdentity()?.member?.is_admin===true;
 const [data,setData]=useState(null),[form,setForm]=useState(null),[busy,setBusy]=useState(admin),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const alive=useRef(true),request=useRef(null),inFlight=useRef(false);
 const path='/ai/settings/'+engine;
 const read=useCallback(async(signal)=>{const p=await client.request(path,{signal});if(!p.data||p.data.engine!==engine||!Number.isSafeInteger(p.data.revision)||!p.data.can_manage)throw Object.assign(Error(),{code:'AI_SETTINGS_RESPONSE_INVALID'});return p.data;},[client,path,engine]);
 useEffect(()=>{
  alive.current=true;const controller=new AbortController();request.current=controller;
  if(admin){void read(controller.signal).then(d=>{if(alive.current){setData(d);setForm(formOf(d));}}).catch(e=>{if(alive.current&&e.name!=='AbortError')setError(aiErrorMessage(e));}).finally(()=>{if(alive.current)setBusy(false);});}
  return()=>{alive.current=false;controller.abort();request.current?.abort();};
 },[admin,read]);
 async function reload(){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');
  try{const d=await read();if(alive.current){setData(d);setForm(formOf(d));setUncertain(false);setNotice('已重新讀取後端設定，請核對目前內容。');}}
  catch(e){if(alive.current)setError(aiErrorMessage(e));}finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 const change=(key,value)=>{setForm(f=>({...f,[key]:value}));setNotice('');};
 async function save(event){
  event.preventDefault();if(inFlight.current||busy||uncertain||!data)return;
  inFlight.current=true;setBusy(true);setError('');setNotice('');const controller=new AbortController();request.current=controller;let saved=false;
  try{
   const body={...form,operation_id:crypto.randomUUID(),expected_revision:data.revision,max_output_tokens:Number(form.max_output_tokens)};
   if(body.key_action!=='REPLACE')delete body.api_key;
   const p=await client.request(path,{method:'POST',body,signal:controller.signal});
   if(!p.data?.saved||p.data.operation_id!==body.operation_id||p.data.revision!==data.revision+1)throw Object.assign(Error(),{code:'AI_SETTINGS_RESPONSE_INVALID',outcomeUnknown:true});
   saved=true;const d=await read(controller.signal);
   if(alive.current){setData(d);setForm(formOf(d));setNotice('設定已儲存至後端，將套用於之後的新請求。');setUncertain(false);onSaved?.();}
  }catch(e){if(alive.current){setForm(f=>({...f,api_key:''}));setUncertain(saved||e.outcomeUnknown||e.name==='AbortError');setError(saved?'設定已儲存，但重新讀取失敗；請重新讀取確認。':e.outcomeUnknown?'尚未確認儲存結果，請重新讀取核對，勿重複送出。':aiErrorMessage(e));}}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 const models=data&&form?modelOptions(data,form):[];
 const chosen=models.find(row=>row.id===form?.model);
 if(!admin)return <section className="admin-surface" aria-label={engine+' 模型設定'}><h4>模型與費用設定</h4><p>請由工作區管理者調整金鑰、模型啟用及費用上限。</p></section>;
 return <section className="admin-surface business-ai-settings" aria-label={engine+' 模型設定'}><div className="admin-section-top"><div><h4>模型與費用設定</h4><p>設定儲存於後端，適用目前工作區的 {engine}。</p></div><button type="button" className="template-btn" disabled={busy} onClick={reload}>重新讀取</button></div>
 {error&&<p className="management-error" role="alert">{error}</p>}{notice&&<p className="management-notice" role="status">{notice}</p>}
 {form&&data&&<form onSubmit={save}><fieldset disabled={busy||uncertain}>
 <div className="business-ai-enable"><div><strong>模型啟用</strong><small>關閉後停止新的 {engine} 模型請求，既有結果保留。</small></div><button type="button" role="switch" aria-label={engine+' 模型啟用'} aria-checked={form.enabled} className="business-ai-toggle" onClick={()=>change('enabled',!form.enabled)}><span/></button></div>
 <div className="business-ai-grid"><div className="business-ai-block"><h5>模型連線</h5><label>模型<select aria-label="模型" value={form.model} onChange={e=>change('model',e.target.value)}>{models.map(model=><option key={model.id} value={model.id} disabled={!model.selectable}>{model.id}{model.selectable?'':' — '+model.reason}</option>)}</select></label><small>{chosen?.reason||'模型相容性尚待確認'}</small><label>輸出 Token 上限<input required type="number" min="16" max={data.limits.max_output_tokens} step="1" value={form.max_output_tokens} onChange={e=>change('max_output_tokens',e.target.value)}/></label><details className="business-ai-model-list"><summary>檢視模型相容性（{models.length} 項）</summary><div className="business-ai-model-table" role="region" aria-label="模型相容性清單" tabIndex="0"><ActionTable><thead><tr><th>模型</th><th>可選狀態／原因</th><th>輸入／輸出價格（USD／百萬 Token）</th></tr></thead><tbody>{models.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.selectable?'可選 · ':'不可選 · '}{row.reason}</td><td>{row.input_usd_per_million===undefined?'未核對':`${row.input_usd_per_million}／${row.output_usd_per_million}`}</td></tr>)}</tbody></ActionTable></div></details><small>相容性依官方介面規格、目前金鑰清單與程式合約核對；不代表已執行付費模型實測。</small><p className="business-ai-endpoint">{data.provider}<br/>{data.endpoint}</p></div>
 <div className="business-ai-block"><h5>API Key</h5><p className="business-ai-key-state">{data.key_configured?'已設定 '+data.key_mask:'尚未設定'}<small>{data.key_mode==='OVERRIDE'?'此引擎專用金鑰':data.key_mode==='NONE'?'此引擎已移除金鑰':'沿用既有後端金鑰'}</small></p><label>金鑰操作<select aria-label="金鑰操作" value={form.key_action} onChange={e=>{change('key_action',e.target.value);setForm(f=>({...f,api_key:''}));}}><option value="KEEP">保留目前金鑰</option><option value="REPLACE">替換此引擎金鑰</option><option value="INHERIT">沿用既有後端金鑰</option><option value="REMOVE">移除此引擎金鑰</option></select></label>{form.key_action==='REPLACE'&&<label>新 API Key<input type="password" autoComplete="new-password" spellCheck="false" required minLength={20} maxLength={512} value={form.api_key} onChange={e=>change('api_key',e.target.value)} placeholder="貼上新金鑰"/></label>}{form.key_action==='REMOVE'&&<small>儲存後此引擎將無法呼叫模型，其他引擎不受影響。</small>}<small>完整金鑰不回傳至頁面；替換時加密保存。</small></div>
 <div className="business-ai-block"><h5>費用上限（USD）</h5><label>每次請求上限<input required type="number" min="0.000001" max={data.limits.per_call_usd} step="0.000001" value={form.per_call_usd} onChange={e=>change('per_call_usd',e.target.value)}/></label><label>帳本累計上限<input required type="number" min="0" max={data.limits.total_cap_usd} step="0.000001" value={form.total_cap_usd} onChange={e=>change('total_cap_usd',e.target.value)}/></label><small>{engine==='E2'?'E2 使用獨立帳本。':'E1、E3、E4 共用帳本；此上限會計入三者已花費與保留金額。'}達上限後停止新請求，不會重置費用。</small></div>
 <div className="business-ai-block"><h5>目前用量</h5><dl><div><dt>已花費</dt><dd>USD {data.usage.spent_usd}</dd></div><div><dt>待核對／保留</dt><dd>USD {data.usage.held_usd}</dd></div><div><dt>後端最高額度</dt><dd>USD {data.limits.total_cap_usd}</dd></div><div><dt>額度到期</dt><dd>{new Date(data.expires_at*1000).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</dd></div></dl><small>超出最高額度或切換未配置模型，需先完成後端額度與價格設定。儲存不會呼叫模型。</small></div></div>
 <div className="business-ai-block business-ai-engine-controls"><h5>{engine} 專屬控制項</h5><div className="business-ai-grid">{Object.entries(data.control_fields||{}).map(([key,field])=><label key={key}>{field.label}{field.type==='select'?<select aria-label={field.label} value={form.engine_controls[key]??field.default} onChange={e=>change('engine_controls',{...form.engine_controls,[key]:e.target.value})}>{Object.entries(field.options).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<input aria-label={field.label} type="number" required min={field.min} max={field.max} step="1" value={form.engine_controls[key]??field.default} onChange={e=>change('engine_controls',{...form.engine_controls,[key]:e.target.value===''?'':Number(e.target.value)})}/>}</label>)}</div><small>只調整 AI 建議與說明；既有簽核權限、必要檢查、排程規則、資料範圍及人工確認維持不變。</small></div></fieldset><footer><small>{data.updated_at?'上次儲存：'+new Date(data.updated_at*1000).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'目前沿用後端預設設定'}</small><button type="submit" className="management-primary" disabled={busy||uncertain}>{busy?'處理中…':'儲存設定'}</button></footer></form>}
 </section>;
}
