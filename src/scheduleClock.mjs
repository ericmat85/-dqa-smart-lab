const listeners=new Set();
let now=Date.now(),timer;
const serverNow=now;
const tick=()=>{now=Date.now();listeners.forEach(listener=>listener());};
export const scheduleClockSnapshot=()=>now;
export const scheduleServerSnapshot=()=>serverNow;
export function subscribeScheduleClock(listener) {
  listeners.add(listener);
  if(listeners.size===1){
    now=Date.now();
    timer=window.setInterval(tick,1000);
    window.addEventListener('focus',tick);
    document.addEventListener('visibilitychange',tick);
  }
  return()=>{
    listeners.delete(listener);
    if(!listeners.size){window.clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);}
  };
}
