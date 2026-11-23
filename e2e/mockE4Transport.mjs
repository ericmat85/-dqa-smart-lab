// Explicit, page-local Fake transport for UI tests. It never calls a model.
import {ASSISTANT_DEMOS} from '../src/assistantDemo.mjs';

export async function installMockE4Transport(page){
 let accountId=null,system=null,sequence=0;
 // This test page opts into the Preview client; production configuration is untouched.
 await page.route('**/src/previewAssistant.mjs*',async route=>{
  const upstream=await route.fetch();const body=(await upstream.text())
   .replaceAll('import.meta.env?.VITE_PRIVATE_PREVIEW',"'1'")
   .replaceAll('import.meta.env?.VITE_SANDBOX_API_BASE',"'/api/preview'");
  await route.fulfill({response:upstream,body,contentType:'text/javascript'});
 });
 await page.route('**/api/preview/**',async route=>{
  const req=route.request(),pathname=new URL(req.url()).pathname,trace='I-MOCK-BROWSER-'+(++sequence);
  const reply=(status,packet)=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-ID':trace,'Cache-Control':'no-store'},body:JSON.stringify({scope:'SANDBOX_ONLY',synthetic:true,trace_id:trace,...packet})});
  if(req.method()!=='POST')return reply(405,{error:{code:'METHOD_DENIED'}});
  let body;try{body=req.postDataJSON();}catch{return reply(422,{error:{code:'INVALID_SYNTHETIC_PAYLOAD'}});}
  if(pathname==='/api/preview/session'){
   if(body.logout){accountId=null;return reply(200,{signed_out:true});}
   accountId=body.accountId;system=body.system;
   return reply(200,{authenticated:true,session_created:true,conversation_id:'a'.repeat(32)});
  }
  if(pathname!=='/api/preview/ui/live/E4')return reply(404,{error:{code:'ROUTE_NOT_FOUND'}});
  if(!accountId)return reply(401,{error:{code:'SIGNED_SESSION_REQUIRED'}});
  if(system!=='lms'||!['DEMO-LEVEL1','DEMO-LEVEL2'].includes(accountId))return reply(403,{error:{code:'AUTHORIZATION_DENIED'}});
  if(body.synthetic!==true||!['GENERAL_CHAT','DOCUMENT_QA'].includes(body.mode))return reply(422,{error:{code:'INVALID_SYNTHETIC_PAYLOAD'}});
  if(body.question==='/clear')return reply(200,{data:{control:'CONVERSATION_CLEARED',real_ai:false}});
  const item=ASSISTANT_DEMOS.find(item=>item.question===body.question);
  const summary=typeof item?.answer==='string'&&item.answer.length>30?item.answer:'本機 Mock 介面測試，未呼叫真實模型。請從目前頁面查看合成委託、設備與排程；此回覆僅用於驗證聊天的呈現、捲動與操作，不代表真實模型或雲端驗收結果。';
  await new Promise(resolve=>setTimeout(resolve,250));
  return reply(200,{data:{engine:'E4',chat_mode:body.mode,execution_mode:'MOCK',real_ai:false,provider:'MOCK_HTTP_TRANSPORT',provider_request_id:'req_MOCK_BROWSER_'+sequence,model:'MOCK_ONLY',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.000028',history_turns_used:0,result:{summary,issues:[],advice:[],citations:[]}}});
 });
}
