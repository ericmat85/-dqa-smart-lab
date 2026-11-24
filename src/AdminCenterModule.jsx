import {ActionTable} from './tableActionIcons.jsx';
import {originalBusinessEnabled} from './originalBusiness.mjs';
import WorkspaceProfileSettings from './WorkspaceProfileSettings.jsx';
import SignatureMethodSettings from './SignatureMethodSettings.jsx';
import BusinessNotificationDelivery from './BusinessNotificationDelivery.jsx';
import AccountImageSettings from './AccountImageSettings.jsx';
import DataMaintenance from './DataMaintenance.jsx';
import LmsHeaderActionLabel from './LmsHeaderActionLabel.jsx';
import AdminOperations from './AdminOperations.jsx';
import {OPERATION_MODULES} from './adminOperations.mjs';
import {AdminModuleNav} from './AdminCenterCards.jsx';
import ReportTemplateCenter from './ReportTemplateCenter.jsx';
import InterfaceSettings from './InterfaceSettings.jsx';
import EquipmentActivityPreferences from './EquipmentActivityPreferences.jsx';
import ReportPreferences from './ReportPreferences.jsx';
import TrialCatalogManagement from './TrialCatalogManagement.jsx';
import './AdminCenter.css';
import {useEffect,useState} from 'react';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import CompactDialog from './CompactDialog.jsx';
import SignatureSettingsDialog from './SignatureSettingsDialog.jsx';
import AdminEngineWorkspace from './AdminEngineWorkspace.jsx';
import {canAccessLmsPage} from './customRoles.mjs';
import {canManageAccounts} from './demoPermissions.mjs';
import {ADMIN_INTEGRATION_NOTES,ADMIN_FIELDS,ADMIN_MODULES,WORKFLOW_RULES,AI_ENGINE_PAGES} from './adminCenterData.mjs';
import {canViewAdmin,canEditAdmin,saveAdminSection,resetAdminSettings} from './adminCenterStore.mjs';
import useAdminSettings from './useAdminSettings.js';
import useLabView from './useLabView.js';
import {createReportTemplate} from './reportWorkbook.mjs';
const date=value=>value?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
const text=value=>value===undefined||value===null||value===''?'未設定':String(value);
function Table({label,columns,rows}){return <div className="admin-table-wrap" tabIndex={0} role="region" aria-label={label}><ActionTable className="template-table admin-table"><caption>{label}</caption><thead><tr>{columns.map(([id,label])=><th key={id} scope="col">{label}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,i)=><tr key={row.id||i}>{columns.map(([id])=><td key={id}>{text(row[id])}</td>)}</tr>):<tr><td colSpan={columns.length}>尚無紀錄</td></tr>}</tbody></ActionTable></div>;}
function Info({items}){return <dl className="admin-info-grid">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;}
function SettingDialog({module,value,onSave,onClose}){
 const [draft,setDraft]=useState(()=>({...value})),[error,setError]=useState('');
 const item=ADMIN_MODULES.find(m=>m.id===module);
 return <CompactDialog title={`編輯${item.title}`} onClose={onClose} className="admin-edit-dialog"><form className="admin-edit-form" onSubmit={event=>{event.preventDefault();try{onSave(draft);onClose();}catch(e){setError(e.message);}}}><p>設定保存於目前瀏覽器；不改變案件、排程或簽核規則。{module==='ai'&&'E2 與 E4 另有實際請求監控；排程偏好請使用頁面的專屬設定，模型啟用仍由伺服器決定。'}</p><div className="admin-form-grid">{ADMIN_FIELDS[module].filter(f=>module!=='ai'||!['assistant','schedule'].includes(f.key)).map(f=><label key={f.key} className={f.type==='checkbox'?'admin-checkbox':''}>{f.type==='checkbox'?<><input type="checkbox" checked={draft[f.key]} onChange={e=>setDraft({...draft,[f.key]:e.target.checked})}/><span>{f.label}</span></>:<><span>{f.label}</span>{f.options?<select aria-label={f.label} value={draft[f.key]} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}>{f.options.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>:<input aria-label={f.label} type={f.type||'text'} required maxLength={300} min={f.min} max={f.max} value={draft[f.key]} onChange={e=>setDraft({...draft,[f.key]:f.type==='number'?Number(e.target.value):e.target.value})}/>}</>}</label>)}</div>{error&&<p role="alert" className="management-error">{error}</p>}<footer><button type="button" className="template-btn" onClick={onClose}>取消</button><button className="management-primary" type="submit">儲存設定</button></footer></form></CompactDialog>;
}
export default function AdminCenterModule({module:requestedModule,engine,account,onOpen,onNavigate}){
 const module=requestedModule==='data-maintenance'?'backup':requestedModule;
 const [systemTabChoice,setSystemTab]=useState(()=>{const tabs=['backup','branding',...(canViewAdmin(account,'parameters')?['parameters']:[]),...(canViewAdmin(account,'data-maintenance')?['maintenance']:[])],requested=requestedModule==='data-maintenance'?'maintenance':new URLSearchParams(location.search).get('section');return tabs.includes(requested)?requested:canViewAdmin(account,'parameters')?'parameters':'backup';});
 const systemTab=((systemTabChoice==='parameters'&&!canViewAdmin(account,'parameters'))||(systemTabChoice==='maintenance'&&!canViewAdmin(account,'data-maintenance')))?'backup':systemTabChoice;
 const {snapshot,metrics,now}=useLabView(),{data,error,refresh}=useAdminSettings();
 const [editing,setEditing]=useState(false),[signatureOpen,setSignatureOpen]=useState(false),[notice,setNotice]=useState(''),[operationError,setOperationError]=useState('');
 const enginePage=module==='ai'&&engine?AI_ENGINE_PAGES.find(e=>e.code===engine):null;
 const item=ADMIN_MODULES.find(m=>m.id===module),editable=canEditAdmin(account),allowed=canViewAdmin(account,module)&&(requestedModule!=='data-maintenance'||canViewAdmin(account,'data-maintenance'));
 useEffect(()=>{if(module==='parameters'&&allowed&&new URLSearchParams(location.search).get('section')==='activity'){const target=document.getElementById('equipment-activity-settings');target?.scrollIntoView({block:'center'});target?.querySelector('input')?.focus({preventScroll:true});}},[module,allowed]);
 const go=(page,label,filter)=>canAccessLmsPage(account,page)&&(page!=='accounts'||canManageAccounts(account))?<button type="button" className="template-btn" onClick={()=>onNavigate(page,filter)}><LmsHeaderActionLabel icon="equipment">{label}</LmsHeaderActionLabel></button>:<span className="admin-muted">{label}：現有權限未開放</span>;
 const act=fn=>{try{fn();refresh();setOperationError('');}catch(e){setOperationError(e.message);}};
 const reset=()=>{if(window.confirm('只重設管理中心設定與其歷程；不會清除委託單、排程、報告、帳號或簽名。確定繼續？'))act(()=>{resetAdminSettings(account);setNotice('已重設管理中心設定，案件資料未變更。');});};
 if(!item||!allowed||(engine&&!enginePage))return <section className="panel generic-page admin-module"><h2>系統管理中心</h2><p role="alert">{engine&&!enginePage?'找不到此 AI 引擎頁面。':item?'此角色無權開啟此管理模組。':'找不到此管理模組。'}</p></section>;
 const settings=data?.settings[module];
 return <section className="panel generic-page management-page admin-module"><div className="template-page"><AdminModuleNav account={account} active={module} onOpen={onOpen}/><div id="admin-module-panel" role="tabpanel" aria-labelledby={`admin-module-tab-${module}`}><header className="template-heading management-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name={item.icon}/>{enginePage?enginePage.name:item.title}</h2></div><p>{enginePage?enginePage.description:item.description}</p></div><div className="admin-actions">{enginePage&&<button type="button" className="template-btn" onClick={()=>onOpen('ai')}><LmsHeaderActionLabel icon="back">返回 AI 引擎管理</LmsHeaderActionLabel></button>}{settings&&editable&&((module==='backup'&&systemTab==='backup')||module==='documents'||(module==='organization'&&!originalBusinessEnabled()))&&<button type="button" className="management-primary" onClick={()=>setEditing(true)}><LmsHeaderActionLabel icon="edit">編輯設定</LmsHeaderActionLabel></button>}</div></header>
 {snapshot.sources.some(s=>s.error)&&<p role="alert" className="management-error">部分業務來源無法讀取，相關統計可能不完整；請至系統監控查核，原始資料未覆寫。</p>}
 {error&&<p role="alert" className="management-error">{error}</p>}{operationError&&<p role="alert" className="management-error">{operationError}</p>}{notice&&<p role="status" className="management-notice">{notice}</p>}
 {module!=='interface'&&ADMIN_INTEGRATION_NOTES[module]&&<Table label="整合分類與現況（唯讀）" columns={[["name","分類"],["state","狀態"],["detail","資料來源與限制"]]} rows={ADMIN_INTEGRATION_NOTES[module].map(([name,state,detail])=>({id:name,name,state,detail}))}/>}
 {['organization','documents'].includes(module)&&<WorkspaceProfileSettings key={`${account?.id}-${module}`} module={module} account={account}/>}
 {module==='notifications'&&<BusinessNotificationDelivery/>}
 {module!=='backup'&&OPERATION_MODULES.includes(module)&&<AdminOperations key={module} {...{module,account,snapshot,metrics,now,data}} onRefresh={()=>{refresh();setNotice('');}} onNavigate={onNavigate} onOpen={onOpen}/>}
 {module==='workflow'&&<><section className="admin-surface" aria-label="日期與排程規則"><h3>日期與排程規則</h3><p>以 Asia / Taipei（台灣時間）顯示日期、排程時間與匯出摘要；依已儲存日程及接收紀錄推進狀態。本週統計採週一至週日。</p><p>連續型試驗與操作型試驗的工作日限制，仍依試驗目錄及原有排程檢查執行。</p></section><p className="admin-note">唯讀規則說明；沒有修改狀態機的控制。待確認在既有電子委託資料可仍顯示待排程，以實驗室接收紀錄區分；接收後等待排程開始，再進入試驗中。</p><ol className="admin-flow-strip">{WORKFLOW_RULES.map(r=><li key={r.id}><b>{r.id}</b>{r.stage}<small>{snapshot.sources.some(s=>s.error)?'來源待確認':`${snapshot.requests.filter(row=>row.status===r.stage).length} 件`}</small></li>)}</ol><Table label="工作流程規則" columns={[["stage","流程階段"],["role","負責角色"],["actions","允許操作"],["next","下一階段"],["returned","退回目的地"],["conditions","必要文件與簽核"]]} rows={WORKFLOW_RULES}/></>}
 {module==='parameters'&&<><div id="equipment-activity-settings" className="admin-activity-settings">{originalBusinessEnabled()?<EquipmentActivityPreferences account={account}/>:<ReportPreferences kind="activity"/>}</div><TrialCatalogManagement account={account} equipment={snapshot.equipment} schedules={snapshot.schedules} equipmentAction={go('equipment','設備管理')}/></>}
 {module==='interface'&&<InterfaceSettings canManage={editable}/>}
 {module==='interface'&&ADMIN_INTEGRATION_NOTES[module]&&<Table label="整合分類與現況（唯讀）" columns={[["name","分類"],["state","狀態"],["detail","資料來源與限制"]]} rows={ADMIN_INTEGRATION_NOTES[module].map(([name,state,detail])=>({id:name,name,state,detail}))}/>}
 {module==='backup'&&<section className="system-data-workspace" aria-label="系統與資料設定內容"><div className="schedule-view-tabs system-data-tabs" role="tablist" aria-label="系統與資料分類">{[['branding','公司標誌與品牌',true],['parameters','系統參數',canViewAdmin(account,'parameters')],['backup','備份管理',true],['maintenance','資料維護與 Demo 工具',canViewAdmin(account,'data-maintenance')]].filter(([, ,visible])=>visible).map(([id,name])=><button key={id} type="button" role="tab" aria-selected={systemTab===id} onClick={()=>setSystemTab(id)}>{name}</button>)}</div><div className="system-data-content">{systemTab==='branding'&&<AccountImageSettings kind="logo" account={account} canManage={editable}/>}{systemTab==='parameters'&&canViewAdmin(account,'parameters')&&<WorkspaceProfileSettings module="parameters" account={account}/>}{systemTab==='backup'&&<AdminOperations module="backup" {...{account,snapshot,metrics,now,data}} onRefresh={()=>{refresh();setNotice('');}} onNavigate={onNavigate} onOpen={onOpen}/>}{systemTab==='maintenance'&&canViewAdmin(account,'data-maintenance')&&<DataMaintenance account={account}/>}</div></section>}
 {module==='documents'&&<><SignatureMethodSettings account={account}/><div className="admin-actions"><button className="template-btn" type="button" onClick={()=>setSignatureOpen(true)}>開啟本帳號電子簽名設定</button></div><ReportTemplateCenter actorId={account.id} system="lms" manage={editable}/><Table label="既有 Excel 報告範本" columns={[["name","範本"],["category","文件分類"],["version","版本依據"]]} rows={[{id:'ordinary',name:'通常試驗報告（程式產生 .xlsx）',category:'試驗報告',version:'未提供獨立版號，沿用現有產生器'},{id:'general',name:'一般性能試驗 .xlsx',category:'一般性能試驗報告',version:'general-performance-v1（辨識設定 ID，非核准版號）'}]}/><div className="admin-actions">{['通常試驗報告','一般性能試驗'].map(name=><button className="template-btn" type="button" key={name} onClick={()=>{setOperationError('');createReportTemplate({id:'DEMO-TEMPLATE',testItems:[name]},false).then(bytes=>{const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`DEMO-${name}-範本.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}).catch(e=>setOperationError(e.message));}}>下載{name}範本</button>)}</div><Info items={[["PDF 合併規則","指定主管確認後，委託單 → 簽核報告；僅 Demo 文件，不具正式認證效力。"],["報告審核階層","二階主管 → 三階主管 → 指定委託者主管查閱；沿用禁止自審與跨階規則。"],["文件保存期限",settings?`${settings.retentionDays} 天（Demo 政策草稿；不執行刪除）`:'設定無法讀取'],["正式保存與版本服務","規劃中；沒有後端保存期限或正式文件版本管控服務。"]]}/></>}
 {module==='ai'&&(enginePage?<AdminEngineWorkspace key={enginePage.code} engine={enginePage.code} account={account} snapshot={snapshot} onNavigate={onNavigate} onOpen={onOpen}/>:<><div className="admin-engine-grid">{AI_ENGINE_PAGES.map(e=><article key={e.code}><span className="admin-badge">{e.code}</span><h3 className="admin-engine-title"><LmsSidebarIcon name="ai"/>{e.name}</h3><p>{e.description}</p><button type="button" className="template-btn" onClick={()=>onOpen(`ai/${e.code}`)}>開啟{e.name}</button></article>)}</div><Table label="AI 管理操作紀錄（Demo 設定；非推論紀錄）" columns={[["at","時間"],["actorId","操作者"],["action","操作"]]} rows={(data?.events||[]).filter(r=>r.module==='ai').map(r=>({...r,at:date(r.at)}))}/></>)}
 {editable&&!enginePage&&!['interface','data-maintenance'].includes(module)&&(module!=='backup'||systemTab==='backup')&&<details className="admin-reset"><summary>管理中心設定維護</summary><p>只重設本中心的設定與管理事件；新建的改善追蹤與資格紀錄會保留；不影響任何業務案件。</p><button type="button" className="template-btn" onClick={reset}>重設管理中心設定</button></details>}
 {editing&&settings&&editable&&<SettingDialog module={module} value={settings} onClose={()=>setEditing(false)} onSave={values=>{saveAdminSection(module,values,account);refresh();setNotice('設定已儲存；既有案件與業務規則未變更。');}}/>}
 {signatureOpen&&<SignatureSettingsDialog account={account} onClose={()=>setSignatureOpen(false)}/>}
 </div>
 </div></section>;
}
