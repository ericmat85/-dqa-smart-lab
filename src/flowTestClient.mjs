import {businessClient} from './businessClient.mjs';
import {businessIdentity} from './originalBusiness.mjs';
const key=()=>{const m=businessIdentity();return m?'dqa-flow-test-pending:'+m.user.id+':'+m.member.id:null;};
export function pendingFlowTest(){try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}}
export async function previewFlowTest(requestId){return (await businessClient.request('/flow-tests/preview',{method:'POST',body:{request_id:requestId}})).data;}
export async function executeFlowTest(command){
 const ownerKey=key();if(!ownerKey)throw Error('請先登入。');if(pendingFlowTest())throw Error('上一筆測試操作仍待確認，請重新開啟此視窗讀取結果。');
 const operation_id=crypto.randomUUID();sessionStorage.setItem(ownerKey,JSON.stringify({operation_id,request_id:command.request_id}));
 try{const {data}=await businessClient.request('/flow-tests/execute',{method:'POST',body:{operation_id,command}});if(key()!==ownerKey)throw Error('登入帳號已變更。');sessionStorage.removeItem(ownerKey);return data;}
 catch(e){if(!e.outcomeUnknown&&key()===ownerKey)sessionStorage.removeItem(ownerKey);throw e;}
}
export async function recoverFlowTest(){
 const p=pendingFlowTest(),ownerKey=key();if(!p)return null;
 const {data}=await businessClient.request('/flow-tests/result/'+p.operation_id);
 if(key()!==ownerKey)throw Error('登入帳號已變更。');
 if(data?.state==='SAVED')sessionStorage.removeItem(ownerKey);
 // NOT_FOUND can race an in-flight transaction. Never infer permission to resubmit.
 return data;
}
