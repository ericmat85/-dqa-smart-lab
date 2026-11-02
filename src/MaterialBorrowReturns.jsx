import {PaginatedTable} from './Pagination.jsx';
import {useEffect,useRef,useState} from 'react';
import useLabSnapshot,{refreshLabSnapshot} from './useLabSnapshot.js';
import {canApproveOperationalRequest} from './demoPermissions.mjs';
import {returnBorrowMaterial} from './borrowApprovals.mjs';
function ReturnDialog({row,currentUser,onClose,onReturned}){
 const ref=useRef(null),[comment,setComment]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const before=document.activeElement,dialog=ref.current;dialog.showModal();return()=>{dialog.close();before?.focus?.();};},[]);
 function confirm(event){event.preventDefault();try{returnBorrowMaterial({borrowId:row.id,actorId:currentUser.id,comment});refreshLabSnapshot();onReturned();onClose();}catch(cause){setError(cause.message);}}
 return <dialog ref={ref} className="lab-operation-dialog" aria-label="確認物料歸還" onCancel={onClose}><form onSubmit={confirm}><header><h3>確認物料歸還</h3><button type="button" aria-label="關閉物料歸還" onClick={onClose}>×</button></header><div className="lab-operation-dialog-body"><p>{row.id} · {row.material} · {row.quantity} {row.unit}</p><p>本次確認全數歸還，完成後補回可用數量。</p><label>歸還確認結果<textarea className="template-input" value={comment} onChange={e=>setComment(e.target.value)} required rows={3}/></label>{error&&<p role="alert">{error}</p>}</div><footer><button type="button" className="template-btn secondary" onClick={onClose}>取消</button><button type="submit" className="template-btn" disabled={!comment.trim()}>確認歸還</button></footer></form></dialog>;
}
export default function MaterialBorrowReturns({currentUser,onReturned}){
 const snapshot=useLabSnapshot(),[selected,setSelected]=useState(null);const rows=snapshot.borrows.filter(row=>row.resourceType==='material'&&row.status==='已核准');const selectedRow=rows.find(row=>row.id===selected);
 if(!rows.length)return null;
 return <section className="material-borrow-returns"><h3>借出物料／歸還</h3><div className="template-table-wrap"><PaginatedTable className="template-table"><thead><tr>{['申請單號','物料','借用數量','借用人','預計歸還','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.materialId} · {row.material}</td><td>{row.quantity} {row.unit}</td><td>{row.requester}</td><td>{row.returnDate}</td><td><button type="button" className="template-btn secondary" disabled={!canApproveOperationalRequest(currentUser,row.actorId)} onClick={()=>setSelected(row.id)}>確認歸還</button></td></tr>)}</tbody></PaginatedTable></div>{selectedRow&&<ReturnDialog row={selectedRow} currentUser={currentUser} onClose={()=>setSelected(null)} onReturned={onReturned}/>}</section>;
}
