import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import './InventorySummaryIcon.css';
const symbols={
 pending:{tone:'maintenance',path:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v6l4 2'},
 conflict:{tone:'warning',path:'m12 3 10 18H2L12 3Z M12 9v5 M12 17h.01'},
 scheduled:{tone:'available',path:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 15l3 3 5-5'},
 running:{tone:'active',path:'M9 3h6 M10 3v7L4 20h16l-6-10V3 M7 15h10 M10 18h.01 M13 12h.01'},
};
export default function ScheduleSummaryIcon({kind}){
 const icon=symbols[kind];
 return <i className="workspace-summary-icon" data-inventory-tone={icon?.tone||'total'} aria-hidden="true">{icon?<svg className="schedule-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d={icon.path}/></svg>:<LmsSidebarIcon name="equipment"/>}</i>;
}
