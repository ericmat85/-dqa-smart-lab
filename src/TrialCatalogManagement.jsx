import LmsHeaderActionLabel from './LmsHeaderActionLabel.jsx';
import CatalogSearchToolbar from './CatalogSearchToolbar.jsx';
import {useId,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import useTrialCatalog from './useTrialCatalog.js';
import {defaultTrialCatalog,saveTrialDefinition} from './trialCatalogStore.mjs';
import {TRIAL_PROFILES} from './trialProfiles.mjs';
import {canEditAdmin} from './adminCenterStore.mjs';
import {explicitHours,sourceConditions} from './trialSourceFacts.mjs';
import {equipmentSpaceUnits} from './equipmentSpace.mjs';
import './TrialCatalogManagement.css';
function Editor({value,revision,account,onClose}){
 const [draft,setDraft]=useState(()=>({...value})),[error,setError]=useState(''),profile=TRIAL_PROFILES.find(p=>p.id===draft.profileId);
 function save(e){e.preventDefault();try{
  let specification=draft.specification;const hours=explicitHours({specification});sourceConditions({specification});
  if(hours!==null&&hours!==Number(draft.durationHours))throw Error('規範中的時長與工時欄位不同，請先確認一致。');
  if(hours===null)specification=`試驗時間：${draft.durationHours} 小時。\n`+specification;
  saveTrialDefinition({...draft,durationHours:Number(draft.durationHours),specification},account,{expectedRevision:revision});onClose();
 }catch(error){setError(error.message);}}
 return <CompactDialog title={value.id?'編輯試驗項目':'新增試驗項目'} onClose={onClose} className="trial-catalog-editor"><form onSubmit={save}>
  <div className="trial-catalog-form-grid"><label>試驗名稱<input aria-label="試驗名稱" required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>規範版本<input aria-label="規範版本" required maxLength={80} value={draft.version} onChange={e=>setDraft({...draft,version:e.target.value})}/></label>
  <label>排程類型<select aria-label="排程類型" disabled={!!value.id} value={draft.profileId} onChange={e=>{const row=defaultTrialCatalog().find(r=>r.profileId===e.target.value);setDraft({...draft,profileId:e.target.value,durationHours:row?.durationHours??'',specification:row?.specification??'',acceptance:row?.acceptance??'',equipment:row?.equipment??''});}}><option value="UNVERIFIED">新增類型，尚未設定排程規則</option>{TRIAL_PROFILES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
  <label>試驗工時（小時）<input aria-label="試驗工時（小時）" required type="number" min="0.01" max="24000" step="any" readOnly={profile?.fixed_duration} value={draft.durationHours} onChange={e=>{const hours=e.target.value;setDraft({...draft,durationHours:hours,specification:draft.specification.replace(/試驗時間：[^。\n]*。/,'試驗時間：'+hours+' 小時（合成示範）。')});}}/>{profile?.fixed_duration&&<small>此類型固定 {profile.hours} 小時，保留既有試驗規則。</small>}</label></div>
  {['specification','acceptance','equipment'].map((key,index)=><label className="trial-catalog-text" key={key}>{['試驗規範／試驗手法','判定參考','適用設備說明'][index]}<textarea aria-label={['試驗規範／試驗手法','判定參考','適用設備說明'][index]} required rows={key==='specification'?7:3} maxLength={key==='specification'?6000:key==='acceptance'?2000:300} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
  <p>保存於目前瀏覽器，供新委託單選用。既有委託單保留原內容；設備、人員、容量與實際占用仍需通過排程檢查。內容僅供合成 Demo，請勿填入真實客戶資料或憑證。</p>
  {error&&<p role="alert" className="management-error">{error}</p>}<footer><button type="button" className="template-btn" onClick={onClose}>取消</button><button type="submit" className="management-primary">儲存試驗項目</button></footer>
 </form></CompactDialog>;
}
export default function TrialCatalogManagement({account,equipment=[],schedules=[],equipmentAction}){
 const catalog=useTrialCatalog(),[search,setSearch]=useState(''),[editing,setEditing]=useState(null),editable=canEditAdmin(account),rows=catalog.rows.filter(r=>[r.name,r.version,r.specification].join(' ').toLowerCase().includes(search.toLowerCase()));
 const [tab,setTab]=useState('trials'),id=useId(),tabs=[['trials','共用試驗項目與方法',catalog.error?'—':catalog.rows.length],['equipment','設備可用空間與規格',equipment.length],['schedules','既有排程空間與保留時間',schedules.length]];
 function moveTab(event){const keys=['ArrowRight','ArrowLeft','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();const index=tabs.findIndex(([key])=>key===tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next][0]);event.currentTarget.parentElement.querySelectorAll('[role=tab]')[next].focus();}
 return <section className="trial-catalog-management" aria-label="試驗項目與設備參數管理">
  <div className="trial-parameter-tabs" role="tablist" aria-label="試驗與設備參數分類">{tabs.map(([key,title,count])=><button type="button" role="tab" key={key} id={`${id}-tab-${key}`} aria-label={title} aria-selected={tab===key} aria-controls={`${id}-panel-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={moveTab}>{title}<span aria-hidden="true">{count}</span></button>)}</div>
  <div role="tabpanel" id={`${id}-panel-trials`} aria-labelledby={`${id}-tab-trials`} hidden={tab!=='trials'} tabIndex={0}>
  <header className="trial-catalog-heading"><div><h3>共用試驗項目與方法</h3><p>新增或修改後，新委託單選單與 E4 查詢會讀取同一份目錄。點選試驗名稱展開內容。</p></div><div className="admin-actions">{equipmentAction}<button type="button" className="management-primary" disabled={!editable||!!catalog.error} onClick={()=>setEditing({...defaultTrialCatalog()[0],id:undefined,builtin:false,name:''})}><LmsHeaderActionLabel icon="add">新增試驗項目</LmsHeaderActionLabel></button></div></header>
  {!editable&&<p className="admin-note">目前帳號為唯讀，新增與編輯沿用現有管理權限。</p>}{catalog.error&&<p role="alert" className="management-error">{catalog.error}</p>}
  <div className="trial-catalog-searchbar"><CatalogSearchToolbar kind="試驗" label="搜尋試驗項目與規範" placeholder="搜尋試驗名稱、版本或規範文字…" value={search} onChange={setSearch} onClear={()=>setSearch('')}/><p role="status">{catalog.error?'目錄無法讀取':`顯示 ${rows.length}／${catalog.rows.length} 項試驗`}</p></div>
  <div className="trial-catalog-list">{rows.map(row=><article key={row.id}><details><summary><span className="trial-catalog-chevron" aria-hidden="true">›</span><span><strong>{row.name}</strong><small>{row.version}・{row.durationHours} 小時</small></span></summary><dl><div><dt>適用設備</dt><dd>{row.equipment}</dd></div><div><dt>試驗規範／試驗手法</dt><dd className="trial-catalog-spec">{row.specification}</dd></div><div><dt>判定參考</dt><dd>{row.acceptance}</dd></div></dl></details><button type="button" className="template-btn trial-catalog-edit" disabled={!editable||!!catalog.error} aria-label={'編輯'+row.name} onClick={()=>setEditing(row)}>編輯</button></article>)}</div>{!rows.length&&!catalog.error&&<p>沒有符合條件的試驗項目。</p>}
  </div>
  <div role="tabpanel" id={`${id}-panel-equipment`} aria-labelledby={`${id}-tab-equipment`} hidden={tab!=='equipment'} tabIndex={0}>
  <h3>設備可用空間與規格</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr>{['設備','名稱','可用空間 U','技術規格','狀態','下次校驗'].map(s=><th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{equipment.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.name}</td><td>{equipmentSpaceUnits(row)??'未填寫'}</td><td className="trial-catalog-spec">{row.specification||'未填寫'}</td><td>{row.status}</td><td>{row.nextCalibration||'未設定'}</td></tr>)}</tbody></table></div>
  </div>
  <div role="tabpanel" id={`${id}-panel-schedules`} aria-labelledby={`${id}-tab-schedules`} hidden={tab!=='schedules'} tabIndex={0}>
  <h3>既有排程空間與保留時間</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>委託</th><th>每件樣品占用 U</th><th>準備（分鐘）</th><th>清理（分鐘）</th></tr></thead><tbody>{schedules.map(row=><tr key={row.id}><td>{row.requestId||row.id}</td><td>{row.sampleSpaceUnits??'未填寫'}</td><td>{row.preparationMinutes??0}</td><td>{row.cleanupMinutes??0}</td></tr>)}</tbody></table></div>
  </div>
  {editing&&editable&&<Editor value={editing} revision={catalog.revision} account={account} onClose={()=>setEditing(null)}/>}
 </section>;
}
