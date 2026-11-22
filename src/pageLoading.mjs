// Reference-count real pending work; concurrent requests cannot end each other's spinner.
export const STATIC_FAVICON='/favicon.svg?v=flask-20261123';
let pending=0,timer,angle=0;const listeners=new Set();
export const loadingSnapshot=()=>pending>0;
export function subscribeLoading(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function icon(){if(typeof document==='undefined')return null;let link=document.querySelector('link[rel="icon"]');if(!link){link=document.createElement('link');link.rel='icon';document.head.append(link);}return link;}
function frame(){const link=icon();if(!link)return;const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;angle=reduced?0:(angle+36)%360;link.href='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="23" fill="none" stroke="#cbd5e1" stroke-width="7"/><circle cx="32" cy="32" r="23" fill="none" stroke="#2563eb" stroke-width="7" stroke-linecap="round" stroke-dasharray="46 145" transform="rotate(${angle} 32 32)"/></svg>`);}
function update(){if(typeof document!=='undefined'){if(pending&&!timer){frame();timer=setInterval(frame,120);}if(!pending){clearInterval(timer);timer=null;const link=icon();if(link)link.href=STATIC_FAVICON;}document.documentElement.dataset.loading=String(pending>0);}listeners.forEach(fn=>fn());}
export function beginPageLoading(){pending++;update();let done=false;return()=>{if(done)return;done=true;pending=Math.max(0,pending-1);update();};}
