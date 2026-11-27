// A review is reusable only for the exact actor, source, plan, group, and unsaved answers/signature.
export function firstReviewFingerprint({actor,request,stage,signature,comment,enabled}){
 return JSON.stringify([actor,enabled,request,stage?.key,stage?.ready,stage?.planRevision,stage?.sampleRevision,stage?.fields,signature,comment]);
}
export function reviewGateDecision({enabled,fingerprint,result,acknowledged}){
 if(!enabled)return 'SKIP';
 if(result?.fingerprint!==fingerprint)return 'CHECK';
 return result.findings.length&&acknowledged!==fingerprint?'CONFIRM':'READY';
}
