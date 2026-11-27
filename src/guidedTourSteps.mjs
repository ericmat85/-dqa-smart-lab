// These are navigation/checkpoint instructions, not replacement workflow rules.
export const GUIDED_CASE='TOUR-DEMO-001';
export const GUIDED_STEPS=[
 {stage:1,role:'模擬委託者主管',actor:'SEED-MANAGER',system:'request',path:'/request/reviews',title:'簽核試驗需求',overview:'這一步由委託者主管確認需求與委託內容。核准後，案件才會送交實驗室審查。',instructions:['在委託清單按「簽核」。','開啟 AI 智能助理，輸入 /demo fill in manager，準備模擬簽名與意見。','檢視內容，再按「✓ 核准委託單」。'],next:'前往 LV1審查'},
 {stage:2,role:'模擬一階主管',actor:'SEED-LEVEL1',system:'lms',path:'/lms/requests',title:'執行 LV1審查',overview:'一階主管先確認試驗需求與資料是否齊全。通過後，交由二階主管接續審查。',instructions:['按案件的「LV1審查」。','選「上傳簽名檔」，按「使用預設簽名」。','檢視需求後按「核准第 1 階」。'],next:'切換至 LV2審查'},
 {stage:2,role:'模擬二階主管',actor:'SEED-LEVEL2',system:'lms',path:'/lms/requests',title:'執行 LV2審查',overview:'二階主管接著檢視試驗的可執行性與資源需求。核准後，案件就能進入待排程。',instructions:['按「LV2審查」。','選「上傳簽名檔」，套用「使用預設簽名」。','按「核准第 2 階」，確認案件進入待排程。'],next:'前往排程管理'},
 {stage:3,role:'模擬一階主管',actor:'SEED-LEVEL1',system:'lms',path:'/lms/schedule',title:'親自安排設備與人員',overview:'排程會將委託連結到設備、執行人員與試驗時段。確認建議並儲存後，實驗室才可接收。',instructions:['按「編輯排程」。','每件樣品使用空間填入 1 U。','按「AI 自動化排程」，閱讀建議後按「儲存排程」。'],next:'前往實驗室接收'},
 {stage:4,role:'模擬執行工程師',actor:'operator',system:'lab',path:'/lab/dashboard',title:'接收並開始試驗',overview:'確認接收代表實驗室已準備執行這筆排程。接收後會等待開始時間，導覽可用加速器模擬開始。',instructions:['按「確認接收」，在視窗按「確認送出」。','等範本準備完成，按「關閉」返回試驗清單。','開啟 AI 智能助理，輸入 /accelerate，再按「推進至 50%」。'],next:'查看試驗執行'},
 {stage:5,role:'模擬執行工程師',actor:'operator',system:'lab',path:'/lab/dashboard',title:'操作試驗進度',overview:'設備狀態可查看本案設備的使用情形與樣品分配。檢視後可用 Demo 加速器模擬完成，不代表真實測量結果。',instructions:['先按本案操作欄的「設備狀態」，查看設備與目前使用情形。','關閉設備視窗後，向 AI 助理輸入 /accelerate，再按「推進至 100%」完成隔離 Demo 案件。'],next:'前往提交報告'},
 {stage:6,role:'模擬執行工程師',actor:'operator',system:'lab',path:'/lab/dashboard',title:'提交試驗報告',overview:'試驗完成後，工程師會提交報告與簽名供主管審核。導覽先用 Demo 規則檢查報告，提交後送交二階主管。',instructions:['按「提交報告」。','開啟 AI 智能助理，輸入 /create a demo report 建立導覽假資料報告，等待檢查完成。','確認結果後按「提交」，送二階主管審核。'],next:'前往 LV2審核'},
 {stage:7,role:'模擬二階主管',actor:'SEED-LEVEL2',system:'lms',path:'/lms/requests',title:'執行 LV2報告審核',overview:'二階主管在這裡檢視報告內容與試驗結果。簽名核准後，交由三階主管複核。',instructions:['按「待審核」頁籤，再按「LV2審核」。','選「上傳簽名檔」並「使用預設簽名」。','檢視 Excel 報告，按「簽名並核准報告」。'],next:'切換至 LV3審核'},
 {stage:7,role:'模擬三階主管',actor:'SEED-LEVEL3',system:'lms',path:'/lms/requests',title:'執行 LV3報告審核',overview:'三階主管進行最後的報告複核。簽名核准後，報告會送給指定的委託者主管查閱。',instructions:['按「待審核」頁籤，再按「LV3審核」。','選上傳簽名、套用預設簽名。','按「簽名並核准報告」，送指定委託者主管查閱。'],next:'前往主管查閱'},
 {stage:8,role:'模擬委託者主管',actor:'SEED-MANAGER',system:'request',path:'/request/reviews?tab=read',title:'查閱報告並確認封存',overview:'委託者主管在這裡查閱核准後的報告。確認查閱並封存後才產生結案文件，有問題也可退回補正。',instructions:['在查閱清單按「查看」。','可先按「預覽 PDF」檢視版面；此時沒有結案 PDF。','完成檢視後按「確認查閱並封存」，等待轉換完成。'],next:'前往結案資料庫'},
 {stage:9,role:'模擬委託者主管',actor:'SEED-MANAGER',system:'request',path:'/request/archive',title:'查看結案文件',overview:'資料庫保存已結案案件的委託與報告文件。可查看 Demo 報告示意圖或下載本案結案 PDF，了解文件的追溯方式。',instructions:['在資料庫查看這筆已結案委託。','親自按「查看 PDF」或「下載 PDF」。','完成九階操作後，再按「完成導覽」。'],next:'完成導覽'},
];
export function guidedStepDone(index,state){
 const r=state?.request||{},lab=state?.lab||{},report=state?.report||{};
 const rank={level2:1,level3:2,view:3,archived:4}[report.stage]||0;
 const afterReview=['待排程','已排程','執行中','試驗中','已完成','待審核','待查閱','已結案'].includes(r.status)||rank>0;
 const finished=lab.status==='已完成'||Boolean(r.execution?.completedAt)||rank>0;
 return [()=>r.status==='已核准'||afterReview,()=>r.lmsReview?.approval>=1||afterReview,()=>r.lmsReview?.approval>=2||afterReview,()=>Boolean(state?.schedule?.reservationId),()=>Boolean(lab.acceptedAt)&&(lab.status==='試驗中'||finished),()=>finished&&(state?.equipmentVisited===true||rank>0),()=>rank>=1,()=>rank>=2,()=>rank>=3,()=>rank>=4,()=>rank>=4&&state.pdfVisited===true][index]?.()||false;
}

// Overview is attached only to each checkpoint's key action, not every form field.
export function guidedActionOverview(index,label){
 const actions=[['簽核','核准委託單'],['LV1審查','核准第 1 階'],['LV2審查','核准第 2 階'],['編輯排程','AI 自動化排程','儲存排程'],['確認接收','確認送出'],['設備狀態'],['提交報告','提交'],['LV2審核','簽名並核准報告'],['LV3審核','簽名並核准報告'],['查看','預覽 PDF','確認查閱並封存'],['查看 PDF','下載 PDF']];
 const normalized=String(label||'').replace(/\s/g,'').replace(/^✓/,'');
 return actions[index]?.some(action=>normalized===action.replace(/\s/g,''))?GUIDED_STEPS[index].overview:'';
}
