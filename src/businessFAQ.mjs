import {ASSISTANT_DEMOS,commonQuestionReply,findCommonQuestion} from './assistantDemo.mjs';
import {businessClient} from './businessClient.mjs';
import {businessIdentity,businessSessionVersion} from './originalBusiness.mjs';
const dynamic=new Set(['overview','pending','running','standby','stock']);
const english=language=>language==='en';
const unavailable=language=>english(language)?'FAQ\nCurrent database data could not be read completely. Counts are unavailable; refresh or open the corresponding list.':'常見問題解答\n目前資料庫資料無法完整讀取，不能確認數量；請重新讀取或查看對應清單。';
const overrides={
 sync:['已儲存的委託、排程、設備與物料資料由資料庫保存；在其他裝置以相同帳號登入，仍須依目前權限讀取。重新整理會重新載入已儲存資料；尚未儲存的表單變更可能遺失。','Saved requests, schedules, equipment and materials are stored in the database. Other devices can read saved data after sign-in, subject to current permissions. Refresh reloads saved data; unsaved form changes may be lost.'],
 finish:['到達預定結束時間後，執行人才能確認完成試驗；時間到期不代表已完成人工確認。完成或依流程中止後，後端依其他試驗與預約占用情況釋放設備；不會強制解除維護或校驗狀態。','After the scheduled end, the assigned executor may confirm test completion. Reaching the date alone is not completion confirmation. The backend releases equipment after completion or an authorized stop, subject to other reservations; maintenance/calibration states are preserved.'],
 progress:['進度依已儲存的開始與結束時間計算；排程以天為單位，即使規範工時只有一小時。已接收案件在排程時間到達後由後端開始，結束時間到達後才可確認完成。虛擬委託可透過助理輸入 /accelerate 推進；真實委託仍依正常時間與人工流程執行。','Progress uses saved start/end times. Scheduling uses whole days, even for a one-hour specification. The backend starts received tests at the scheduled time; completion can be confirmed only after the scheduled end. /accelerate advances virtual requests only; real requests follow normal time and human workflow.'],
 automatic:['由一階主管在「編輯排程」填寫每件樣品空間 U，再使用 AI 自動化排程。E2 核對既有試驗條件、可用設備與執行人後提供候選方案；選取並帶入表單後，仍須按「儲存排程」才會保存。這份常見問題由程式回答，不會執行排程模型。','A first-level supervisor enters space per sample in U in Edit Schedule, then runs AI Automated Scheduling. E2 checks source conditions, equipment and operators and returns candidates. Select a candidate and explicitly save the schedule. This FAQ is a program response and does not run the scheduling model.'],
};
export function businessFAQReply(question,raw,system='lms',language='zh-TW',member={}){
 const item=findCommonQuestion(question);if(!item)return null;
 const en=english(language),prefix=en?'FAQ\n':'常見問題解答\n';
 if(!dynamic.has(item.id)){
  if(overrides[item.id])return prefix+overrides[item.id][en?1:0];
  if(system==='request'&&['schedule','conflict','stop'].includes(item.id))return prefix+(en?'Scheduling, conflicts and stopping trials are handled by authorized supervisors in Laboratory Management. Requesters can view case progress in their request information.':'排程安排、衝突與中止試驗由實驗室管理系統的授權主管處理；委託者可在委託單資訊查看目前流程與處理紀錄。');
  return commonQuestionReply(question,{}, {},system,language);
 }
 const can=permission=>member.is_admin===true||member.permissions?.includes(permission);
 if(item.id==='standby'&&!can('equipment.read')||item.id==='stock'&&!can('materials.read'))return prefix+(en?'Your current role is not authorized to read this catalog. No counts were inferred.':'目前角色未開放此目錄的讀取權限，無法確認數量。');
 const required=item.id==='standby'?['equipment']:item.id==='stock'?['materials']:['requests'];
 if(!raw||required.some(k=>!Array.isArray(raw[k])))return unavailable(language);
 if(item.id==='standby'){
  if(raw.equipment.some(r=>!r||!['IDLE','IN_USE','MAINTENANCE','CALIBRATION','ON_LOAN','PAUSED','RETIRED'].includes(r.operational_status)))return unavailable(language);
  const n=raw.equipment.filter(r=>r.operational_status==='IDLE').length;
  return prefix+(en?`Visible database equipment: ${raw.equipment.length} total, ${n} on standby. Check specifications and reservations before scheduling.`:`目前帳號可見設備共 ${raw.equipment.length} 台，其中 ${n} 台待機；安排前仍須核對規格、容量及預約占用。`);
 }
 if(item.id==='stock'){
  if(raw.materials.some(r=>!r||typeof r.name!=='string'||![r.available_quantity,r.min_stock].every(x=>(typeof x==='number'||typeof x==='string'&&/^\d+(?:\.\d+)?$/.test(x))&&Number.isFinite(Number(x))&&Number(x)>=0)))return unavailable(language);
  const rows=raw.materials.filter(r=>Number(r.available_quantity)<Number(r.min_stock));
  return prefix+(en?`Among visible database materials, ${rows.length} are below safety stock.`:`目前帳號可見物料中，低於安全庫存共 ${rows.length} 項。`)+(rows.length?'\n'+rows.slice(0,20).map(r=>`${r.name} (${r.available_quantity} / ${r.min_stock} ${r.unit||''})`).join('\n'):'');
 }
 if(raw.requests.some(r=>!r||!['DRAFT','AWAITING_REQUEST_MANAGER','AWAITING_LMS_REVIEW','AWAITING_SCHEDULING','AWAITING_LAB_RECEIPT','RUNNING','COMPLETED','AWAITING_REPORT_REVIEW','AWAITING_VIEW_CONFIRMATION','CLOSED','RETURNED','CANCELLED'].includes(r.status)))return unavailable(language);
 const count=status=>raw.requests.filter(r=>r.status===status).length;
 const pending=count('AWAITING_SCHEDULING'),running=count('RUNNING'),receipt=count('AWAITING_LAB_RECEIPT'),completed=raw.requests.filter(r=>['COMPLETED','AWAITING_REPORT_REVIEW','AWAITING_VIEW_CONFIRMATION','CLOSED'].includes(r.status)).length;
 if(item.id==='pending')return prefix+(en?`Among visible database requests, ${pending} have passed review and await scheduling. Open the request/scheduling list for details.`:`目前帳號可見委託中，已完成審查、待排程共 ${pending} 筆；請至委託或排程清單查看明細。`);
 if(item.id==='running')return prefix+(en?`Among visible database requests, ${running} tests are running and ${receipt} await receipt or their scheduled start.`:`目前帳號可見委託中，試驗中 ${running} 筆，待接收或等待排程開始 ${receipt} 筆。`);
 return prefix+(en?`Visible database requests: ${pending} awaiting scheduling, ${receipt} awaiting receipt/start, ${running} running, ${completed} trials completed (including report review/closure).`:`依目前帳號可見的資料庫委託：待排程 ${pending} 筆、待接收／等待開始 ${receipt} 筆、試驗中 ${running} 筆、試驗已完成 ${completed} 筆（含報告審查／結案階段）。`);
}
export async function answerBusinessFAQ(question,{system='lms',language='zh-TW',signal,client=businessClient,identity=businessIdentity,sessionVersion=businessSessionVersion}={}){
 const item=findCommonQuestion(question);if(!item)return null;
 const owner=identity(),version=sessionVersion();if(!owner)throw Error('請先登入。');
 let raw;
 if(dynamic.has(item.id)){
  try{raw=(await client.request('/snapshot',{signal})).data;}
  catch(error){if(error.name==='AbortError'||error.status===401)throw error;return unavailable(language);}
 }
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const current=identity();if(version!==sessionVersion()||current?.user.id!==owner.user.id||current?.member.id!==owner.member.id)throw Error('登入帳號已變更，請重新查詢。');
 return businessFAQReply(question,raw,system,language,current.member);
}
export const BUSINESS_FAQ_IDS=ASSISTANT_DEMOS.map(row=>row.id);
