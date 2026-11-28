import TrialConditionFields from './TrialConditionFields.jsx';
import TrialEquipmentPicker from './TrialEquipmentPicker.jsx';
import SpecificationParameterManager from './SpecificationParameterManager.jsx';
import {capabilityLabel} from './equipmentCapabilities.mjs';
import {conditionRangeLabel,resolveConditionEdits} from './trialConditionTolerance.mjs';
import {loadTrialEditor} from './trialEditorClient.mjs';
import TrialDescriptionEditor,{TrialDescription} from './TrialDescriptionEditor.jsx';
import {TRIAL_CONDITIONS,trialDetails,validateTrialDetails,descriptionText,compoundEditorDetails,newSubTrial} from './trialDefinitionDetails.mjs';
import TrialCalendarFields from './TrialCalendarFields.jsx';
import {defaultCalendarPolicy,schedulingDaysForHours} from './schedulingCalendar.mjs';
import './SchedulingCalendarPanel.css';
import {TRIAL_TYPES,trialType,trialTypeLabel,isCompoundTrialType} from './trialTypes.mjs';
import {originalBusinessEnabled,resourceCan,resourceReference} from './originalBusiness.mjs';
import useResourceMutation from './useResourceMutation.js';
import ResourceOperationNotice from './ResourceOperationNotice.jsx';
import {resourceCommand,trialPayload} from './resourceCommands.mjs';
import LmsHeaderActionLabel from './LmsHeaderActionLabel.jsx';
import EquipmentPortSettings from './EquipmentPortSettings.jsx';
import CatalogSearchToolbar from './CatalogSearchToolbar.jsx';
import {useEffect,useId,useRef,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import useTrialCatalog from './useTrialCatalog.js';
import {defaultTrialCatalog,saveTrialDefinition,deleteTrialDefinition} from './trialCatalogStore.mjs';
import {TRIAL_PROFILES} from './trialProfiles.mjs';
import {canEditAdmin} from './adminCenterStore.mjs';
import {explicitHours,sourceConditions} from './trialSourceFacts.mjs';
import {equipmentSpaceUnits} from './equipmentSpace.mjs';
import './TrialCatalogManagement.css';
function Editor({value,revision,account,equipment,onClose}){
 const operation=useResourceMutation(),source=useRef(resourceReference('trial',value.id));
 const [conditionEdits,setConditionEdits]=useState({});
 const [imageBusy,setImageBusy]=useState(false);
 const [loading,setLoading]=useState(originalBusinessEnabled()&&!!value.id);

 const [draft,setDraft]=useState(()=>({...value,trialType:trialType(value),definitionDetails:isCompoundTrialType(trialType(value))?compoundEditorDetails(trialDetails(value)):trialDetails(value)})),[error,setError]=useState(''),profile=TRIAL_PROFILES.find(p=>p.id===draft.profileId);
 useEffect(()=>{if(!originalBusinessEnabled()||!value.id)return;let active=true;loadTrialEditor(value.id).then(details=>{if(active){setDraft(d=>({...d,definitionDetails:isCompoundTrialType(d.trialType)?compoundEditorDetails(details):details}));setLoading(false);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[value.id]);
 const updateDetails=patch=>setDraft(d=>({...d,definitionDetails:{...d.definitionDetails,...patch}}));
 function changeTrialType(next){
  if(isCompoundTrialType(next)&&!isCompoundTrialType(draft.trialType)){
   const details=compoundEditorDetails(draft.definitionDetails);setConditionEdits({[details.sub_trials[0].id]:conditionEdits.root||{}});setDraft({...draft,trialType:next,definitionDetails:details});return;
  }
  if(!isCompoundTrialType(next)&&draft.definitionDetails.sub_trials?.length){
   if(!window.confirm('改為單一試驗後，將保留第一個子試驗的條件與設備，並移除其餘子試驗設定。是否繼續？'))return;
   const {sub_trials,...details}=draft.definitionDetails;setConditionEdits({root:conditionEdits[sub_trials[0].id]||{}});setDraft({...draft,trialType:next,definitionDetails:{...details,conditions:sub_trials[0].conditions,equipment_ids:sub_trials[0].equipment_ids}});return;
  }
  setDraft({...draft,trialType:next});
 }
 const editChild=(id,patch)=>updateDetails({sub_trials:draft.definitionDetails.sub_trials.map(c=>c.id===id?{...c,...patch}:c)});
 const moveChild=(index,delta)=>{const rows=[...draft.definitionDetails.sub_trials];[rows[index],rows[index+delta]]=[rows[index+delta],rows[index]];updateDetails({sub_trials:rows});};
 async function remove(){if(!window.confirm('刪除「'+value.name+'」？新委託單將不再顯示此項目，既有紀錄保留。'))return;try{if(originalBusinessEnabled()){if(await operation.submit(resourceCommand('trial','delete',value.id,{reason:'由試驗項目編輯器刪除'},{expectedRevision:source.current.revision}),'試驗項目已刪除。'))onClose();}else{deleteTrialDefinition(value.id,account,{expectedRevision:revision});onClose();}}catch(e){setError(e.message);}}
 async function save(e){e.preventDefault();if(loading||imageBusy)return;try{
  const current=draft.definitionDetails;if(isCompoundTrialType(draft.trialType)&&current.sub_trials?.length<2)throw Error('複合試驗至少需要 2 個子試驗。');
  const definitionDetails=validateTrialDetails({...current,conditions:resolveConditionEdits(current.conditions,conditionEdits.root),...(current.sub_trials?.length?{sub_trials:current.sub_trials.map(c=>({...c,name:c.name.trim(),conditions:resolveConditionEdits(c.conditions,conditionEdits[c.id])}))}:{})},{trialType:draft.trialType});let specification=descriptionText(definitionDetails.description);const hours=explicitHours({specification});sourceConditions({specification});
  if(hours!==null&&hours!==Number(draft.durationHours))throw Error('規範中的時長與工時欄位不同，請先確認一致。');
  if(hours===null&&draft.profileId!=='COMPOUND_ENVIRONMENT')specification=`試驗時間：${draft.durationHours} 小時。\n`+specification;
  if(descriptionText(definitionDetails.description)!==specification)definitionDetails.description=[{type:'text',text:`試驗時間：${draft.durationHours} 小時。`},...definitionDetails.description];
  if(originalBusinessEnabled()){if(await operation.submit(resourceCommand('trial','save',value.id,trialPayload({...draft,specification,definitionDetails}),{expectedRevision:source.current?.revision||0}),'試驗項目已儲存，新委託單與助理將讀取更新後的目錄。'))onClose();return;}
  saveTrialDefinition({...draft,durationHours:Number(draft.durationHours),specification,definitionDetails},account,{expectedRevision:revision});onClose();
 }catch(error){setError(error.message==='TRIAL_DETAILS_INVALID'?'請確認子試驗名稱不重複、各組條件、設備及圖文內容。':error.message);}}
 return <CompactDialog preventClose={operation.busy||imageBusy} title={value.id?'編輯試驗項目':'新增試驗項目'} onClose={onClose} className="trial-catalog-editor"><form onSubmit={save}>{loading&&<p role="status">讀取試驗圖文與設備設定…</p>}<fieldset className="trial-editor-fields" disabled={loading||operation.locked}>
  <div className="trial-catalog-form-grid"><label>試驗名稱<input disabled={operation.locked} aria-label="試驗名稱" required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>規範版本<input disabled={operation.locked} aria-label="規範版本" required maxLength={80} value={draft.version} onChange={e=>setDraft({...draft,version:e.target.value})}/></label>
  <label>試驗類型<select aria-label="試驗類型" disabled={operation.locked} value={draft.trialType} onChange={e=>changeTrialType(e.target.value)}>{TRIAL_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>

  <label>試驗工時（小時）<input aria-label="試驗工時（小時）" required type="number" min={draft.profileId==='COMPOUND_ENVIRONMENT'?0:.01} max="24000" step="any" disabled={operation.locked||draft.profileId==='COMPOUND_ENVIRONMENT'} readOnly={profile?.fixed_duration} value={draft.durationHours} onChange={e=>{const hours=e.target.value;setDraft({...draft,durationHours:hours,definitionDetails:{...draft.definitionDetails,description:draft.definitionDetails.description.map(b=>b.type==='text'?{...b,text:b.text.replace(/試驗時間：[^。\n]*。/,'試驗時間：'+hours+' 小時。')}:b)}});}}/>{profile?.fixed_duration&&<small>此類型固定 {profile.hours} 小時，保留既有試驗規則。</small>}{Number(draft.durationHours)>0&&Number(draft.durationHours)<=24000&&<small>排程以 24 小時換算一天，共 {schedulingDaysForHours(Number(draft.durationHours))} 天（未滿一天以一天計）。</small>}</label>
  {!isCompoundTrialType(draft.trialType)&&<TrialConditionFields conditions={draft.definitionDetails.conditions} onChange={conditions=>updateDetails({conditions})} edits={conditionEdits.root} onEdits={edits=>setConditionEdits(v=>({...v,root:edits}))} disabled={operation.locked}/>}</div>
  {isCompoundTrialType(draft.trialType)&&<section className="compound-sub-trials" aria-label="子試驗設定"><header><div><h4>子試驗 <span>{draft.definitionDetails.sub_trials?.length||0}／20</span></h4><p>依試驗順序新增子試驗，各自設定試驗條件與適用設備。</p></div><button type="button" className="management-primary" disabled={operation.locked||draft.definitionDetails.sub_trials?.length>=20} onClick={()=>updateDetails({sub_trials:[...(draft.definitionDetails.sub_trials||[]),newSubTrial()]})}><LmsHeaderActionLabel icon="add">新增子試驗</LmsHeaderActionLabel></button></header>{draft.definitionDetails.sub_trials?.map((child,index)=><fieldset className="compound-sub-trial" key={child.id} aria-label={`子試驗 ${index+1}`}><legend>子試驗 {index+1}</legend><div className="sub-trial-heading"><label>子試驗名稱<input aria-label={`子試驗 ${index+1} 名稱`} required maxLength={80} value={child.name} onChange={e=>editChild(child.id,{name:e.target.value})} placeholder="例如：高溫放置"/></label><div className="sub-trial-actions"><button type="button" className="template-btn secondary" aria-label={`上移子試驗 ${index+1}`} disabled={operation.locked||index===0} onClick={()=>moveChild(index,-1)}>上移</button><button type="button" className="template-btn secondary" aria-label={`下移子試驗 ${index+1}`} disabled={operation.locked||index===draft.definitionDetails.sub_trials.length-1} onClick={()=>moveChild(index,1)}>下移</button><button type="button" className="template-btn danger" aria-label={`移除子試驗 ${index+1}`} disabled={operation.locked} onClick={()=>{updateDetails({sub_trials:draft.definitionDetails.sub_trials.filter(c=>c.id!==child.id)});setConditionEdits(v=>Object.fromEntries(Object.entries(v).filter(([id])=>id!==child.id)));}}>移除</button></div></div><TrialConditionFields prefix={`子試驗 ${index+1}`} conditions={child.conditions} onChange={conditions=>editChild(child.id,{conditions})} edits={conditionEdits[child.id]} onEdits={edits=>setConditionEdits(v=>({...v,[child.id]:edits}))} disabled={operation.locked}/><TrialEquipmentPicker prefix={`子試驗 ${index+1}`} ids={child.equipment_ids} equipment={equipment} onChange={equipment_ids=>editChild(child.id,{equipment_ids})} disabled={operation.locked}/></fieldset>)}{!draft.definitionDetails.sub_trials?.length&&<p>請新增至少 2 個子試驗。</p>}</section>}
  <p className="trial-type-description" role="note">{TRIAL_TYPES.find(t=>t.id===draft.trialType)?.description} 類型用於分類；設備、工時與階段安排依既有試驗規則及委託設定。</p>
  {originalBusinessEnabled()&&<section><label className="admin-checkbox"><input type="checkbox" checked={!!draft.calendarPolicy} disabled={operation.locked} onChange={e=>setDraft({...draft,calendarPolicy:e.target.checked?defaultCalendarPolicy(draft):undefined})}/>編輯此試驗的日曆規則（未勾選時保留原設定）</label>{draft.calendarPolicy&&<TrialCalendarFields value={draft.calendarPolicy} onChange={calendarPolicy=>setDraft({...draft,calendarPolicy})} disabled={operation.locked}/>}</section>}
  {!isCompoundTrialType(draft.trialType)&&<TrialEquipmentPicker ids={draft.definitionDetails.equipment_ids} equipment={equipment} onChange={equipment_ids=>updateDetails({equipment_ids})} disabled={operation.locked}/>}
  <TrialDescriptionEditor onBusy={setImageBusy} blocks={draft.definitionDetails.description} disabled={operation.locked} onChange={description=>updateDetails({description})}/>
  {['acceptance','equipment'].map((key,index)=><label className="trial-catalog-text" key={key}>{['判定參考','適用設備補充說明'][index]}<textarea disabled={operation.locked} aria-label={['判定參考','適用設備補充說明'][index]} required rows={key==='specification'?7:3} maxLength={key==='specification'?6000:key==='acceptance'?2000:300} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
  </fieldset><p>{originalBusinessEnabled()?'儲存至共用資料庫，既有委託單保留當時的試驗內容。':'保存於目前瀏覽器，供新委託單選用。既有委託單保留原內容。'}</p><ResourceOperationNotice operation={operation} onSaved={onClose}/>
  {error&&<p role="alert" className="management-error">{error}</p>}<footer><button type="button" className="template-btn secondary" disabled={operation.busy||imageBusy} onClick={onClose}>取消</button>{value.id&&<button type="button" className="template-btn danger trial-delete-button" disabled={operation.locked||imageBusy} onClick={remove}><LmsHeaderActionLabel icon="clear">刪除試驗項目</LmsHeaderActionLabel></button>}<button type="submit" disabled={operation.locked||loading||imageBusy} className="management-primary">儲存試驗項目</button></footer>
 </form></CompactDialog>;
}
function CatalogDescription({row}){const [details,setDetails]=useState(()=>trialDetails(row)),[error,setError]=useState('');useEffect(()=>{if(!originalBusinessEnabled())return;let active=true;loadTrialEditor(row.id).then(d=>{if(active)setDetails(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[row.id]);return <>{error&&<p role="alert">{error}</p>}<TrialDescription blocks={details.description}/></>;}
export default function TrialCatalogManagement({account,equipment=[],schedules=[],equipmentAction:_equipmentAction}){
 const catalog=useTrialCatalog(),[search,setSearch]=useState(''),[editing,setEditing]=useState(null),[opened,setOpened]=useState({}),[parameters,setParameters]=useState(false),editable=originalBusinessEnabled()?resourceCan('catalog.manage'):canEditAdmin(account),rows=catalog.rows.filter(r=>[r.name,r.version,r.specification].join(' ').toLowerCase().includes(search.toLowerCase()));
 const [tab,setTab]=useState('trials'),id=useId(),tabs=[['trials','共用試驗項目與方法',catalog.error?'—':catalog.rows.length],['equipment','設備可用空間與規格',equipment.length],['schedules','既有排程空間與保留時間',schedules.length],['ports','設備端口設定',null]];
 function moveTab(event){const keys=['ArrowRight','ArrowLeft','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();const index=tabs.findIndex(([key])=>key===tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next][0]);event.currentTarget.parentElement.querySelectorAll('[role=tab]')[next].focus();}
 return <section className="trial-catalog-management" aria-label="試驗項目與設備參數管理">
  <div className="trial-parameter-tabs" role="tablist" aria-label="試驗與設備參數分類">{tabs.map(([key,title,count])=><button type="button" role="tab" key={key} id={`${id}-tab-${key}`} aria-label={title} aria-selected={tab===key} aria-controls={`${id}-panel-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={moveTab}>{title}{count!==null&&<span aria-hidden="true">{count}</span>}</button>)}</div>
  <div role="tabpanel" id={`${id}-panel-trials`} aria-labelledby={`${id}-tab-trials`} hidden={tab!=='trials'} tabIndex={0}>
  <header className="trial-catalog-heading"><div><h3>共用試驗項目與方法</h3><p>新增或修改後，新委託單選單與 E4 查詢會讀取同一份目錄。點選試驗名稱展開內容。</p></div><div className="admin-actions"><button type="button" className="template-btn secondary" disabled={!editable||!!catalog.error} onClick={()=>setParameters(true)}><LmsHeaderActionLabel icon="add">新增規格參數</LmsHeaderActionLabel></button><button type="button" className="management-primary" disabled={!editable||!!catalog.error} onClick={()=>setEditing({...defaultTrialCatalog()[0],id:undefined,builtin:false,name:'',profileId:'UNVERIFIED',durationHours:4,specification:'試驗時間：4 小時。',acceptance:'依試驗規範判定',equipment:'依適用設備設定',version:'V1'})}><LmsHeaderActionLabel icon="add">新增試驗項目</LmsHeaderActionLabel></button></div></header>
  {!originalBusinessEnabled()&&<p className="admin-note">範本綁定與自動提供需連接工作區資料庫；Demo 保留原有範本下載。</p>}{!editable&&<p className="admin-note">目前帳號為唯讀，新增與編輯沿用現有管理權限。</p>}{catalog.error&&<p role="alert" className="management-error">{catalog.error}</p>}
  <div className="trial-catalog-searchbar"><CatalogSearchToolbar kind="試驗" label="搜尋試驗項目與規範" placeholder="搜尋試驗名稱、版本或規範文字…" value={search} onChange={setSearch} onClear={()=>setSearch('')}/><p role="status">{catalog.error?'目錄無法讀取':`顯示 ${rows.length}／${catalog.rows.length} 項試驗`}</p></div>
  <div className="trial-catalog-list">{rows.map(row=><article key={row.id}><details onToggle={e=>{const open=e.currentTarget.open;setOpened(v=>({...v,[row.id]:open}));}}><summary><span className="trial-catalog-chevron" aria-hidden="true">›</span><span><strong>{row.name}</strong><small>{row.version}・{row.profileId==='COMPOUND_ENVIRONMENT'?'依專案階段工時':row.durationHours+' 小時'}</small></span></summary><dl><div><dt>試驗類型</dt><dd>{trialTypeLabel(row)}</dd></div>{trialDetails(row).sub_trials?.length?<div className="catalog-sub-trials"><dt>子試驗</dt><dd>{trialDetails(row).sub_trials.map((child,index)=><section key={child.id}><strong>{index+1}. {child.name}</strong><p>試驗條件：{child.conditions.map(c=>(TRIAL_CONDITIONS.find(t=>t.id===c.kind)?.label||c.kind)+'：'+conditionRangeLabel(c)).join('；')||'依試驗規範'}</p><p>適用設備：{child.equipment_ids.map(id=>equipment.find(e=>(e.databaseId||e.id)===id)?.name||'已移除的設備').join('、')||'尚未指定'}</p></section>)}</dd></div>:<><div><dt>試驗條件</dt><dd>{trialDetails(row).conditions.map(c=>(TRIAL_CONDITIONS.find(t=>t.id===c.kind)?.label||c.kind)+'：'+conditionRangeLabel(c)).join('；')||'依試驗規範'}</dd></div><div><dt>適用設備</dt><dd>{trialDetails(row).equipment_ids.map(id=>equipment.find(e=>(e.databaseId||e.id)===id)?.name||'已移除的設備').join('、')||row.equipment}</dd></div></>}<div><dt>試驗規範／試驗手法</dt><dd className="trial-catalog-spec">{opened[row.id]?<CatalogDescription row={row}/>:null}</dd></div><div><dt>判定參考</dt><dd>{row.acceptance}</dd></div></dl></details><div className="trial-catalog-row-actions"><button type="button" className="template-btn trial-catalog-edit" disabled={!editable||!!catalog.error} aria-label={'編輯'+row.name}  onClick={()=>setEditing(row)}>編輯</button></div></article>)}</div>{!rows.length&&!catalog.error&&<p>沒有符合條件的試驗項目。</p>}
  </div>
  <div role="tabpanel" id={`${id}-panel-equipment`} aria-labelledby={`${id}-tab-equipment`} hidden={tab!=='equipment'} tabIndex={0}>
  <h3>設備可用空間與規格</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr>{['設備','名稱','可用空間 U','技術規格','狀態','下次校驗'].map(s=><th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{equipment.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.name}</td><td>{equipmentSpaceUnits(row)??'未填寫'}</td><td className="trial-catalog-spec">{[...(row.capabilities||[]).map(capabilityLabel),row.specification].filter(Boolean).join('；')||'未填寫'}</td><td>{row.status}</td><td>{row.nextCalibration||'未設定'}</td></tr>)}</tbody></table></div>
  </div>
  <div role="tabpanel" id={`${id}-panel-schedules`} aria-labelledby={`${id}-tab-schedules`} hidden={tab!=='schedules'} tabIndex={0}>
  <h3>既有排程空間與保留時間</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>委託</th><th>每件樣品占用 U</th><th>準備（分鐘）</th><th>清理（分鐘）</th></tr></thead><tbody>{schedules.map(row=><tr key={row.id}><td>{row.requestId||row.id}</td><td>{row.sampleSpaceUnits??'未填寫'}</td><td>{row.preparationMinutes??0}</td><td>{row.cleanupMinutes??0}</td></tr>)}</tbody></table></div>
  </div>
  <div role="tabpanel" id={`${id}-panel-ports`} aria-labelledby={`${id}-tab-ports`} hidden={tab!=='ports'} tabIndex={0}>{tab==='ports'&&<EquipmentPortSettings key={account.id} account={account} equipment={equipment}/>}</div>

  {editing&&editable&&<Editor value={editing} revision={catalog.revision} account={account} equipment={equipment} onClose={()=>setEditing(null)}/>}
 {parameters&&<SpecificationParameterManager account={account} onClose={()=>setParameters(false)}/>}</section>;
}
