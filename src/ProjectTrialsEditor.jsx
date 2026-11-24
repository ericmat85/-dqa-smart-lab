import {useState} from 'react';
import {PROJECT_LIMIT,projectItem} from './projectRequests.mjs';
import {buildSpecification,buildAcceptanceCriteria} from './requestTestCatalog.mjs';
import './ProjectTrialsEditor.css';
export default function ProjectTrialsEditor({form,onChange,catalog,error}){
 const [search,setSearch]=useState(''),[selected,setSelected]=useState([]),[page,setPage]=useState(0);
 const rows=form.projectItems||[],pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pages-1),full=rows.length>=PROJECT_LIMIT;
 const update=next=>onChange({...form,projectItems:next});
 const edit=(key,field,value)=>update(rows.map(row=>row.key===key?{...row,[field]:value}:row));
 function add(){if(!selected.length||rows.length+selected.length>PROJECT_LIMIT)return;update([...rows,...selected.map(name=>projectItem(name,{specification:buildSpecification([name]),acceptance:buildAcceptanceCriteria(name)}))]);setPage(Math.floor(rows.length/10));setSelected([]);}
 return <div className="rq-project-editor" data-field="projectItems" tabIndex={-1} aria-invalid={!!error}>
  <label className="rq-label">專案名稱<input className="rq-input" aria-label="專案名稱" maxLength={100} value={form.projectName||''} onChange={e=>onChange({...form,projectName:e.target.value})}/></label>
  <p>共 {rows.length}／{PROJECT_LIMIT} 項。一次填寫後逐項建立關聯委託單，各自簽核、排程及提交報告。同一試驗可複製分項，以設定不同條件。</p>
  <details className="rq-project-catalog"><summary>新增專案試驗項目</summary><input className="rq-input" aria-label="搜尋專案試驗" placeholder="搜尋試驗名稱" value={search} onChange={e=>setSearch(e.target.value)}/><div className="rq-project-options">{catalog.filter(name=>name.toLowerCase().includes(search.toLowerCase())).map(name=><label key={name}><input type="checkbox" checked={selected.includes(name)} disabled={!selected.includes(name)&&rows.length+selected.length>=PROJECT_LIMIT} onChange={e=>setSelected(e.target.checked?[...selected,name]:selected.filter(n=>n!==name))}/>{name}</label>)}</div><button type="button" className="rq-btn rq-btn-primary" disabled={!selected.length||full} onClick={add}>加入選取的 {selected.length} 項</button></details>
  {error&&<p role="alert" className="rq-field-error">{error}</p>}
  <div className="rq-project-pagination"><strong>專案分項 {rows.length>0?current*10+1:0}–{Math.min(rows.length,(current+1)*10)}／{rows.length}</strong><div><button type="button" className="rq-btn" disabled={!current} onClick={()=>setPage(current-1)}>上一頁</button><span>{current+1}／{pages}</span><button type="button" className="rq-btn" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>下一頁</button></div></div>
  {rows.slice(current*10,current*10+10).map((row,index)=><section key={row.key} className="rq-project-item" aria-label={`專案第${current*10+index+1}項`}><header><strong>{current*10+index+1}. {row.name}</strong><div><button type="button" className="rq-btn" disabled={full} onClick={()=>{const n=rows.findIndex(r=>r.key===row.key)+1;update([...rows.slice(0,n),{...row,key:crypto.randomUUID()},...rows.slice(n)]);setPage(Math.floor(n/10));}}>複製分項</button><button type="button" className="rq-btn rq-btn-danger" onClick={()=>{if(window.confirm('確定移除此分項及已填寫內容？'))update(rows.filter(r=>r.key!==row.key));}}>移除分項</button></div></header>
   <div className="rq-project-item-grid"><label>測試數量<input className="rq-input" aria-label="分項測試數量" type="number" min="1" max="999999" value={row.quantity} onChange={e=>edit(row.key,'quantity',e.target.value)}/></label><label>判定方式<select className="rq-input" aria-label="分項判定方式" value={row.judgementRequired} onChange={e=>edit(row.key,'judgementRequired',e.target.value)}><option>需作判定</option><option>不作判定</option></select></label><label>試驗手法<textarea className="rq-input" aria-label="分項試驗手法" maxLength={3000} rows={4} value={row.specification} onChange={e=>edit(row.key,'specification',e.target.value)}/></label><label>判定基準{row.judgementRequired==='不作判定'?'（選填）':''}<textarea className="rq-input" aria-label="分項判定基準" maxLength={3000} rows={4} value={row.judgementCriteria} onChange={e=>edit(row.key,'judgementCriteria',e.target.value)}/></label></div>
  </section>)}
 </div>;
}
