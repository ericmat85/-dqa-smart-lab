import {useCallback,useEffect,useRef,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import TemplatePreview,{downloadTemplate} from './TemplatePreview.jsx';
import {readTemplateLibrary,readUploadedTemplate} from './reportTemplateStore.mjs';
import {originalBusinessEnabled} from './originalBusiness.mjs';
import {trialTemplateCatalog,trialTemplateFile,saveTrialTemplate,pendingTrialTemplate,recoverTrialTemplate,TRIAL_TEMPLATE_EVENT} from './trialTemplateDeliveryClient.mjs';
export function useTrialTemplateBindings(account){
 const epoch=useRef(0);
 const [state,setState]=useState({trials:[],files:[],loading:true,error:''});
 const reload=useCallback(async()=>{const token=++epoch.current;if(!originalBusinessEnabled()){setState({trials:[],files:[],loading:false,error:'',can_manage:false});return;}try{const data=await trialTemplateCatalog(account.id);if(token===epoch.current)setState({...data,loading:false,error:''});}catch(e){if(token===epoch.current)setState({trials:[],files:[],loading:false,error:e.message,can_manage:false});}},[account.id]);
 useEffect(()=>{let active=true;const refresh=()=>{if(active)void reload();};refresh();window.addEventListener(TRIAL_TEMPLATE_EVENT,refresh);window.addEventListener('dqa:trial-catalog-updated',refresh);window.addEventListener('focus',refresh);return()=>{active=false;epoch.current++;window.removeEventListener(TRIAL_TEMPLATE_EVENT,refresh);window.removeEventListener('dqa:trial-catalog-updated',refresh);window.removeEventListener('focus',refresh);};},[reload]);return {...state,reload};
}
export default function TrialTemplateBinding({trial,account,files,onClose,onSaved}){
 const [source,setSource]=useState(trial.file_id?'file:'+trial.file_id:'upload'),[version,setVersion]=useState('V'+(files.filter(f=>f.trial_id===trial.id).length+1)),[file,setFile]=useState(null),[blanks,setBlanks]=useState([]),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(!!pendingTrialTemplate()),[preview,setPreview]=useState(null);
 useEffect(()=>{let active=true;readTemplateLibrary({actorId:account.id,system:'lms'}).then(l=>{if(active)setBlanks(l.rows.filter(r=>r.trialId==='BLANK'));}).catch(()=>{});return()=>{active=false;};},[account.id]);
 async function save(event){event.preventDefault();if(busy||uncertain)return;setBusy(true);setError('');try{let chosen=file;if(source.startsWith('blank:')){const r=await readUploadedTemplate(source.slice(6),{actorId:account.id,system:'lms'});chosen=new File([r.bytes],r.name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}if((source==='upload'||source.startsWith('blank:'))&&!confirmed)throw Error('請確認此檔為供執行使用的空白範本。');await saveTrialTemplate({actorId:account.id,trialId:trial.id,revision:trial.revision,fileId:source.startsWith('file:')?source.slice(5):null,file:source==='upload'||source.startsWith('blank:')?chosen:null,version});await onSaved();onClose();}catch(e){setError(e.message);setUncertain(!!pendingTrialTemplate());}finally{setBusy(false);}}
 async function recover(){setBusy(true);setError('');try{await recoverTrialTemplate(account.id);await onSaved();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const readPreview=useCallback(()=>trialTemplateFile(preview?.id,account.id),[preview?.id,account.id]);
 const current=files.find(f=>f.id===trial.file_id);
 return <CompactDialog title={'綁定範本文件｜'+trial.name} onClose={onClose} preventClose={busy} className="trial-catalog-editor trial-template-binding"><form onSubmit={save}>
 <p>目前綁定：{current?`${current.name} · ${current.version}`:'尚未綁定'}</p><label>範本來源<select aria-label="試驗範本來源" value={source} disabled={busy||uncertain} onChange={e=>{setSource(e.target.value);setConfirmed(false);}}><option value="upload">上傳新的 Excel 範本</option>{files.filter(f=>f.trial_id===trial.id).map(f=><option key={f.id} value={'file:'+f.id}>{f.name} · {f.version}</option>)}{blanks.map(f=><option key={f.id} value={'blank:'+f.id}>範本庫：{f.name} · {f.version}</option>)}<option value="clear">解除綁定（保留舊案件版本）</option></select></label>
 {source==='upload'&&<label>Excel 範本<input type="file" accept=".xlsx" aria-label="選擇試驗綁定範本" required disabled={busy||uncertain} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>}
 {(source==='upload'||source.startsWith('blank:'))&&<><label>範本版本<input aria-label="綁定範本版本" required maxLength={80} value={version} disabled={busy||uncertain} onChange={e=>setVersion(e.target.value)}/></label><label className="trial-binding-confirm"><input type="checkbox" checked={confirmed} disabled={busy||uncertain} onChange={e=>setConfirmed(e.target.checked)}/>確認這是供執行者使用的空白範本，不含實測結果或個人簽名</label></>}
 <p>.xlsx · 單檔 2 MB。綁定後僅套用到之後送出的委託；舊案件保留原版本。範本原稿不會自動填值，送簽仍依原有欄位與簽名規則檢查。</p>
 {current&&<div className="admin-actions"><button type="button" className="template-btn secondary" disabled={busy} onClick={()=>setPreview(current)}>預覽目前範本</button><button type="button" className="template-btn secondary" disabled={busy} onClick={async()=>{try{downloadTemplate(await trialTemplateFile(current.id,account.id));}catch(e){setError(e.message);}}}>下載目前範本</button></div>}
 {error&&<p role="alert">{error}</p>}<footer><button type="button" className="template-btn secondary" disabled={busy} onClick={onClose}>取消</button>{uncertain&&<button type="button" className="template-btn" disabled={busy} onClick={recover}>查詢綁定結果</button>}<button type="submit" className="template-btn" disabled={busy||uncertain}>{busy?'正在保存…':'儲存綁定'}</button></footer></form>
 {preview&&<TemplatePreview title={preview.name} read={readPreview} onClose={()=>setPreview(null)}/>}
 </CompactDialog>;
}
