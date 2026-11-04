// Administration-only fictional settings. No case, account, asset or service writes.
export const ADMIN_GROUPS=['基礎與流程管理','安全與維運','智慧與品質管理','組織管理'];
export const ADMIN_MODULES=[
 ['accounts','帳號與權限管理','accounts',0,'Demo 模擬','集中管理帳號、部門及內建／自訂角色權限。','accounts'],
 ['workflow','九階流程規則','history',0,'已實作','唯讀檢視既有階段、角色與簽核條件。'],
 ['parameters','試驗與設備參數','equipment',0,'已實作','查閱共用試驗目錄、設備規格及排程參數。','equipment'],
 ['documents','文件與報告設定','reports',0,'Demo 模擬','既有範本、報告入口與保存政策展示。','archive'],
 ['backup','系統備份設定','archive',1,'Demo 模擬','設定模擬排程；不備份、不還原業務資料。'],
 ['security','資訊安全設定','review',1,'Demo 模擬','區分瀏覽器安全機制與尚未接入的防護。'],
 ['monitoring','系統監控','equipment',1,'Demo 模擬','前端實況及分開標示的服務示意。'],
 ['ai','AI 引擎管理','dashboard',2,'Demo 模擬','四大引擎設定展示，沒有 API 呼叫。'],
 ['notifications','通知與提醒設定','notifications',2,'Demo 模擬','保存提醒規則草稿，不實際發送通知。'],
 ['quality','品質與稽核設定','review',2,'Demo 模擬','不符合、CAPA 與稽核追溯展示。'],
 ['qualifications','人員資格管理','accounts',2,'Demo 模擬','假資格與授權展示，不影響業務判定。'],
 ['organization','組織與租戶設定','maintenance',3,'Demo 模擬','虛構組織結構；不切換真實租戶。'],
].map(([id,title,icon,group,status,description,page])=>({id,title,icon,group,status,description,page}));
export const WORKFLOW_RULES=[
 ['待簽核','指定委託者主管','核准、退回補正','待審查','原委託者補件／重新送簽','委託必填資料、委託者簽名；核准需主管簽名，退回需原因。'],
 ['待審查','一階 → 二階主管','分階核准、退回','待排程','原委託者補正，再送指定主管','兩階主管簽名與意見；禁止自審、同人跨階審同案。'],
 ['待排程','具排程頁權限的使用者','指定設備、人員、樣品與時段','待確認','衝突留待排程處理','樣品編號、每件空間、容量、相容性與時間衝突驗證。'],
 ['待確認','實驗室有權操作人員','確認接收、申請取消','試驗中（接收後依日程開始）','未及時接收自動退回待排程','接收對應排程及預約版本；取消依既有主管核准規則。'],
 ['試驗中','實驗室執行人員／具原控制權的主管','執行、完成、申請中斷；有權主管暫停／恢復','已完成','中斷／取消依既有申請審核處理','使用對應設備與日程；待核准操作不得直接完成試驗。'],
 ['已完成','有權提交報告的實驗室人員','上傳、檢核及提交報告','待審核','報告補正後重新提交','案件對應 Excel、必填資料與既有 Demo 規則檢核。'],
 ['待審核','二階 → 三階主管','報告核准、退回','待查閱','已完成（報告補正）','兩階報告簽名；禁止自審及同人跨階，退回需原因。'],
 ['待查閱','指定委託者主管','查閱確認封存、退回報告補正','已結案','已完成，補正後重走報告審核','報告雙階完成；指定主管確認，退回需原因。'],
 ['已結案','依既有案件與封存文件存取權限','查閱、下載模擬合併 PDF','無（終點）','無直接退回控制','委託單在前、簽核報告在後；DEMO 文件不具正式認證。'],
].map(([stage,role,actions,next,returned,conditions],i)=>({id:i+1,stage,role,actions,next,returned,conditions}));
export const AI_ENGINES=[
 ['request','AI 委託單審查','委託內容檢查展示；正式簽核仍由既有角色執行。'],
 ['report','AI 試驗報告審查','既有前端工作簿格式與必要欄位規則檢核。'],
 ['schedule','AI 排程智慧化','既有前端設備相容與時段建議，不變更演算法。'],
 ['assistant','AI 智能助理','既有 Demo 問答與快照查詢。'],
].map(([id,name,description])=>({id,name,description}));
export const NOTICE_RULES=[['approval','委託單待簽核提醒'],['overdue','審查逾期提醒'],['schedule','試驗排程異動通知'],['completed','試驗完成通知'],['report','報告待審核提醒'],['calibration','設備校正到期提醒'],['ai','AI 審查異常提醒']];
export const ADMIN_FIELDS={
 backup:[{key:'enabled',label:'模擬自動備份啟用',type:'checkbox'},{key:'frequency',label:'備份頻率',options:[['daily','每日'],['weekly','每週一'],['manual','手動']]},{key:'time',label:'預定備份時間',type:'time'},{key:'retentionDays',label:'模擬保留天數',type:'number',min:1,max:3650}],
 documents:[{key:'retentionDays',label:'文件保存期限（天，Demo 草稿）',type:'number',min:1,max:36500}],
 ai:AI_ENGINES.map(e=>({key:e.id,label:`${e.name}模擬啟用`,type:'checkbox'})),
 notifications:NOTICE_RULES.flatMap(([id,label])=>[{key:id,label:`${label}（模擬）`,type:'checkbox'},{key:id+'Time',label:`${label}時間`,type:'time'}]),
 quality:[{key:'category',label:'不符合事項分類（Demo）',type:'text'},{key:'auditItem',label:'稽核項目（Demo）',type:'text'}],
 qualifications:[{key:'person',label:'假人員名稱',type:'text'},{key:'equipment',label:'設備操作授權（Demo）',type:'text'},{key:'test',label:'試驗項目授權（Demo）',type:'text'},{key:'training',label:'訓練紀錄（Demo）',type:'text'},{key:'expires',label:'授權到期日期',type:'date'}],
 organization:[{key:'company',label:'虛構公司名稱',type:'text'},{key:'departments',label:'部門（Demo）',type:'text'},{key:'hierarchy',label:'組織層級（Demo）',type:'text'},{key:'sites',label:'實驗室據點（Demo）',type:'text'}],
};
export function adminSeed(){return {version:1,settings:{
 backup:{enabled:false,frequency:'daily',time:'02:00',retentionDays:30},documents:{retentionDays:365},
 ai:Object.fromEntries(AI_ENGINES.map(e=>[e.id,true])),
 notifications:Object.fromEntries(NOTICE_RULES.flatMap(([id])=>[[id,false],[id+'Time','09:00']])),
 quality:{category:'Demo：試驗偏差／文件缺漏／設備異常',auditItem:'Demo：案件、樣品、設備、報告版本與簽核追溯'},
 qualifications:{person:'Demo 工程師甲',equipment:'DEMO-EQUIPMENT-A（非真實設備）',test:'Demo 高溫試驗',training:'Demo 安全操作課程／2026-10-01',expires:'2027-12-31'},
 organization:{company:'Demo 示範科技（虛構）',departments:'Demo 研發部、Demo 品質部',hierarchy:'Demo 總部 → 品質處 → 示範實驗室',sites:'Demo 台北據點、Demo 測試據點'},
 },events:[],backups:[]};}
export const QUALITY_EXAMPLES=[{id:'DEMO-CAPA-01',category:'文件缺漏',correction:'補齊示範檢查清單',prevention:'教育訓練及複核（展示）',status:'Demo 待評估，非正式 CAPA'},{id:'DEMO-AUDIT-01',category:'設備異常',correction:'示範設備重新確認',prevention:'檢查週期建議（展示）',status:'Demo 追溯至案件／樣品／設備／報告版本'}];
export const AI_USAGE=AI_ENGINES.map((e,i)=>({id:e.id,name:e.name,model:'Demo 規則模擬器（未接模型）',rules:'DEMO-RULES-1.0（展示）',tokens:`${(i+1)*1200}（Demo 示例）`,cost:`USD ${((i+1)*0.012).toFixed(3)}（Demo 示例）`}));
export const QUALIFICATION_EXAMPLE={id:'DEMO-STAFF-B',person:'Demo 工程師乙',equipment:'DEMO-EQUIPMENT-B（非真實設備）',test:'Demo 振動試驗',training:'Demo 複訓待完成',expires:'2020-01-01'};
