import SearchIcon from './SearchIcon.jsx';
export default function WorkspaceFilterToggle({open,onClick,controls,count=0,label='搜尋與篩選',className=''}){
 return <button type="button" className={`workspace-filter-toggle template-btn secondary ${className}`} aria-label={label} title={label} aria-expanded={open} aria-controls={controls} onClick={onClick}><SearchIcon/>{count>0&&<b className="search-active-count" aria-label={`${count} 項條件`}>{count}</b>}</button>;
}
