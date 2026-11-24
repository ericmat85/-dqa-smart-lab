// Bound the entire operation, including response bodies. Abort alone cannot settle
// a stalled/non-cooperative transport, so callers also race the abort signal.
export async function withRequestDeadline(task,{signal,timeoutMs}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('A positive request deadline is required');
 if(signal?.aborted)throw signal.reason||new DOMException('Request cancelled','AbortError');
 const controller=new AbortController();
 const cancel=()=>controller.abort(signal.reason||new DOMException('Request cancelled','AbortError'));
 let rejectAbort;
 const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
 const onAbort=()=>rejectAbort(controller.signal.reason);
 controller.signal.addEventListener('abort',onAbort,{once:true});
 signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>controller.abort(Object.assign(new DOMException('Request deadline exceeded','TimeoutError'),{requestTimedOut:true})),timeoutMs);
 try{return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw controller.signal.reason;return task(controller.signal);}),aborted]);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',onAbort);}
}
