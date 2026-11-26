import {useCallback,useEffect,useRef,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import TemplatePreview,{downloadTemplate} from './TemplatePreview.jsx';
import {originalBusinessEnabled} from './originalBusiness.mjs';
import {trialTemplateCatalog,trialTemplateFile,saveTrialTemplate,pendingTrialTemplate,recoverTrialTemplate,TRIAL_TEMPLATE_EVENT} from './trialTemplateDeliveryClient.mjs';
export function useTrialTemplateBindings(account){
 const epoch=useRef(0);
 const [state,setState]=useState({trials:[],files:[],loading:true,error:''});
 const reload=useCallback(async()=>{const token=++epoch.current;if(!originalBusinessEnabled()){setState({trials:[],files:[],owner:account.id,loading:false,error:'',can_manage:false});return;}try{const data=await trialTemplateCatalog(account.id);if(token===epoch.current)setState({...data,owner:account.id,loading:false,error:''});}catch(e){if(token===epoch.current)setState({trials:[],files:[],owner:account.id,loading:false,error:e.message,can_manage:false});}},[account.id]);
 useEffect(()=>{let active=true;const refresh=()=>{if(active)void reload();};refresh();window.addEventListener(TRIAL_TEMPLATE_EVENT,refresh);window.addEventListener('dqa:trial-catalog-updated',refresh);window.addEventListener('focus',refresh);return()=>{active=false;epoch.current++;window.removeEventListener(TRIAL_TEMPLATE_EVENT,refresh);window.removeEventListener('dqa:trial-catalog-updated',refresh);window.removeEventListener('focus',refresh);};},[reload]);return state.owner===account.id?{...state,reload}:{trials:[],files:[],loading:true,error:'',can_manage:false,reload};
}
export default function TrialTemplateBinding({trial,account,files,onClose,onSaved,initialFileId}){
 const [source,setSource]=useState(initialFileId?'file:'+initialFileId:trial.file_id?'file:'+trial.file_id:'upload'),[version,setVersion]=useState('V'+(files.filter(f=>f.trial_id===trial.id).length+1)),[file,setFile]=useState(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(!!pendingTrialTemplate()),[preview,setPreview]=useState(null);

 async function save(event){event.preventDefault();if(busy||uncertain)return;setBusy(true);setError('');try{let chosen=file;if((source==='upload')&&!confirmed)throw Error('請確認此檔為供執行使用的空白範本。');await saveTrialTemplate({actorId:account.id,trialId:trial.id,revision:trial.revision,fileId:source.startsWith('file:')?source.slice(5):null,file:source==='upload'?chosen:null,version});await onSaved();onClose();}catch(e){setError(e.message);setUncertain(!!pendingTrialTemplate());}finally{setBusy(false);}}
 async function recover(){setBusy(true);setError('');try{await recoverTrialTemplate(account.id);await onSaved();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const readPreview=useCallback(()=>trialTemplateFile(preview?.id,account.id),[preview?.id,account.id]);
 const current=files.find(f=>f.id===trial.file_id);
 return <CompactDialog title={'綁定範本文件｜'+trial.name} onClose={onClose} preventClose={busy} className="trial-catalog-editor trial-template-binding"><form onSubmit={save}>
 <p>目前綁定：{current?`${current.name} · ${current.version}`:'尚未綁定'}</p><label>範本來源<select aria-label="試驗範本來源" value={source} disabled={busy||uncertain} onChange={e=>{setSource(e.target.value);setConfirmed(false);}}><option value="upload">上傳新的試驗報告 Excel 範本</option>{files.filter(f=>f.trial_id===trial.id).map(f=><option key={f.id} value={'file:'+f.id}>{f.name} · {f.version}</option>)}<option value="clear">解除綁定（保留舊案件版本）</option></select></label>
 {source==='upload'&&<label>Excel 範本<input type="file" accept=".xlsx" aria-label="選擇試驗綁定範本" required disabled={busy||uncertain} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>}
 {(source==='upload')&&<><label>範本版本<input aria-label="綁定範本版本" required maxLength={80} value={version} disabled={busy||uncertain} onChange={e=>setVersion(e.target.value)}/></label><label className="trial-binding-confirm"><input type="checkbox" checked={confirmed} disabled={busy||uncertain} onChange={e=>setConfirmed(e.target.checked)}/>確認這是供執行者使用的空白範本，不含實測結果或個人簽名</label></>}
 <p>.xlsx · 單檔 2 MB。綁定後僅套用到之後送出的委託；舊案件保留原版本。空白委託單與報告範本分開管理。請至「文件與報告設定」完成本報告的儲存格對應；送簽後提供執行者的是已代入委託資訊的報告單。</p>
 {current&&<div className="admin-actions"><button type="button" className="template-btn secondary" disabled={busy} onClick={()=>setPreview(current)}>預覽目前範本</button><button type="button" className="template-btn secondary" disabled={busy} onClick={async()=>{try{downloadTemplate(await trialTemplateFile(current.id,account.id));}catch(e){setError(e.message);}}}>下載目前範本</button></div>}
 {error&&<p role="alert">{error}</p>}<footer><button type="button" className="template-btn secondary" disabled={busy} onClick={onClose}>取消</button>{uncertain&&<button type="button" className="template-btn" disabled={busy} onClick={recover}>查詢綁定結果</button>}<button type="submit" className="template-btn" disabled={busy||uncertain}>{busy?'正在保存…':'儲存綁定'}</button></footer></form>
 {preview&&<TemplatePreview title={preview.name} read={readPreview} onClose={()=>setPreview(null)}/>}
 </CompactDialog>;
}
