import {GUIDED_CASE,GUIDED_STEPS,guidedStepDone,guidedActionOverview} from './guidedTourSteps.mjs';
import {memoryStorage,tourDatabaseName} from './guidedTourStorage.mjs';
// This module must install isolation before dynamically importing any application module.
export async function startGuidedWorkspace(mount){
 const token=window.name,reportDb=tourDatabaseName(token);
 if(window.parent===window||!reportDb)throw Error('導覽工作區僅能由導覽頁開啟。');
 let stepIndex=0,pdfVisited=false,root=null,preference=null,initialized=false,initializing=false,last='',queued=false;
 const send=(type,payload={})=>window.parent.postMessage({source:'dqa-guided-workspace',token,type,...payload},location.origin);
 const local=memoryStorage({},()=>queue()),session=memoryStorage();
 Object.defineProperty(window,'localStorage',{value:local,configurable:true});Object.defineProperty(window,'sessionStorage',{value:session,configurable:true});
 Object.defineProperty(globalThis,'__DQA_GUIDED_CASE_ID__',{value:GUIDED_CASE,configurable:false});
 Object.defineProperty(globalThis,'__DQA_GUIDED_REPORT_DB__',{value:reportDb,configurable:false});
 const read=key=>{try{return JSON.parse(local.getItem(key)||'[]');}catch{return [];}};
 async function snapshot(){if(!initialized)return;try{const {allReports}=await import('./reportStore.mjs');const reports=await allReports();const source=read('dqa-request-demo-v2').find(r=>r.id===GUIDED_CASE);const savedReport=reports.find(r=>r.requestId===GUIDED_CASE);const report=source?.reportInfo&&source.reportInfo.revision!==savedReport?.revision?source.reportInfo:savedReport;const deviceDialog=document.querySelector('.eq-profile[role=dialog]');if(deviceDialog?.textContent.includes(read('dqa-schedules-demo-v1').find(r=>r.requestId===GUIDED_CASE)?.equipmentId||'__none__'))local.setItem('dqa-guided-equipment-visited','1');
 const state={equipmentVisited:local.getItem('dqa-guided-equipment-visited')==='1',index:stepIndex,request:source,schedule:read('dqa-schedules-demo-v1').find(r=>r.requestId===GUIDED_CASE),lab:read('dqa_lab_demo_requests_v1').find(r=>r.id===GUIDED_CASE),report,pdfVisited,path:location.pathname};const data={...local},next=JSON.stringify({state,data});if(next!==last){last=next;send('snapshot',{state,data});}highlight(state);}catch(error){send('error',{message:error.message});}}
 function queue(){if(queued)return;queued=true;setTimeout(()=>{queued=false;snapshot();},100);}
 function visible(el){return Boolean(el&&el.getClientRects().length&&!el.disabled&&getComputedStyle(el).visibility!=='hidden');}
 function button(text){return [...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')||el.textContent.trim())===text);}
 function caseButton(text){const row=[...document.querySelectorAll('tbody tr')].find(el=>el.textContent.includes(GUIDED_CASE));return [...(row?.querySelectorAll('button')||[])].find(el=>visible(el)&&el.textContent.trim()===text);}
 function textButton(pattern){return [...document.querySelectorAll('button')].find(el=>visible(el)&&pattern.test(el.textContent.trim()));}
 let previousTarget=null,lastTarget='';
 function publishTarget(target,instruction){const rect=target?.getBoundingClientRect();const data=target?{key:`${stepIndex}:${target.getAttribute('aria-label')||target.textContent.trim()||target.closest('label')?.textContent.trim()}`,instruction,overview:guidedActionOverview(stepIndex,target.getAttribute('aria-label')||target.textContent.trim()),rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},viewportWidth:innerWidth,viewportHeight:innerHeight}:null;const value=JSON.stringify({index:stepIndex,target:data});if(value!==lastTarget){lastTarget=value;send('target',{index:stepIndex,target:data});}}
 function actionInstruction(target){const text=target?.getAttribute('aria-label')||target?.textContent.trim()||target?.closest('label')?.textContent.trim()||'';if(target?.matches('.trial-equipment-card'))return '此委託使用多台設備。點選這台設備查看完整狀態與資訊，再關閉視窗繼續試驗。';if(target?.matches('input[type=number]'))return '填入每件樣品使用空間（本案填 1 U）。多機台可先設定設備台數，勾選附加設備後再產生建議。';if(target?.closest('.schedule-extra-equipment'))return '直接勾選要一起排程的附加設備，不需按 Ctrl。選取總台數須符合設備台數，再按 AI 自動化排程確認人員與時段。';if(text.includes('AI 自動化排程'))return '按 AI 自動化排程產生建議；單台或多台設備都需確認數量、樣品空間、人員與日期，最後才儲存。';if(text==='儲存排程')return '已產生建議，請檢查設備、樣品分配、人員與日期，再按儲存排程。';if(text==='設備狀態')return '按設備狀態直接查看本案設備的使用情形，再關閉設備資訊。';if(text==='關閉設備資訊'||text==='關閉')return '檢視完成後關閉此視窗，返回目前案件繼續操作。';if(text==='Demo試驗加速器')return stepIndex===4?'按 Demo 試驗加速器，將已接收案件推進至 50%。':'已查看設備，再按 Demo 試驗加速器推進至 100% 並完成本案試驗。';if(text==='DEMO 填入')return '按 DEMO 填入準備假資料報告，等待 AI 檢查通過後再提交。';if(text==='提交')return '檢查已通過；按提交送交二階主管審核。';return text?`請操作「${text.slice(0,70)}」。${GUIDED_STEPS[stepIndex].instructions.find(s=>s.includes(text))||''}`:GUIDED_STEPS[stepIndex].instructions[0];}
 function highlight(state){
  let target;const signature=document.querySelector('.dqa-signature-input');
  if(signature&&visible(signature)){
   const upload=[...signature.querySelectorAll('label')].find(el=>el.textContent.includes('上傳簽名檔'))?.querySelector('input');
   target=!signature.querySelector('img')?(!upload?.checked?upload?.closest('label'):button('使用預設簽名')):stepIndex===0?textButton(/核准委託單/):stepIndex<3?textButton(/^核准第/):button('簽名並核准報告');
  }
  if(stepIndex===0)target=signature?.querySelector('img')?target:button('DEMO 填寫')||target||button('簽核');
  else if(stepIndex===1||stepIndex===2)target=target||button(stepIndex===1?'LV1審查':'LV2審查');
  else if(stepIndex===3){const input=[...document.querySelectorAll('label')].find(el=>el.textContent.includes('每件樣品使用空間'))?.querySelector('input');const extra=document.querySelector('.schedule-extra-equipment input:not(:checked):not(:disabled)');target=visible(input)?(!input.value?input:extra|| (/已推薦|已帶入表單/.test(document.querySelector('.schedule-arrangement-message')?.textContent||'')?button('儲存排程'):textButton(/AI 自動化排程/))):button('編輯排程');}
  else if(stepIndex===4)target=guidedStepDone(4,state)?null:button('關閉')||button('確認送出')||(state.lab?.acceptedAt?button('Demo試驗加速器'):caseButton('確認接收'));
  else if(stepIndex===5)target=guidedStepDone(5,state)?null:button('關閉設備資訊')||document.querySelector('.trial-equipment-card')||button('關閉')||(!state.equipmentVisited?caseButton('設備狀態')||button('設備狀態'):button('Demo試驗加速器'));
  else if(stepIndex===6)target=document.querySelector('.report-review-status')?.textContent.includes('通過')?button('提交'):button('DEMO 填入')||caseButton('提交報告');
  else if(stepIndex===7||stepIndex===8)target=target||button(stepIndex===7?'LV2審核':'LV3審核')||textButton(/^待審核/);
  else if(stepIndex===9)target=button('確認查閱並封存')||button('查看');
  else if(stepIndex===10)target=button('查看 PDF')||button('下載 PDF');
  document.querySelectorAll('.guided-target').forEach(el=>{if(el!==target)el.classList.remove('guided-target');});
  if(target){if(!target.classList.contains('guided-target'))target.classList.add('guided-target');if(target!==previousTarget){target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});previousTarget=target;}}
  publishTarget(target,actionInstruction(target));
 }
 async function navigateStep(index){
  const step=GUIDED_STEPS[index];if(!step)return;stepIndex=index;previousTarget=null;
  const operator=read('dqa-schedules-demo-v1').find(r=>r.requestId===GUIDED_CASE)?.ownerId||'SEED-LAB-A';
  const actorId=step.actor==='operator'?operator:step.actor;
  session.setItem(`dqa-${step.system}-account-id`,actorId);
  if(step.system==='request'){session.setItem('dqa-request-role','supervisor');session.setItem('dqa-request-user',read('dqa-shared-demo-accounts-v1').find(a=>a.id===actorId)?.name||'');}
  history.replaceState({},'',step.path);root=mount(preference,`${stepIndex}-${Date.now()}`);queue();
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.token!==token)return;
  try{
   if(event.data.type==='init'&&!initialized&&!initializing){
    initializing=true;clearInterval(handshake);
    if(event.data.data)for(const [key,value]of Object.entries(event.data.data))local.setItem(key,value);
    else{
     const {createTourSeed}=await import('./productTour.mjs'),{SEED_KEYS}=await import('./nineStageSeed.mjs'),{createDemoApprovalSignature}=await import('./demoApprovalSignature.mjs');const signature=createDemoApprovalSignature('DEMO 導覽模擬簽名');const seed=createTourSeed({signature});
     for(const key of SEED_KEYS)local.setItem(key,seed.storage.getItem(key)||'[]');
     local.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));
     for(const account of read('dqa-shared-demo-accounts-v1'))local.setItem(`dqa-default-signature-v1:${account.id}`,signature);
    }
    local.setItem('dqa-global-theme',event.data.theme||'light');local.setItem('dqa-ui-preferences-v1',JSON.stringify({fontSize:'normal',language:'zh-TW',pageSize:20}));
    const style=document.createElement('style');style.textContent='.guided-target{outline:2px solid #0784ff!important;outline-offset:3px!important;animation:guided-border-glow 2s ease-in-out infinite!important}@keyframes guided-border-glow{0%,100%{box-shadow:0 0 0 4px #0784ff18}50%{box-shadow:0 0 0 7px #0784ff40}}@media(prefers-reduced-motion:reduce){.guided-target{animation:none!important;box-shadow:0 0 0 4px #0784ff30!important}}.intelligent-assistant{display:none!important}';document.head.append(style);
    preference=(await import('./PreferenceRoot.jsx')).default;initialized=true;await navigateStep(event.data.index||0);setInterval(snapshot,650);
   }else if(event.data.type==='navigate'&&initialized)await navigateStep(event.data.index);
   else if(event.data.type==='theme'&&initialized){local.setItem('dqa-global-theme',event.data.theme);window.dispatchEvent(new Event('dqa:theme'));}
  }catch(error){send('error',{message:error.message});}
 });
 const createUrl=URL.createObjectURL.bind(URL);
 URL.createObjectURL=blob=>{const url=createUrl(blob);if(stepIndex===10&&blob instanceof Blob&&blob.type==='application/pdf'){pdfVisited=true;queue();}return url;};
 document.addEventListener('click',event=>{
  const action=event.target.closest('button');
  if(action?.textContent.trim()==='Demo試驗加速器'){
   const lab=read('dqa_lab_demo_requests_v1').find(r=>r.id===GUIDED_CASE),request=read('dqa-request-demo-v2').find(r=>r.id===GUIDED_CASE);
   const start=stepIndex===4&&lab?.acceptedAt&&lab.status==='已排程';
   const finish=stepIndex===5&&lab?.status==='試驗中'&&local.getItem('dqa-guided-equipment-visited')==='1';
   if((!start&&!finish)||request?.reportInfo?.stage){event.preventDefault();event.stopImmediatePropagation();send('hint',{message:stepIndex===5&&lab?.status==='試驗中'?'請先按本案「設備狀態」查看設備，再完成試驗。':lab?.status==='待確認'||!lab?.acceptedAt?'請先確認接收本案，再使用加速器。':'本環節已完成，請按右側按鈕前往下一環節；加速器不會新增案件。'});return;}
  }
  send('hint',{message:''});setTimeout(queue,100);
 },true);
 let geometryQueued=false;const updateGeometry=()=>{if(geometryQueued)return;geometryQueued=true;requestAnimationFrame(()=>{geometryQueued=false;const target=document.querySelector('.guided-target');publishTarget(target,actionInstruction(target));});};window.addEventListener('resize',updateGeometry);document.addEventListener('scroll',updateGeometry,true);
 const devices=new MutationObserver(()=>{const dialog=document.querySelector('.eq-profile[role=dialog]');if(dialog?.textContent.includes(read('dqa-schedules-demo-v1').find(r=>r.requestId===GUIDED_CASE)?.equipmentId||'__none__'))local.setItem('dqa-guided-equipment-visited','1');});
 devices.observe(document.body,{childList:true,subtree:true});
 // A full-page navigation in the iframe runs this bootstrap again, so isolation survives reloads.
 window.addEventListener('pagehide',()=>{if(root)root.unmount();});
 const handshake=setInterval(()=>send('ready'),600);
 send('ready');
}
