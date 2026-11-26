import './ResourceActions.css';
const paths={
 link:'m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
 filter:'M3 6h18M6 12h12M9 18h6',
 upload:'M12 17V3m-4 4 4-4 4 4M4 16v5h16v-5',
 'report-submit':'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9L14 3ZM14 3v6h6M12 18v-6m-3 3 3-3 3 3',
 'equipment-info':'M6 3h12a1 1 0 0 1 1 1v16H5V4a1 1 0 0 1 1-1ZM5 7h14M8 10h7v6H8zM17 11v4M8 20v2m8-2v2M14 5h.01M17 5h.01',
 'material-info':'m3 6 7-4 7 4v6M3 6v9l7 4v-9m-7-4 7 4 7-4M10 2v8M22 17a5 5 0 1 1-10 0 5 5 0 0 1 10 0M17 17v3m0-6h.01',
 history:'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',
 repeat:'m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3',
 check:'m5 12 4 4L19 6',
 return:'m8 4-6 6 6 6m-6-6h12a6 6 0 0 1 6 6v4',
 send:'m3 3 19 9-19 9 4-9-4-9Zm4 9h15',
 sparkles:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
 info:'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 delete:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
 preview:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 download:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
 edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z',
};
export default function ActionIcon({name='info'}){return <svg data-action-icon={name} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]||paths.info}/></svg>;}
export function IconAction({icon,label,title=label,danger=false,className='',...props}){return <button type="button" {...props} className={`template-btn secondary icon-action${danger||icon==='delete'?' icon-action-danger':['equipment-info','material-info'].includes(icon)?' icon-action-primary':''} ${className}`} aria-label={label} title={title}><ActionIcon name={icon}/></button>;}
