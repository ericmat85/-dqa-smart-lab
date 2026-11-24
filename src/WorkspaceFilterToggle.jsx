export default function WorkspaceFilterToggle({open,onClick,controls,count=0,label='搜尋與篩選',className=''}){
 return <button type="button" className={`workspace-filter-toggle template-btn secondary ${className}`} aria-expanded={open} aria-controls={controls} onClick={onClick}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>{label}</span>{count>0&&<b>{count} 項條件</b>}<svg className="workspace-filter-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>;
}
