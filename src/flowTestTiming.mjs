export const FLOW_TEST_WATERMARK='流程測試｜非正式試驗結果';
export function flowTestTiming({startsAt,endsAt,nominalHours,percent=0,actualStartedAt,actualCompletedAt,now=Date.now()}){
 const start=Date.parse(startsAt),end=Date.parse(endsAt),hours=Number(nominalHours);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isFinite(hours)||hours<=0||![0,50,100].includes(percent))throw Error('流程測試的排程或工時資料不完整。');
 const scheduledSeconds=(end-start)/1000,virtualElapsedSeconds=scheduledSeconds*percent/100;
 const actualStart=Date.parse(actualStartedAt),actualEnd=actualCompletedAt?Date.parse(actualCompletedAt):now;
 const actualElapsedSeconds=Number.isFinite(actualStart)&&Number.isFinite(actualEnd)?Math.max(0,(actualEnd-actualStart)/1000):0;
 return {scheduledSeconds,schedulingDays:scheduledSeconds/86400,nominalHours:hours,virtualElapsedSeconds,virtualAt:new Date(start+virtualElapsedSeconds*1000).toISOString(),actualElapsedSeconds,effectiveRatio:actualElapsedSeconds>=1?virtualElapsedSeconds/actualElapsedSeconds:null,referenceRatioForTwoMinutes:scheduledSeconds/120};
}
// A direct command opens controls; it never authorizes a write or invokes a model.
export function flowTestIntent(text){
 const value=String(text||'').trim();
 return /^\/demo[ \t]+accelerator$/i.test(value)||/^(?:\/accelerate|\/accelerator|\/flow-test)(?:\s|$)/i.test(value)||/^(?:請|幫我)?(?:開啟|叫出|呼叫)?(?:Demo\s*)?(?:試驗|流程)?加速(?:器|測試)?(?:\s|$|[：:])/i.test(value);
}
