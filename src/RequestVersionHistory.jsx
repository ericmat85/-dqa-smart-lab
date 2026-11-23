import './RequestVersionHistory.css';
import {useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {sha256Text} from './workflowHashes.mjs';
export default function RequestVersionHistory({request}){
 const [selected,setSelected]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function open(v){if(busy)return;setBusy(true);setError('');try{const {data}=await businessClient.request('/workflow/document/'+v.id);if(await sha256Text(data.canonical_text)!==v.document_sha256)throw Error('文件雜湊不一致，未顯示內容。');setSelected({version:v.version,payload:JSON.parse(data.canonical_text),hash:v.document_sha256});}catch(e){setError(e.code?businessErrorMessage(e):e.message);}finally{setBusy(false);}}
 const labels={request_legacy_id:'委託編號',owner_label:'委託者',supervisor_label:'直屬主管',product_code:'產品代碼',customer_name:'客戶名稱',quantity:'測試數量',requested_date:'需求日期',specification:'試驗規範／試驗手法',acceptance:'判定基準'};
 return <><details><summary>送簽文件版本</summary>{(request.documentVersions||[]).map(v=><p key={v.id}>第 {v.version} 版 <button type="button" className="template-btn secondary" disabled={busy} onClick={()=>open(v)}>檢視第 {v.version} 版內容</button></p>)}</details>{error&&<p role="alert">{error}</p>}{selected&&<CompactDialog className="request-version-dialog" title={`送簽文件第 ${selected.version} 版`} onClose={()=>setSelected(null)}><div className="request-modal-body"><dl className="detail-grid">{Object.entries(labels).map(([key,label])=><div key={key}><dt>{label}</dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selected.payload[key]??'—'}</dd></div>)}</dl><details><summary>完整表單內容</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(selected.payload.form_details,null,2)}</pre></details><p style={{overflowWrap:'anywhere'}}>SHA256：{selected.hash}</p></div></CompactDialog>}</>;
}
