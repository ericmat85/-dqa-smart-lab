import {useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import ResourceOperationNotice from './ResourceOperationNotice.jsx';
import {resourceCommand} from './resourceCommands.mjs';
export default function ResourceDeleteDialog({kind,row,operation,onClose}){
 const [reason,setReason]=useState(''),[error,setError]=useState('');const label=kind==='equipment'?'設備':'物料';
 async function submit(event){event.preventDefault();if(operation.locked||!reason.trim())return;setError('');try{if(operation.enabled){if(await operation.submit(resourceCommand(kind,'delete',row.id,{reason:reason.trim()},{expectedRevision:row.sourceRevision}),`${label}已從台帳移除，歷史關聯與稽核紀錄已保留。`))onClose();}else{throw Error('請連接共用資料庫後刪除。');}}catch(e){setError(e.message);}}
 return <CompactDialog title={`刪除此${label}`} className="resource-delete-dialog" preventClose={operation.busy} onClose={onClose}><form onSubmit={submit}><div className="resource-delete-summary"><strong>{row.name}</strong><p>{row.id} · {row.status}</p>{kind==='material'&&<p>目前可用 {row.available}／總量 {row.quantity} {row.unit}</p>}<p>刪除後將從台帳清單移除，既有試驗、借用與異動紀錄會保留。仍有使用或未結束預約時，系統會停止刪除。</p></div><label className="equipment-text-field">刪除原因<textarea className="template-input" required maxLength={1000} rows={3} disabled={operation.locked} value={reason} onChange={e=>setReason(e.target.value)}/></label><ResourceOperationNotice operation={operation} onSaved={onClose}/>{error&&<p role="alert">{error}</p>}<div className="template-form-actions"><button type="button" className="template-btn secondary" disabled={operation.busy} onClick={onClose}>取消</button><button type="submit" className="template-btn danger" disabled={operation.locked||!reason.trim()}>確認刪除</button></div></form></CompactDialog>;
}
