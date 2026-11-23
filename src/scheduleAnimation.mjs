export const SCHEDULE_ANIMATION_MIN_MS=5000;
export const SCHEDULE_ANIMATION_TICK_MS=50;
const phaseLimits=[30,64,92];

// Presentation only: elapsed time cannot claim that the request has finished.
// Limit catch-up after a throttled/background tab to avoid a sudden jump.
export function advanceScheduleAnimation(value,deltaMs,stage,ready){
 const limit=ready?100:phaseLimits[Math.max(0,Math.min(2,stage))];
 const advance=Math.max(0,Math.min(100,deltaMs))*100/SCHEDULE_ANIMATION_MIN_MS;
 return Math.max(value,Math.min(limit,value+advance));
}
