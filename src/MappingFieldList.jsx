import {useState} from 'react';
import {DOCUMENT_FIELDS,LEGACY_DOCUMENT_FIELDS} from './documentCellMapping.mjs';
import {STAGE_LABELS,TEMPLATE_STAGE_FIELDS} from './templateStageFields.mjs';

const purposeKeys=new Set(['purposeOtherContent']);
const sourceKeys=new Set();
for(const [key] of DOCUMENT_FIELDS){if(key.startsWith('purpose'))purposeKeys.add(key);if(key.startsWith('source'))sourceKeys.add(key);}
function fieldGroups(kind,rows){
 const basic=DOCUMENT_FIELDS.filter(([key])=>!purposeKeys.has(key)&&!sourceKeys.has(key)&&!key.startsWith('judgement'));
 return [
  {id:'basic',label:'委託與樣品基本資訊',fields:basic},
  {id:'judgement',label:'判定設定',fields:DOCUMENT_FIELDS.filter(([key])=>key.startsWith('judgement'))},
  {id:'purpose',label:'試驗目的',fields:DOCUMENT_FIELDS.filter(([key])=>purposeKeys.has(key))},
  {id:'source',label:'樣品來源與內容',fields:DOCUMENT_FIELDS.filter(([key])=>sourceKeys.has(key))},
  ...(kind==='REQUEST'?Object.entries(STAGE_LABELS).map(([stage,label])=>({id:stage,label,fields:TEMPLATE_STAGE_FIELDS.filter(f=>f.stage===stage).map(f=>[f.id,f.label.split('｜').at(-1)])})):[]),
  {id:'legacy',label:'既有整合欄位',fields:LEGACY_DOCUMENT_FIELDS.filter(([key])=>rows.some(r=>r.field===key))},
 ].filter(g=>g.fields.length);
}

export default function MappingFieldList({kind,rows,setRows,sheets,values,disabled,sourceReady,onPick,onError}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[selectedOnly,setSelectedOnly]=useState(false),[defaultSheet,setDefaultSheet]=useState('');
 const groups=fieldGroups(kind,rows),sheet=sheets.includes(defaultSheet)?defaultSheet:sheets[0]||'';
 const addFields=fields=>{
  if(rows.length+fields.length>224){onError('最多可設定 224 個對應，請先移除不需要的對應。');return;}
  setRows(v=>[...v,...fields.map(field=>({field,sheet,cell:''}))]);
 };
 const change=(index,key,value)=>setRows(v=>v.map((r,i)=>i===index?{...r,[key]:value}:r));
 const matches=(key,label,group)=>`${key} ${label} ${group}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
 return <section className="mapping-field-list" aria-label="欄位對應列表">
  <div className="mapping-list-tools">
   <label>搜尋欄位<input type="search" onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}} placeholder="輸入名稱，例如：樣品、簽名、設備" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <label className="mapping-list-check"><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/>僅顯示已選欄位</label>
   <span role="status">已設定 {rows.length} / 224 個對應</span>
  </div>
  <div className="mapping-sheet-default"><span>新增對應使用的工作表</span><div className="mapping-sheet-options" role="group" aria-label="新增對應使用的工作表">{sheets.map(s=><button type="button" key={s} disabled={disabled} aria-pressed={sheet===s} onClick={()=>setDefaultSheet(s)}>{s}</button>)}</div><small>已設定的工作表保持原樣，可在各列直接切換。</small></div>
  <div className="mapping-list-categories" role="group" aria-label="欄位分類"><button type="button" aria-pressed={category==='all'} onClick={()=>setCategory('all')}>全部</button>{groups.map(g=><button type="button" key={g.id} aria-pressed={category===g.id} onClick={()=>setCategory(g.id)}>{g.label}<span>{g.fields.filter(([key])=>rows.some(r=>r.field===key)).length}/{g.fields.length}</span></button>)}</div>
  <p>勾選需要的欄位後，直接輸入儲存格或從 Excel 點選。可整類加入，也可把同一欄位對應到多處。</p>
  {groups.filter(g=>category==='all'||category===g.id).map(g=>{
   const fields=g.fields.filter(([key,label])=>matches(key,label,g.label)&&(!selectedOnly||rows.some(r=>r.field===key)));
   if(!fields.length)return null;
   const missing=fields.filter(([key])=>!rows.some(r=>r.field===key)).map(([key])=>key);
   return <section className="mapping-field-group" aria-label={g.label+'欄位'} key={g.id}>
    <header><h4>{g.label}<small>{fields.length} 項</small></h4><button type="button" disabled={disabled||!missing.length} onClick={()=>addFields(missing)}>加入此類欄位{query.trim()?'（搜尋結果）':''}</button></header>
    <div className="document-mapping-scroll"><table><thead><tr><th>使用／欄位名稱</th><th>工作表</th><th>儲存格</th><th>模擬值</th><th>設定</th></tr></thead><tbody>{fields.flatMap(([key,label])=>{
     const entries=rows.flatMap((r,index)=>r.field===key?[{r,index}]:[]),enabled=entries.length>0;
     return (enabled?entries:[{r:{field:key,sheet,cell:''},index:-1}]).map(({r,index},occurrence)=><tr key={key+':'+occurrence} className={enabled?'mapping-field-enabled':'mapping-field-unused'} data-field={key}>
      <td>{occurrence===0?<label className="mapping-field-toggle"><input type="checkbox" aria-label={'使用 '+g.label+'｜'+label} disabled={disabled} checked={enabled} onChange={e=>e.target.checked?addFields([key]):setRows(v=>v.filter(row=>row.field!==key))}/><span>{label}</span></label>:<span className="mapping-field-repeat">{label}<small>同一欄位的其他位置</small></span>}</td>
      <td>{sheets.length<=1?<input aria-label={enabled?'工作表 '+(index+1):label+'工作表（未選）'} value={r.sheet} readOnly disabled={!enabled}/>:<div className="mapping-sheet-options" role="group" aria-label={label+'工作表 '+(occurrence+1)}>{sheets.map(s=><button type="button" key={s} disabled={!enabled||disabled} aria-pressed={r.sheet===s} onClick={()=>change(index,'sheet',s)}>{s}</button>)}</div>}</td>
      <td><input aria-label={enabled?'儲存格 '+(index+1):g.label+'｜'+label+'儲存格（未選）'} required={enabled} placeholder="例如：C3" value={r.cell} maxLength={6} disabled={!enabled||disabled} onChange={e=>change(index,'cell',e.target.value.toUpperCase())}/></td>
      <td className="mapping-simulated-value" aria-label={enabled?'模擬值 '+(index+1):undefined}>{String(values[key]??'')||'（空白）'}</td>
      <td><div className="admin-actions"><button type="button" disabled={!enabled||!sourceReady||disabled} onClick={()=>onPick(index)}>點選儲存格</button>{enabled&&<><button type="button" disabled={disabled||rows.length>=224} aria-label={'增加 '+g.label+'｜'+label+' 的對應位置'} onClick={()=>addFields([key])}>＋位置</button><button type="button" disabled={disabled} aria-label={'移除 '+g.label+'｜'+label+' 的對應位置 '+(occurrence+1)} onClick={()=>setRows(v=>v.filter((_,i)=>i!==index))}>移除</button></>}</div></td>
     </tr>);
    })}</tbody></table></div>
   </section>;
  })}
  {!groups.some(g=>(category==='all'||category===g.id)&&g.fields.some(([key,label])=>matches(key,label,g.label)&&(!selectedOnly||rows.some(r=>r.field===key))))&&<p className="mapping-list-empty" role="status">沒有符合條件的欄位。請調整搜尋、分類或「僅顯示已選欄位」。</p>}
 </section>;
}
