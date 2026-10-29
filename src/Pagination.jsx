import {Children,cloneElement,isValidElement,useState} from 'react';
import {PAGE_SIZE,pageNumbers,pageSlice,listIdentity} from './pagination.mjs';
import './Pagination.css';

function Controls({data,onPage}) {
  if(data.total<=PAGE_SIZE)return null;
  return <nav className="data-pagination" aria-label="列表分頁"><span>第 {data.offset+1}–{Math.min(data.offset+PAGE_SIZE,data.total)} 筆，共 {data.total} 筆</span><div><button type="button" aria-label="上一頁" disabled={data.page===1} onClick={()=>onPage(data.page-1)}>‹</button>{pageNumbers(data.page,data.pages).map((page,index)=>page==='…'?<span className="data-pagination-gap" key={`gap-${index}`}>…</span>:<button type="button" key={page} aria-label={`第 ${page} 頁`} aria-current={page===data.page?'page':undefined} onClick={()=>onPage(page)}>{page}</button>)}<button type="button" aria-label="下一頁" disabled={data.page===data.pages} onClick={()=>onPage(data.page+1)}>›</button></div></nav>;
}
function ListPage({items,children}) {
  const [page,setPage]=useState(1);
  const data=pageSlice(items,page);
  return <>{children(data.items,data.offset)}<Controls data={data} onPage={setPage}/></>;
}
export function PaginatedList({items,children,resetKey=''}) {
  return <ListPage key={`${resetKey}:${listIdentity(items)}`} items={items}>{children}</ListPage>;
}
function plainText(node) {
  if(typeof node==='string'||typeof node==='number')return String(node);
  if(isValidElement(node))return plainText(node.props.children);
  return Array.isArray(node)?node.map(plainText).join(''):'';
}
function TablePage({parts,bodyIndex,rows,tableProps}) {
  const [page,setPage]=useState(1);
  const data=pageSlice(rows,page);
  const head=parts.find(part=>isValidElement(part)&&part.type==='thead');
  const headerRow=head?Children.toArray(head.props.children).find(isValidElement):null;
  const first=headerRow||rows.find(isValidElement);
  const columns=first?Children.toArray(first.props.children).reduce((sum,cell)=>sum+(Number(cell?.props?.colSpan)||1),0):1;
  return <table {...tableProps}>{parts.map((part,index)=>index===bodyIndex?cloneElement(part,{},data.items):part)}{data.total>PAGE_SIZE&&<tfoot><tr><td className="data-pagination-cell" colSpan={Math.max(1,columns)}><Controls data={data} onPage={setPage}/></td></tr></tfoot>}</table>;
}
export function PaginatedTable({children,resetKey='',...tableProps}) {
  const parts=Children.toArray(children);
  const bodyIndex=parts.findIndex(part=>isValidElement(part)&&part.type==='tbody');
  if(bodyIndex<0)return <table {...tableProps}>{children}</table>;
  const rows=Children.toArray(parts[bodyIndex].props.children);
  // Row keys and first-cell identities reset filters/sorting, but live progress updates retain the current page.
  const identity=JSON.stringify(rows.map(row=>[row.key,plainText(Children.toArray(row.props?.children)[0])]));
  return <TablePage key={`${resetKey}:${identity}`} parts={parts} bodyIndex={bodyIndex} rows={rows} tableProps={tableProps}/>;
}
