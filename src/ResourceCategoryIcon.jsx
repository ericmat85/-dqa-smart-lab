import {resourceCategoryIcon} from './resourceCategoryIcons.mjs';
const paths={
 mechanical:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 'temperature-humidity':'M5 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0M7 9v8M16 5s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8Z',
 temperature:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0ZM12 8v10M18 5h3M18 9h2',
 measurement:'M6 21h14M10 17v4M8 14a6 6 0 0 0 11-3M14 3l4 3-6 9-4-3 6-9ZM8 17l-3-2M13 2l2-1 4 3-1 2',
 protection:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6',
 corrosion:'M9 2h6M10 2v6l-6 11a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L14 8V2M7 15h10M10 18h.01M14 20h.01',
 electrical:'m13 2-9 12h7l-1 8 10-13h-7l1-7Z',
 weather:'M12 3V1M5 5 3 3M3 11H1M19 5l2-2M8 12a5 5 0 1 1 9-3M7 21a4 4 0 1 1 1-8 5 5 0 0 1 9-1 4.5 4.5 0 1 1 1 9H7Z',
 inspection:'M3 3h18v14H3V3ZM8 21h8M12 17v4m-5-12 3 3 6-6',
 fixtures:'M5 3h13v4H9v10h9v4H5V3ZM12 11h10M17 8v9M14 17h6',
 tools:'M14 5a6 6 0 0 0-7 7L2 17a3 3 0 0 0 5 5l5-5a6 6 0 0 0 7-7l-4 4-4-4 4-4Z',
 consumables:'m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7 4l9 5',
 instruments:'M4 19a10 10 0 1 1 16 0H4ZM12 14l5-5M6 12H4M12 6V4M20 12h-2M14 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
 equipment:'M3 3h18v14H3V3ZM8 21h8M12 17v4M6 9h3l2-3 3 7 2-4h2',
};
export default function ResourceCategoryIcon({name,kind}){const icon=resourceCategoryIcon(name,kind);return <svg data-category-icon={icon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[icon]}/></svg>;}
