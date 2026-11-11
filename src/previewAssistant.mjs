const enabled=import.meta.env?.VITE_PRIVATE_PREVIEW==='1';
const base=import.meta.env?.VITE_SANDBOX_API_BASE;
const sessionKey=system=>`dqa-${system}-account-id`;
function endpoint(path){
 if(!enabled)throw Error('真實 AI 未啟用（PRIVATE_PREVIEW_REQUIRED）；未呼叫模型。');
 if(base!=='/api/preview')throw Error('AI Proxy 設定未完成；未呼叫模型。');
 return base+path;
}
export function closePreviewAISession(system){
 if(enabled&&base==='/api/preview')fetch(base+'/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({system,logout:true})}).catch(()=>{});
}
export async function askPreviewAssistant(question,system,{fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage}={}){
 const command=/^(E[123])\s+(REQ-[A-Za-z0-9-]+)$/.exec(question.trim());
 const reportIntent=/(?:生成|產生|草擬).*報告|報告.*(?:生成|產生|草稿)/.test(question);
 const reportId=question.match(/REQ-[A-Za-z0-9-]+/)?.[0];
 if(reportIntent&&!reportId)throw Error('AI_DATA_BLOCKED: REPORT_CASE_REQUIRED；請提供委託編號，例如：請為 REQ-2026-002 生成報告草稿。');
 if(command||reportIntent){const {selectDemoReport}=await import('./aiSyntheticInput.mjs');const engine=command?.[1]||'E3';const record=selectDemoReport(command?.[2]||reportId,arguments[2]?.snapshot);const result=await askEngineAdvice(engine,record,{},system,{fetchImpl,storage});return result.summary+' · Trace '+result.trace+' · 僅供人工審查';}
 const url=endpoint('/ui/live/E4');
 if(!['lms','request','lab'].includes(system))throw Error('AI 系統權限不符；未呼叫模型。');
 const accountId=storage?.getItem(sessionKey(system));
 if(!accountId)throw Error('請先使用 Demo 帳號登入，再使用 AI 助理。');
 // This password is the existing public synthetic Demo credential, never a backend secret.
 const login=await fetchImpl(endpoint('/session'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({system,accountId,password:'demo1234'})});
 if(!login.ok)throw Error(`AI Session 未授權（HTTP ${login.status}）；未呼叫模型。`);
 const response=await fetchImpl(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Preview-System':system},body:JSON.stringify({synthetic:true,question})});
 const packet=await response.json();
 if(!response.ok){const code=packet.error?.code||'SERVICE_UNAVAILABLE';throw Error(`真實 AI 未啟用或請求遭拒（${code}）；未取得模型結果。Trace ${packet.trace_id||'UNKNOWN'}`);}
 const d=packet.data;
 if(d?.execution_mode!=='LIVE_PROVIDER'||typeof d.provider_request_id!=='string'||typeof d.result?.summary!=='string'||!Array.isArray(d.result?.citations))throw Error('REAL_AI_NOT_VERIFIED：回應不是可驗證的真實模型結果。');
 if(!d.result.citations.length)throw Error('EVIDENCE_INSUFFICIENT：沒有可驗證的合成文件引用。');
 return `${d.result.summary}\n${d.result.citations.map(c=>`引用 ${c.document_id}@${c.version}：${c.quote}`).join('\n')}\n人工最終決策 · 模型 ${d.model} · Provider ${d.provider_request_id} · Trace ${packet.trace_id}`;
}

export async function askEngineAdvice(engine,record,context={},system='lms',{fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage}={}){
 const {makeEngineInput}=await import('./aiSyntheticInput.mjs');const payload=makeEngineInput(engine,record,context),url=endpoint('/ui/live/'+engine);
 if(!['lms','request','lab'].includes(system))throw Error('AI_DTO_BLOCKED: INVALID_SYSTEM');
 const accountId=storage?.getItem(sessionKey(system));if(!accountId)throw Error('AI_SESSION_REQUIRED：請先使用 Demo 帳號登入。');
 const login=await fetchImpl(endpoint('/session'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({system,accountId,password:'demo1234'})});
 if(!login.ok)throw Error(`AI_SESSION_DENIED HTTP ${login.status}`);
 const r=await fetchImpl(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Preview-System':system},body:JSON.stringify(payload)});const packet=await r.json();
 if(!r.ok)throw Error(`AI ${engine} ${packet.error?.code||'SERVICE_UNAVAILABLE'} · Trace ${packet.trace_id||'UNKNOWN'} · REAL_AI=NOT_LIVE；未產生模型建議。`);
 const d=packet.data;
 if(d?.execution_mode!=='LIVE_PROVIDER'||d.engine!==engine||typeof d.provider_request_id!=='string'||typeof d.result?.summary!=='string'||!Array.isArray(d.result.issues)||!Array.isArray(d.result.advice))throw Error('REAL_AI_NOT_VERIFIED');
 if(engine==='E2'&&/\b(?:FEASIBLE|NO_FEASIBLE_SCHEDULE)\b/i.test(JSON.stringify(d.result)))throw Error('AI_OUTPUT_BLOCKED: CAPACITY_AUTHORITY_UNKNOWN');
 if(engine==='E3'&&/\d/.test(d.result.summary))throw Error('AI_OUTPUT_BLOCKED: NO_VERIFIED_MEASUREMENTS');
 return {summary:d.result.summary,issues:d.result.issues,advice:d.result.advice,trace:packet.trace_id,mode:'LIVE_PROVIDER_ADVISORY_ONLY',capacity_status:engine==='E2'?'UNKNOWN':undefined};
}
