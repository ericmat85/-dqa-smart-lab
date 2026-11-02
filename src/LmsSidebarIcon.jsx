// Consistent outline icons; no platform-dependent Unicode/emoji rendering.
const paths={
 new:'M12 4v16 M4 12h16',
 borrow:'M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4',
 history:'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 review:'M5 3h14v18H5z M8 8l2 2 5-5 M8 15h8 M8 18h5',
 notifications:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4',
 dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 requests:'M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 11h8 M8 15h8',
 schedule:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
 equipment:'M3 4h18v13H3z M8 21h8 M12 17v4 M6 11h3l2-4 3 7 2-3h2',
 maintenance:'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M7.5 5l9 4',
 archive:'M4 6c0-4 16-4 16 0s-16 4-16 0 M4 6v12c0 4 16 4 16 0V6 M4 12c0 4 16 4 16 0',
 reports:'M4 3v18h17 M8 17v-6 M13 17V7 M18 17V4',
 accounts:'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-2a7 7 0 0 1 14 0v2 M18 5a3 3 0 0 1 0 6 M21 20v-2a5 5 0 0 0-3-4',
 settings:'M9 3h6l1 4 4 1v6l-4 1-1 4H9l-1-4-4-1V8l4-1z M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 logout:'M10 4H4v16h6 M9 12h12 M17 8l4 4-4 4',
};
export default function LmsSidebarIcon({name}){
 return <svg className="lms-sidebar-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]||paths.dashboard}/></svg>;
}
