import AssistantIcon from './AssistantIcon.jsx';
import './LmsMobileLayout.css';

const paths={
 add:'M12 5v14M5 12h14',
 back:'m10 5-7 7 7 7M3 12h18',
 history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
 settings:'M9 3h6l1 4 4 1v6l-4 1-1 4H9l-1-4-4-1V8l4-1zM15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M18 17a7 7 0 0 1-12 1l-2-3',
 chart:'M4 4v16h16M8 16v-5M12 16V8M16 16V5',
 download:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
 edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z',
 status:'M12 3a9 9 0 1 0 9 9M15 3h6v6M21 3l-9 9',
 equipment:'M3 4h18v13H3zM8 21h8M12 17v4M6 11h3l2-4 3 7 2-3h2',
 requests:'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 11h8M8 15h8',
 schedule:'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2',
 clear:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
 open:'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7',
};
export default function LmsHeaderActionLabel({icon='open',children}){
 return <>{icon==='assistant'?<AssistantIcon size={20} className="lms-header-action-icon"/>:<svg className="lms-header-action-icon" data-action-icon={icon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[icon]||paths.open}/></svg>}<span className="lms-header-action-label">{children}</span></>;
}
