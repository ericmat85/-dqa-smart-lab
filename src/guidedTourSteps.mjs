// These are navigation/checkpoint instructions, not replacement workflow rules.
export const GUIDED_CASE='TOUR-DEMO-001';
export const GUIDED_STEPS=[
 {stage:1,role:'模擬委託者主管',actor:'SEED-MANAGER',system:'request',path:'/request/reviews',title:'簽核試驗需求',instructions:['在委託清單按「簽核」。','按「DEMO 填寫」準備模擬簽名與意見。','檢視內容，再按「✓ 核准委託單」。'],next:'前往 LV1審查'},
 {stage:2,role:'模擬一階主管',actor:'SEED-LEVEL1',system:'lms',path:'/lms/requests',title:'執行 LV1審查',instructions:['按案件的「LV1審查」。','選「上傳簽名檔」，按「使用預設簽名」。','檢視需求後按「核准第 1 階」。'],next:'切換至 LV2審查'},
 {stage:2,role:'模擬二階主管',actor:'SEED-LEVEL2',system:'lms',path:'/lms/requests',title:'執行 LV2審查',instructions:['按「LV2審查」。','選「上傳簽名檔」，套用「使用預設簽名」。','按「核准第 2 階」，確認案件進入待排程。'],next:'前往排程管理'},
 {stage:3,role:'模擬一階主管',actor:'SEED-LEVEL1',system:'lms',path:'/lms/schedule',title:'親自安排設備與人員',instructions:['按「編輯排程」。','每件樣品使用空間填入 1 L。','按「AI 自動化排程」，閱讀建議後按「儲存排程」。'],next:'前往實驗室接收'},
 {stage:4,role:'模擬執行工程師',actor:'operator',system:'lab',path:'/lab/dashboard',title:'接收並開始試驗',instructions:['按「確認接收」，在視窗按「確認送出」。','等範本準備完成，按「關閉」返回試驗清單。','按「Demo試驗加速器」，模擬時間開始，進入試驗中。'],next:'查看試驗執行'},
 {stage:5,role:'模擬執行工程師',actor:'operator',system:'lab',path:'/lab/dashboard',title:'操作試驗進度',instructions:['在真實試驗清單查看目前進度與設備。','再次按「Demo試驗加速器」，完成此筆已接收的模擬試驗。'],next:'前往提交報告'},
 {stage:6,role:'模擬執行工程師',actor:'operator',system:'lab',path:'/lab/dashboard',title:'提交試驗報告',instructions:['按「提交報告」。','按「DEMO 填入」建立導覽假資料報告，等待檢查完成。','確認結果後按「提交」，送二階主管審核。'],next:'前往 LV2審核'},
 {stage:7,role:'模擬二階主管',actor:'SEED-LEVEL2',system:'lms',path:'/lms/requests',title:'執行 LV2報告審核',instructions:['按「待審核」頁籤，再按「LV2審核」。','選「上傳簽名檔」並「使用預設簽名」。','檢視 Excel 報告，按「簽名並核准報告」。'],next:'切換至 LV3審核'},
 {stage:7,role:'模擬三階主管',actor:'SEED-LEVEL3',system:'lms',path:'/lms/requests',title:'執行 LV3報告審核',instructions:['按「待審核」頁籤，再按「LV3審核」。','選上傳簽名、套用預設簽名。','按「簽名並核准報告」，送指定委託者主管查閱。'],next:'前往主管查閱'},
 {stage:8,role:'模擬委託者主管',actor:'SEED-MANAGER',system:'request',path:'/request/reviews?tab=read',title:'查閱報告並確認封存',instructions:['在查閱清單按「查看」。','可先按「預覽 PDF」檢視版面；此時沒有結案 PDF。','完成檢視後按「確認查閱並封存」，等待轉換完成。'],next:'前往結案資料庫'},
 {stage:9,role:'模擬委託者主管',actor:'SEED-MANAGER',system:'request',path:'/request/archive',title:'查看結案文件',instructions:['在資料庫查看這筆已結案委託。','親自按「查看 PDF」或「下載 PDF」。','完成九階操作後，再按「完成導覽」。'],next:'完成導覽'},
];
export function guidedStepDone(index,state){
 const r=state?.request||{},lab=state?.lab||{},report=state?.report||{};
 return [()=>r.status==='已核准',()=>r.lmsReview?.approval===1,()=>r.lmsReview?.approval>=2,()=>Boolean(state?.schedule?.reservationId),()=>lab.status==='試驗中',()=>lab.status==='已完成',()=>report.stage==='level2',()=>report.stage==='level3',()=>report.stage==='view',()=>report.stage==='archived',()=>report.stage==='archived'&&state.pdfVisited===true][index]?.()||false;
}
