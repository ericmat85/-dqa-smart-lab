import {PaginatedTable} from './Pagination.jsx';
import './LiveLab.css';

import {STATUS_COLORS} from './labColors.mjs';

export function LabRecordTable({columns,rows,onSelect,resetKey=''}) {
  return <div className="live-table-wrap"><PaginatedTable className="live-record-table" resetKey={resetKey}><thead><tr>{columns.map(column=><th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,index)=><tr key={row.id||index}>{columns.map((column,columnIndex)=><td key={column.key}>{columnIndex===0&&onSelect?<button type="button" className="live-data-link" onClick={()=>onSelect(row)}>{row[column.key]??'—'}</button>:column.key==='status'?<span className="live-status" style={{'--status-color':STATUS_COLORS[row[column.key]]||'#8d91ac'}}>{row[column.key]||'—'}</span>:row[column.key]??'—'}</td>)}</tr>):<tr><td colSpan={columns.length}><div className="live-empty">目前範圍沒有資料</div></td></tr>}</tbody></PaginatedTable></div>;
}
export function MetricCard({label,value,detail,icon,color='blue',onClick}) {
  const content=<><span className={`live-metric-icon ${color}`} aria-hidden="true">{icon}</span><span className="live-metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></span>{onClick&&<span className="live-metric-arrow" aria-hidden="true">↗</span>}</>;
  return onClick?<button type="button" className="live-metric" onClick={onClick}>{content}</button>:<div className="live-metric">{content}</div>;
}
export function SourceNotes({snapshot}) {
  return <details className="live-source-notes"><summary>資料來源與計算方式 <span>讀取於 {new Date(snapshot.observedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}</span></summary><ul><li>清單與統計讀取同一組本機工作資料；頁面變更與跨分頁操作會同步更新。</li><li>本週為台灣時間週一至週日；排程狀態依已儲存日程計算。</li><li>設備稼動率＝系統設定區間內的試驗排程時數／設備日曆總時數，重疊時段不重複計算；屬排程估算，非實測開機時數。排程占用率＝去除重疊後的預約時數／該分類設備本週日曆總時數。</li><li>「審查完成」與「試驗已完成」分別來自委託審查與排程資料，不互相混算。</li></ul><div className="live-source-tags">{snapshot.sources.map(source=><span key={source.id}>{source.label}：{source.origin} · {source.count} 筆</span>)}</div></details>;
}
