import {useState} from 'react';
import {STATUS_COLORS} from './labColors.mjs';
export default function ScheduleStatusChart({counts,onNavigate}){
 const [active,setActive]=useState(null),total=Object.values(counts).reduce((sum,value)=>sum+value,0);
 const label=status=>status==='未排程'?'待排程':status==='有衝突'?'排程衝突':status;
 let offset=0;
 const segments=Object.entries(counts).filter(([,count])=>count>0).map(([status,count])=>{const length=count/total*100,segment={status,count,length,offset};offset+=length;return segment;});
 const open=status=>onNavigate('schedule',status);
 return <div className="live-composition"><div className="live-donut interactive-status-donut" role="group" aria-label={`試驗排程總計 ${total} 筆`}>
  <svg viewBox="0 0 200 200" aria-label="試驗排程狀態圓餅圖"><circle cx="100" cy="100" r="72" fill="none" stroke="var(--border,#e8edf5)" strokeWidth="28"/>{segments.map(segment=><circle key={segment.status} className={active===segment.status?'is-active':''} cx="100" cy="100" r="72" pathLength="100" fill="none" stroke={STATUS_COLORS[segment.status]} strokeWidth={active===segment.status?32:28} strokeDasharray={`${segment.length} ${100-segment.length}`} strokeDashoffset={-segment.offset} transform="rotate(-90 100 100)" role="button" tabIndex={0} aria-label={`${label(segment.status)} ${segment.count} 筆`} onMouseEnter={()=>setActive(segment.status)} onMouseLeave={event=>{if(document.activeElement!==event.currentTarget)setActive(null);}} onFocus={()=>setActive(segment.status)} onBlur={()=>setActive(null)} onClick={()=>open(segment.status)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open(segment.status);}}} style={{opacity:active&&active!==segment.status?0.35:1}}/>)}</svg>
  <div className={active?'is-active':''}><span>{active?label(active):'總計'}</span><strong>{active?counts[active]:total}</strong><small>{active?`${(total?Math.round(counts[active]/total*100):0)}%`:'筆排程'}</small></div>
 </div><div className="live-legend">{Object.entries(counts).map(([status,count])=><button type="button" key={status} className={active===status?'is-active':''} onMouseEnter={()=>setActive(status)} onMouseLeave={event=>{if(document.activeElement!==event.currentTarget)setActive(null);}} onFocus={()=>setActive(status)} onBlur={()=>setActive(null)} onClick={()=>open(status)}><i style={{background:STATUS_COLORS[status]}}/><span>{label(status)}</span><strong>{count}</strong><small>{total?Math.round(count/total*100):0}%</small></button>)}</div></div>;
}
