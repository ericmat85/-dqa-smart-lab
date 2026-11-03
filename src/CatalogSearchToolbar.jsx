import './CatalogCompact.css';
export default function CatalogSearchToolbar({kind,value,onChange,onClear}){
 return <div className="template-toolbar schedule-search-toolbar catalog-search-toolbar"><label className="schedule-search-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" aria-label={`搜尋${kind}`} placeholder={kind==='排程'?'搜尋委託編號、產品代碼、樣品編號、試驗項目、設備或執行人…':`搜尋${kind}編號、名稱、分類、型號、狀態或負責人…`} value={value} onChange={event=>onChange(event.target.value)}/></label><button type="button" className="template-btn secondary catalog-search-clear" onClick={onClear}>清除篩選</button></div>;
}
