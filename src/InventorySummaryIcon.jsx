import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import './InventorySummaryIcon.css';

// Shared status meanings across equipment and materials, using themed outline art.
const artwork={
 '使用中':{tone:'active',path:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M6 12h3l2-5 3 10 2-5h2'},
 '待機中':{tone:'neutral',path:'M12 3v8 M7 5a8 8 0 1 0 10 0'},
 '可用':{tone:'available',path:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M8 12l3 3 5-6'},
 '維護中':{tone:'maintenance',path:'M14 4a5 5 0 0 0-6 6L3 15a3 3 0 0 0 4 4l5-5a5 5 0 0 0 7-6l-3 3-3-3 3-3-2-1Z M5.5 16.5h.01'},
 '校驗中':{tone:'calibration',path:'M4 17a9 9 0 1 1 16 0 M6 14h1 M8 7l1 1 M12 5v2 M16 8l1-1 M17 14h1 M12 14l3-4 M14 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M7 21h10'},
 '暫停中':{tone:'neutral',path:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9 8v8 M15 8v8'},
 '借用':{tone:'loan',path:'M3 10h8v10H3z M3 13h8 M5 7h4v3 M21 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M14 21v-3a4 4 0 0 1 8 0v3'},
 '缺料':{tone:'warning',path:'m12 3 10 18H2L12 3Z M12 9v5 M12 17h.01'},
 '停用':{tone:'neutral',path:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M6 6l12 12'},
};
export default function InventorySummaryIcon({kind,status}){
 const icon=artwork[status==='借出'?'借用':status];
 return <i className="workspace-summary-icon" data-inventory-tone={icon?.tone||'total'} aria-hidden="true">{icon?<svg className="inventory-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d={icon.path}/></svg>:<LmsSidebarIcon name={kind==='equipment'?'equipment':'maintenance'}/>}</i>;
}
