import './ResourceActions.css';
const paths={
 info:'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 delete:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
 preview:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 download:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
 edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z',
};
export default function ActionIcon({name='info'}){return <svg data-action-icon={name} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]||paths.info}/></svg>;}
export function IconAction({icon,label,title=label,danger=false,className='',...props}){return <button type="button" {...props} className={`template-btn secondary icon-action${danger?' icon-action-danger':''} ${className}`} aria-label={label} title={title}><ActionIcon name={icon}/></button>;}
