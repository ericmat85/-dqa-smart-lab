// Administration configuration only. Business sources and server security policies remain independent.
export const ADMIN_GROUPS=['人員與組織','流程與試驗','文件與資料','介面與通知','安全與系統服務'];
export const ADMIN_MODULES=[
 ['accounts','帳號與權限管理','accounts',0,'資料連動','集中管理帳號、部門及內建／自訂角色權限。','accounts'],
 ['workflow','工作流程','history',1,'已實作','唯讀檢視既有階段、角色與簽核條件。'],
 ['parameters','試驗與設備參數','equipment',1,'已實作','查閱共用試驗目錄、設備規格及排程參數。','equipment'],
 ['documents','文件與報告設定','reports',2,'資料連動','管理 Excel 範本、文件保存政策與個人簽名。','archive'],
 ['backup','系統與資料設定','archive',2,'設定備份','管理系統參數、設定備份、資料回收與 Demo 維護。'],
 ['security','資訊安全設定','review',4,'稽核紀錄','檢視既有安全邊界、管理與實驗室操作紀錄。'],
 ['monitoring','系統監控','equipment',4,'服務檢查','來源健康、儲存狀態與受保護的後端健康檢查。'],
 ['data-maintenance','資料維護與 Demo 工具','archive',2,'資料庫回收區','集中委託清理、資料還原與 Demo 資料維護。'],
 ['interface','介面設定','settings',3,'已實作','調整字體、語言與列表每頁顯示筆數。'],
 ['ai','AI 引擎管理','ai',4,'E2／E4 請求監控','AI 排程偏好、排程與助理的實際請求監控。'],
 ['notifications','通知與提醒設定','notifications',3,'資料連動','管理案件通知、站內提醒與電子郵件寄送狀態。'],
 ['quality','品質與稽核設定','review',1,'資料連動','建立改善追蹤，連結案件、設備與試驗來源。'],
 ['qualifications','人員資格管理','accounts',0,'資料連動','管理訓練與資格到期紀錄，對照現有人員。'],
 ['organization','組織與租戶設定','maintenance',0,'資料連動','工作區設定與現有人員、部門及據點概況。'],
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
 ['request','AI 智能審查系統','E1 統一審查委託單、電子簽名完整性與報告；保留原有簽核流程。'],
 ['report','AI 報告生成機','E3 依目前報表資料產生客製化報表與特殊報告草稿，支援 Excel／PDF 匯出。'],
 ['schedule','AI 排程智慧化','試驗資料與資源核對、可調整的規劃偏好，以及請求、用量與 Trace 監控。'],
 ['assistant','AI 智能助理','一般聊天與合成文件問答；狀態取自實際回應。'],
].map(([id,name,description])=>({id,name,description}));
export const AI_ENGINE_PAGES=[['E1','request'],['E2','schedule'],['E3','report'],['E4','assistant']].map(([code,id])=>({code,...AI_ENGINES.find(e=>e.id===id)}));
export const NOTICE_RULES=[['approval','委託單待簽核提醒'],['overdue','審查逾期提醒'],['schedule','試驗排程異動通知'],['completed','試驗完成通知'],['report','報告待審核提醒'],['calibration','設備校正到期提醒'],['ai','AI 審查異常提醒']];
export const ADMIN_FIELDS={
 backup:[{key:'enabled',label:'開頁期間顯示備份提醒',type:'checkbox'},{key:'frequency',label:'備份頻率',options:[['daily','每日'],['weekly','每週一'],['manual','手動']]},{key:'time',label:'預定備份時間',type:'time'},{key:'retentionDays',label:'建議備份保留天數',type:'number',min:1,max:3650}],
 documents:[{key:'retentionDays',label:'文件保存期限（天，Demo 草稿）',type:'number',min:1,max:36500}],
 ai:AI_ENGINES.map(e=>({key:e.id,label:`${e.name}模擬啟用`,type:'checkbox'})),
 notifications:NOTICE_RULES.flatMap(([id,label])=>[{key:id,label:`${label}（站內）`,type:'checkbox'},{key:id+'Time',label:`${label}時間`,type:'time'}]),
 quality:[{key:'category',label:'不符合事項分類（Demo）',type:'text'},{key:'auditItem',label:'稽核項目（Demo）',type:'text'}],
 qualifications:[{key:'person',label:'假人員名稱',type:'text'},{key:'equipment',label:'設備操作授權（Demo）',type:'text'},{key:'test',label:'試驗項目授權（Demo）',type:'text'},{key:'training',label:'訓練紀錄（Demo）',type:'text'},{key:'expires',label:'授權到期日期',type:'date'}],
 organization:[{key:'company',label:'工作區名稱',type:'text'},{key:'departments',label:'部門說明',type:'text'},{key:'hierarchy',label:'組織層級說明',type:'text'},{key:'sites',label:'據點說明',type:'text'}],
};
export function adminSeed(){return {version:1,settings:{
 backup:{enabled:false,frequency:'daily',time:'02:00',retentionDays:30},documents:{retentionDays:365},
 ai:Object.fromEntries(AI_ENGINES.map(e=>[e.id,true])),
 notifications:Object.fromEntries(NOTICE_RULES.flatMap(([id])=>[[id,false],[id+'Time','09:00']])),
 quality:{category:'Demo：試驗偏差／文件缺漏／設備異常',auditItem:'Demo：案件、樣品、設備、報告版本與簽核追溯'},
 qualifications:{person:'Demo 工程師甲',equipment:'DEMO-EQUIPMENT-A（非真實設備）',test:'Demo 高溫試驗',training:'Demo 安全操作課程／2026-10-01',expires:'2027-12-31'},
 organization:{company:'DQA Smart Lab',departments:'依現有人員資料彙整',hierarchy:'尚未設定組織層級',sites:'依設備據點彙整'},
 },events:[],backups:[]};}
export const QUALITY_EXAMPLES=[{id:'DEMO-CAPA-01',category:'文件缺漏',correction:'補齊示範檢查清單',prevention:'教育訓練及複核（展示）',status:'Demo 待評估，非正式 CAPA'},{id:'DEMO-AUDIT-01',category:'設備異常',correction:'示範設備重新確認',prevention:'檢查週期建議（展示）',status:'Demo 追溯至案件／樣品／設備／報告版本'}];
export const AI_USAGE=AI_ENGINES.map((e,i)=>({id:e.id,name:e.name,model:'Demo 規則模擬器（未接模型）',rules:'DEMO-RULES-1.0（展示）',tokens:`${(i+1)*1200}（Demo 示例）`,cost:`USD ${((i+1)*0.012).toFixed(3)}（Demo 示例）`}));
export const QUALIFICATION_EXAMPLE={id:'DEMO-STAFF-B',person:'Demo 工程師乙',equipment:'DEMO-EQUIPMENT-B（非真實設備）',test:'Demo 振動試驗',training:'Demo 複訓待完成',expires:'2020-01-01'};

// Reference classification: descriptive evidence only, never a configuration switch.
export const ADMIN_INTEGRATION_NOTES={
 parameters:[['試驗與設備','共用目錄與設定','試驗目錄、設備規格、占用統計天數及排程參數；系統參數已移至系統與資料設定。']],
 organization:[['實驗室資訊','共用資料庫設定','名稱、地址及聯絡資訊由同一份工作區共用設定提供；主管資訊不授權。']],
 documents:[['報告品牌','合成預覽','抬頭共用實驗室資訊；強調色與頁尾僅本頁預覽。新版範本明確採用及版本保存待做。'],['SOP 與文件','既有來源','沿用文件與範本管理；SOP 訓練事件串接待做。']],
 notifications:[['委託／報告待審','既有事件','資料庫狀態變更事件及既有通知服務；沿用原收件人與偏好。'],['校正／庫存／品質／訓練／維護／SOP','待做','既有業務資料可查閱，但未確認這些事件有共用寄送來源；不新增通知開關。'],['每日摘要／發票提醒','待做','尚無事件服務；帳號驗證郵件屬獨立登入流程。']],
 interface:[['SMTP','既有通知服務','由通知與提醒設定查詢服務狀態；本頁不測試連線或寄信。'],['儀器匯入','部分實作','設備端口設定與測點存在；跨儀器通用匯入整合待做。'],['ERP／客戶入口 API／條碼與 QR','待做','未提供這些對外整合或金鑰設定。'],['備份目的地','待做','管理設定 JSON 匯出不是資料庫備份。'],['外部 AI Provider','既有 AI 引擎','請至 AI 引擎管理檢視現況。']],
 security:[['審核與稽核','既有規則','沿用九階、禁止自審與同人跨階；不更動登入政策、帳號鎖定與資料保留。不是法規符合性認證。']],
 quality:[['品質保證','既有來源','沿用品質紀錄與稽核來源；獨立 OOS 紀錄待規劃，不自動變更流程。']],
 qualifications:[['訓練與資格','既有來源','沿用人員資格管理，SOP 訓練事件串接待做。']],
 backup:[['系統參數','共用資料庫設定','工作區名稱、顯示格式與時區。'],['備份與資料維護','既有設定工具','本機設定匯出不等於資料庫備份；遠端備份目的地待做。']],
};

// Preserve metadata/permissions for legacy links while merging the navigation entry.
export const ADMIN_NAV_MODULES=ADMIN_MODULES.filter(module=>module.id!=='data-maintenance').sort((a,b)=>a.group-b.group);
