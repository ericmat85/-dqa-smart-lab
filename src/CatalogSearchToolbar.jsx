import {Children,isValidElement,useEffect,useId,useRef,useState} from 'react';
import MobileSearchInput from './MobileSearchInput.jsx';
import SearchIcon from './SearchIcon.jsx';
import './CatalogCompact.css';
const hasFilter=children=>Children.toArray(children).some(node=>isValidElement(node)&&(node.type==='select'?!!node.props.value&&!['全部','all'].includes(node.props.value):hasFilter(node.props.children)));
export default function CatalogSearchToolbar({kind,value,onChange,onClear,placeholder,label,children,className=''}){
 const [open,setOpen]=useState(false),id=useId(),root=useRef(null),button=useRef(null),name=label||`搜尋${kind}`,active=Boolean(value)||hasFilter(children);
 useEffect(()=>{if(!open)return;const dismiss=event=>{if(!root.current?.contains(event.target))setOpen(false);};document.addEventListener('pointerdown',dismiss);return()=>document.removeEventListener('pointerdown',dismiss);},[open]);
 return <div ref={root} className={`template-toolbar schedule-search-toolbar catalog-search-toolbar ${className} ${open?'is-open':''}`} onKeyDownCapture={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);button.current?.focus();}}}>
  <button ref={button} type="button" className="template-btn secondary catalog-search-toggle" aria-label={name} title={name} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}><SearchIcon/>{active&&<i className="search-active-dot" aria-label="已套用篩選"/>}</button>
  <div className="catalog-search-panel" id={id} hidden={!open} role="search" aria-label={`${kind}搜尋與篩選`}><MobileSearchInput inlineLabel labelClassName="schedule-search-wrap" labelNode={<span className="catalog-search-icon" aria-hidden="true"><SearchIcon/></span>} onClear={onClear} type="search" aria-label={name} placeholder={placeholder||(kind==='排程'?'搜尋委託編號、產品代碼、樣品編號、試驗項目、設備或執行人…':`搜尋${kind}編號、名稱、分類、型號、狀態或負責人…`)} value={value} onChange={event=>onChange(event.target.value)}/>{children}</div>
 </div>;
}
