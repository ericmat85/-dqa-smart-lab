// Only application routes can be tour return destinations; never an external URL.
export function tourReturnPath(value){
 if(typeof value!=='string'||value.length>2048||/[\\\r\n]/.test(value)||!/^\/(?:lms|request|lab)(?:\/|$|[?#])/.test(value))return '/';
 try{const url=new URL(value,'https://tour.invalid');return url.origin==='https://tour.invalid'&&/^\/(?:lms|request|lab)(?:\/|$)/.test(url.pathname)?url.pathname+url.search+url.hash:'/';}catch{return '/';}
}
export const tourEntryPath=value=>'/tour?return='+encodeURIComponent(tourReturnPath(value));
