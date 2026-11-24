import MobileSearchInput from './MobileSearchInput.jsx';
import './CatalogCompact.css';
export default function CatalogSearchToolbar({kind,value,onChange,onClear,placeholder,label,children,className=''}){
 return <div className={`template-toolbar schedule-search-toolbar catalog-search-toolbar ${className}`}><MobileSearchInput inlineLabel labelClassName="schedule-search-wrap" labelNode={<span className="catalog-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></span>} onClear={onClear} type="search" aria-label={label||`搜尋${kind}`} placeholder={placeholder||(kind==='排程'?'搜尋委託編號、產品代碼、樣品編號、試驗項目、設備或執行人…':`搜尋${kind}編號、名稱、分類、型號、狀態或負責人…`)} value={value} onChange={event=>onChange(event.target.value)}/>{children}</div>;
}
