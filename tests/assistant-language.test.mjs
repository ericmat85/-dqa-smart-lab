import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ASSISTANT_DEMOS,findCommonQuestion,commonQuestionReply} from '../src/assistantDemo.mjs';
import {faqQuestion} from '../src/assistantLanguage.mjs';
import {readLabSnapshot,deriveLabMetrics} from '../src/labData.mjs';
let source=fs.readFileSync(new URL('../src/previewAssistant.mjs',import.meta.url),'utf8').replaceAll('import.meta.env?.VITE_PRIVATE_PREVIEW',"'1'").replaceAll('import.meta.env?.VITE_SANDBOX_API_BASE',"'/api/preview'");
source=source.replace(/(['"])(\.\/[^'"]+\.mjs)\1/g,(_all,_quote,module)=>JSON.stringify(new URL('../src/'+module.slice(2),import.meta.url).href));
const {askPreviewAssistant}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('all twenty FAQs have English questions and deterministic answers, with the same current counts',()=>{
 const snapshot=readLabSnapshot({getItem:()=>null}),metrics=deriveLabMetrics(snapshot);
 assert.equal(ASSISTANT_DEMOS.length,20);
 for(const item of ASSISTANT_DEMOS){
  const question=faqQuestion(item,'en');assert.equal(findCommonQuestion(question)?.id,item.id);
  const reply=commonQuestionReply(question,snapshot,metrics,'lms','en');assert.match(reply,/^FAQ\n/);assert.doesNotMatch(reply,/undefined|常見問題解答/);
  assert.match(commonQuestionReply(item.question,snapshot,metrics),/^常見問題解答/);
 }
 const result=commonQuestionReply(faqQuestion(ASSISTANT_DEMOS[0],'en'),snapshot,metrics,'lms','en');assert.match(result,new RegExp(`${metrics.counts['試驗中']} running`));
 assert.match(commonQuestionReply(faqQuestion(ASSISTANT_DEMOS[0],'en'),{},metrics,'lms','en'),/could not be read completely/);
});
test('language follows interface preference on the existing E4 route, without sending free-text instructions',async t=>{
 const prior=globalThis.localStorage;t.after(()=>{globalThis.localStorage=prior;});let sent,language='en';
 globalThis.localStorage={getItem:key=>key==='dqa-ui-preferences-v1'?JSON.stringify({language}):null};
 const storage={getItem:()=> 'DEMO-LEVEL1'};
 const fetchImpl=async(url,options)=>{
  if(url.endsWith('/session'))return{ok:true,status:200};
  assert.equal(url,'/api/preview/ui/live/E4');sent=JSON.parse(options.body);
  return {ok:true,status:200,json:async()=>({trace_id:'I-language-test',data:{engine:'E4',chat_mode:'GENERAL_CHAT',response_language:sent.language,execution_mode:'MOCK',real_ai:false,provider:'MOCK_HTTP_TRANSPORT',model:'MOCK_ONLY',provider_request_id:'req_MOCK_language',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.000028',result:{summary:sent.language==='en'?'Hello. Laboratory tests use verified specifications.':'您好，試驗須依已確認的規範執行。',citations:[]}}})};
 };
 assert.match(await askPreviewAssistant('hello','lms',{storage,fetchImpl}),/^\[MOCK test:/);assert.equal(sent.language,'en');assert.equal(sent.synthetic,true);assert.equal(sent.instructions,undefined);
 language='zh-TW';assert.match(await askPreviewAssistant('你好','lms',{storage,fetchImpl}),/您好/);assert.equal(sent.language,'zh-TW');
});
