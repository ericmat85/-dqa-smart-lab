// Private Preview-only modes. Public DTOs and client-side secret access are unchanged.
export function selectE4ChatMode(text) {
  const input=String(text).trim();
  const document=/^文件問答\s*[:：]\s*/.exec(input);
  const mode=document?'DOCUMENT_QA':'GENERAL_CHAT';
  const question=document?input.slice(document[0].length).trim():input;
  if(!question||question.length>1500)throw Error('AI_DTO_BLOCKED: QUESTION_LENGTH');
  return {mode,question};
}
export async function sessionFailure(response) {
  let packet;
  try{packet=await response.json();}catch{packet=null;}
  const code=typeof packet?.error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(packet.error.code)?packet.error.code:'UNCLASSIFIED_RESPONSE';
  const candidate=packet?.trace_id||response.headers?.get?.('X-Trace-ID');
  const trace=typeof candidate==='string'&&/^I-[A-Za-z0-9_-]{1,80}$/.test(candidate)?candidate:'NOT_CAPTURED';
  const layer=packet?.scope==='SANDBOX_ONLY'&&trace!=='NOT_CAPTURED'?'PROXY_APPLICATION':'PLATFORM_OR_UNCLASSIFIED';
  return `AI Session 建立失敗（HTTP ${response.status}；${layer}；${code}）；未呼叫模型。Trace ${trace}`;
}
export function renderE4Reply(packet,mode) {
  const d=packet?.data;
  if(d?.control==='CONVERSATION_CLEARED'&&d.real_ai===false&&/^I-[A-Za-z0-9_-]{1,80}$/.test(packet.trace_id||''))return '【對話已清除；未呼叫模型】';
  const mock=d?.execution_mode==='MOCK'&&d.real_ai===false&&d.provider==='MOCK_HTTP_TRANSPORT';
  const live=d?.execution_mode==='LIVE_PROVIDER'&&d.real_ai===true&&d.provider==='openai_responses';
  if((!mock&&!live)||d.engine!=='E4'||(d.chat_mode??'DOCUMENT_QA')!==mode||typeof d.provider_request_id!=='string'||typeof d.result?.summary!=='string'||!d.result.summary.trim()||!Array.isArray(d.result.citations))throw Error('REAL_AI_NOT_VERIFIED：回應模式或Provider證據不符。');
  const u=d.usage;
  if(!Number.isInteger(u?.input_tokens)||u.input_tokens<0||!Number.isInteger(u?.output_tokens)||u.output_tokens<0||!/^I-[A-Za-z0-9_-]{1,80}$/.test(packet.trace_id||'')||typeof d.estimated_cost_usd!=='string'||!/^\d+(?:\.\d+)?$/.test(d.estimated_cost_usd))throw Error('REAL_AI_NOT_VERIFIED：缺少Trace或使用量證據。');
  if(mode==='GENERAL_CHAT'&&d.result.citations.length)throw Error('AI_OUTPUT_BLOCKED: GENERAL_CHAT_UNVERIFIED_CITATIONS');
  if(mode==='DOCUMENT_QA'&&!d.result.citations.length)throw Error(`EVIDENCE_INSUFFICIENT：沒有可驗證的合成文件引用。Trace ${packet.trace_id} · Tokens ${u.input_tokens}/${u.output_tokens}`);
  const execution=mock?'【MOCK測試：未呼叫真實模型；使用量與費用均為模擬】\n':'';
  const citations=d.result.citations.map(c=>`引用 ${c.document_id}@${c.version}：${c.quote}`).join('\n');
  let draft='';
  if(d.report_draft){
   const r=d.report_draft;
   if(r.kind!=='DRAFT_ONLY'||r.measurements!=='NOT_PROVIDED'||r.verdict!=='PENDING_ENGINEER_REVIEW'||r.signatures!=='NOT_SIGNED'||r.saved_to_system!==false||!/^REQ-\d{4}-(?:\d{3}|[a-f0-9]{8})$/.test(r.request_id)||typeof r.title!=='string')throw Error('REPORT_DRAFT_CONTRACT_INVALID');
   draft=`試驗報告草稿\n委託編號：${r.request_id}\n試驗名稱：${r.title}\n量測結果：尚未提供，不補填數值。\n結果判定：待工程師確認。\n正式簽核：未簽核，未提交至系統。\n\n`;
  }
  return `${execution}${draft}${d.result.summary}${citations?'\n'+citations:''}`;
}
