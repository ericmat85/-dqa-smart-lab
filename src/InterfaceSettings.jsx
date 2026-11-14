import {useState} from 'react';
import useUiPreferences from './useUiPreferences.js';
import {saveUiPreferences} from './uiPreferences.mjs';

export default function InterfaceSettings(){
 const ui=useUiPreferences(),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function update(patch){try{saveUiPreferences(patch);setError('');setNotice('介面偏好已儲存。');}catch{setNotice('');setError('設定尚未儲存，請確認瀏覽器儲存權限。');}}
 return <div className="admin-interface-settings">
  <p className="admin-note">變更後立即儲存於目前瀏覽器，沿用原有介面偏好。</p>
  {error&&<p role="alert" className="management-error">{error}</p>}{notice&&<p role="status" className="management-notice">{notice}</p>}
  <section className="admin-interface-panel" aria-label="介面外觀"><h3>介面外觀</h3><div className="admin-form-grid">
   <label>字體大小<select aria-label="字體大小" value={ui.fontSize} onChange={event=>update({fontSize:event.target.value})}><option value="small">較小</option><option value="normal">標準</option><option value="large">較大</option></select></label>
   <label>介面語言<select aria-label="介面語言" value={ui.language} onChange={event=>update({language:event.target.value})}><option value="zh-TW">繁體中文</option><option value="en">English</option></select></label>
  </div></section>
  <section className="admin-interface-panel" id="list-display-settings" aria-label="列表設定"><h3>列表設定</h3><div className="admin-form-grid">
   <label>每頁顯示筆數<select aria-label="每頁顯示筆數" value={ui.pageSize} onChange={event=>update({pageSize:Number(event.target.value)})}>{[10,20,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
  </div><p>明細分頁顯示；報表匯出包含全部符合條件的資料。</p></section>
 </div>;
}
