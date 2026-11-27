import ActionIcon from './ActionIcon.jsx';
export default function TemplateAutomationControl({automation,kind,fileId,disabled=false,icon=false,nameSuffix=''}){
 const label=kind==='REQUEST'?'委託資訊代入自動化':'試驗資訊代入自動化',target=automation?.targets.find(t=>t.kind===kind&&t.file_id===fileId),blocked=disabled||!automation?.enabled||automation.loading||automation.pending||!target;
 const title=blocked?(automation?.pending?'請先查詢尚未確認的欄位對應儲存結果':fileId==='BLANK'?'內建版型沿用系統欄位；綁定上傳原稿後可設定自動化':'請先儲存此版本的綁定，再設定資訊代入'):label;
 return <button type="button" className={'template-btn secondary template-automation-action'+(icon?' icon-action':'')} data-action-presentation="text" aria-label={label+nameSuffix} title={title} disabled={blocked} onClick={()=>void automation.open(kind,fileId)}>{icon?<ActionIcon name="sparkles"/>:label}</button>;
}
export function TemplateAutomationStatus({automation,kind,fileId}){const target=automation?.targets.find(t=>t.kind===kind&&t.file_id===fileId);return <div className="template-automation-status">{target&&<span>{target.mapping?.length?'已設定 '+target.mapping.length+' 欄':'待設定儲存格對應'}</span>}{automation?.error&&<p role="alert">{automation.error}</p>}{automation?.pending&&<button type="button" className="template-btn secondary" onClick={()=>void automation.recover()}>查詢欄位對應儲存結果</button>}</div>;}
