import './ManagementPages.css';
import {useState} from 'react';
import useLabView from './useLabView.js';
import {refreshLabSnapshot} from './useLabSnapshot.js';
import {LabRecordTable,SourceNotes} from './LabPanels.jsx';
const targets={labWorkItems:'requests',labAudit:'requests',borrows:'requests',labOperations:'requests',schedules:'schedule',equipment:'equipment',materials:'maintenance',reviews:'requests',electronic:'requests',accounts:'accounts'};
export default function LabSettings({onNavigate}){
 const {snapshot,metrics}=useLabView();const [checked,setChecked]=useState(null);
 const sources=snapshot.sources.map(row=>({...row,size:`${(row.bytes/1024).toFixed(1)} KB`,status:row.error||row.origin}));
 return <div className="live-lab-page management-page settings-management"><section className="live-panel"><div className="live-panel-heading"><div><small>SYSTEM OVERVIEW</small><h2>系統設定</h2><p>檢查資料來源與工作規則，從提醒前往對應管理頁面。</p></div><button className="btn-outline" onClick={()=>{refreshLabSnapshot();setChecked(new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}));}}>重新檢查</button></div>{checked&&<p role="status">已於 {checked} 重新檢查</p>}<div className="lab-system-rules"><div><small>資料儲存</small><strong>目前瀏覽器</strong><span>同一網站、同一瀏覽器的頁面共用資料</span></div><div><small>日期與排程</small><strong>Asia / Taipei</strong><span>依已儲存日期推進狀態，完成後釋放設備</span></div><div><small>列表規則</small><strong>每頁最多 20 筆</strong><span>主頁與彈跳視窗一致</span></div></div><div className="management-section-heading"><div><h3>資料來源</h3><p>點選來源名稱前往管理頁面</p></div><span className="management-count">{sources.length} 個來源</span></div><LabRecordTable columns={[{key:'label',label:'資料來源'},{key:'count',label:'筆數'},{key:'status',label:'讀取狀態'},{key:'size',label:'本機儲存大小'}]} rows={sources} onSelect={row=>onNavigate(targets[row.id])}/><div className="management-section-heading"><div><h3>待確認事項</h3><p>檢視排程衝突、校驗與庫存提醒</p></div><span className="management-count">{metrics.issues.length} 項提醒</span></div><LabRecordTable columns={[{key:'type',label:'提醒類型'},{key:'detail',label:'內容'}]} rows={metrics.issues} onSelect={row=>onNavigate(targets[row.target]||'schedule')}/></section><SourceNotes snapshot={snapshot}/></div>;
}
