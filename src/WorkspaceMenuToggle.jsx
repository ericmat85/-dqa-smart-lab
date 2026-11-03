import './WorkspaceControls.css';
export default function WorkspaceMenuToggle({className='',label,controls,expanded,onClick}){
 return <button type="button" className={`workspace-menu-toggle ${className}`} aria-label={label} aria-controls={controls} aria-expanded={expanded} title={expanded?'收合側邊欄':'展開側邊欄'} onClick={onClick}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>;
}
