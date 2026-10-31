import {getRequestDate,isCalendarDate} from './requestDate.mjs';
export const TERMINAL_REQUEST_STATES=new Set(['已結案','取消','已取消','已中止','中止','已終止','終止']);
export function displayTaipei(value,{dateOnly=false}={}){
 if(!value)return '—';
 if(isCalendarDate(value))return value.replaceAll('-','/');
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!isCalendarDate(value.slice(0,10)))return '—';
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const p=key=>parts.find(x=>x.type===key)?.value;
 return `${p('year')}/${p('month')}/${p('day')}${dateOnly?'':` ${p('hour')}:${p('minute')}`}`;
}
export function dueKind(request,now=new Date()){
 if(TERMINAL_REQUEST_STATES.has(request.status)||!isCalendarDate(request.dueDate))return 'none';
 const today=getRequestDate(now),end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+3);
 return request.dueDate<today?'overdue':request.dueDate<=end.toISOString().slice(0,10)?'soon':'later';
}
export function monthMatches(value,now=new Date()){return displayTaipei(value).slice(0,7)===getRequestDate(now).slice(0,7).replaceAll('-','/');}
export function waitingDays(request,now=new Date()){
 const value=request.report?.updatedAt||request.updatedAt||request.requesterSignatureAt||request.createdAt;
 const ms=isCalendarDate(value)?Date.parse(`${value}T00:00:00+08:00`):/^\d{4}-\d{2}-\d{2}T/.test(value||'')?Date.parse(value):NaN;
 return Number.isFinite(ms)?Math.max(0,Math.floor((now.getTime()-ms)/86400000)):null;
}
export function requestMatchesCollection(r,key,now=new Date()){
 switch(key){case'todo':return ['草稿','退件','補件中'].includes(r.status);case'deadline':return ['soon','overdue'].includes(dueKind(r,now));case'draft':return r.status==='草稿';case'returned':return ['退件','補件中'].includes(r.status);case'approval':return r.status==='待主管簽核';case'read':return r.status==='待查閱';case'executing':return r.status==='執行中';case'planning':return ['已核准','待排程','已排程'].includes(r.status);case'overdue':case'soon':return dueKind(r,now)===key;case'month':return monthMatches(r.approvalDate,now);default:return true;}
}
export function orderWork(items,now=new Date()){
 const rank=r=>[dueKind(r,now)==='overdue'?0:1,['急件','專案關鍵'].includes(r.priority)?0:1,r.dueDate&&isCalendarDate(r.dueDate)?r.dueDate:'9999',r.updatedAt||r.createdAt||'9999'];
 return [...items].sort((a,b)=>{const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++){if(x[i]<y[i])return -1;if(x[i]>y[i])return 1;}return String(a.id).localeCompare(String(b.id));});
}
export function filterRequestRows(items,{search='',field='all',status='全部狀態',from='',to='',sort='updated-desc',collection='all'},now=new Date()){
 const keyfields={id:r=>r.id,product:r=>[r.productCode,r.product,r.project].join(' '),testItems:r=>(r.testItems||[]).join(' '),requester:r=>r.requester,dueDate:r=>r.dueDate};
 const text=r=>keyfields[field]?.(r)||[r.id,r.productCode,r.product,r.project,...(r.testItems||[]),r.requester,r.status].join(' ');
 const [key,direction]=sort.split('-');
 const rows=items.filter(r=>(status==='全部狀態'||r.status===status)&&requestMatchesCollection(r,collection,now)&&String(text(r)||'').toLowerCase().includes(search.trim().toLowerCase())&&(!from||(isCalendarDate(r.dueDate)&&r.dueDate>=from))&&(!to||(isCalendarDate(r.dueDate)&&r.dueDate<=to)));
 if(sort==='work')return orderWork(rows,now);
 return rows.sort((a,b)=>{const value=r=>key==='due'?isCalendarDate(r.dueDate)?r.dueDate:null:key==='product'?r.productCode||r.product:key==='id'?r.id:key==='status'?r.status:r.updatedAt||r.createdAt;const x=value(a),y=value(b);if(!x||!y)return x? -1:y?1:0;return (String(x).localeCompare(String(y),'zh-Hant',{numeric:true})||String(a.id).localeCompare(String(b.id)))*(direction==='asc'?1:-1);});
}
function safeDecode(value){try{return decodeURIComponent(value);}catch{return value;}}
export function readRequestRoute(location){
 const url=new URL(location,'http://demo.local'),parts=url.pathname.split('/').filter(Boolean),type=parts[1]||'dashboard';
 const pages={dashboard:'overview',overview:'overview',new:'new',edit:'new',requests:'requests',history:'history',reviews:'review',cases:'detail',borrow:'borrow',notifications:'notifications',archive:'archive'};
 return {page:pages[type]||'overview',id:['edit','cases'].includes(type)?safeDecode(parts[2]||''):'',query:url.searchParams};
}
export function requestPath(page){return `/request/${({overview:'dashboard',new:'new',requests:'requests',review:'reviews',history:'history',borrow:'borrow',notifications:'notifications',archive:'archive'})[page]||'dashboard'}`;}

export function requestStatusClass(status){if(['已核准','執行中','已完成','已結案'].includes(status))return 'good';if(String(status).startsWith('待')||status==='已排程')return 'pending';if(['退件','補件中','取消','已取消','中止','已中止','終止','已終止'].includes(status))return 'warning';return '';}
