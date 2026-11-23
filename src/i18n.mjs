import {readUiPreferences} from './uiPreferences.mjs';
const entries=`
電子委託 · 虛擬測試填入|Electronic Requests · Virtual test data
您好！可以詢問委託流程；在空白新增委託單頁面輸入 /demo start，填入虛擬測試資料。|Hello! Ask about request workflows, or enter /demo start on a blank New Request page to fill in virtual test data.
輸入問題或 /demo start…|Ask a question or enter /demo start…
Enter 送出 · /demo start 填入虛擬委託 · /clear 清除對話|Enter to send · /demo start fills a virtual request · /clear clears chat

整合試驗・排程・設備・報告|Connect testing, scheduling, equipment and reports
打造智慧實驗室|Build a smarter laboratory
流程標準化|Standardized workflows
設備高效利用|Efficient equipment use
AI 智慧應用|Intelligent AI applications
數據可追溯|Traceable data
試驗文件與報告查閱|Test documents and report access
查看試驗接收、操作與申請紀錄|View test receipt, operations and request records
接收試驗、掌握執行進度與提交報告|Receive tests, track execution and submit reports
目前沒有待處理的試驗委託。|There are no test requests to process.
設計品質管理目前為展示入口，尚未開放登入。|Design quality management is a preview. Sign-in is not available yet.

試驗進度與設備使用概況|Test progress and equipment utilization

試驗規範／試驗手法|Test specification / method

麵包屑|Breadcrumbs
委託狀態摘要|Request status summary
委託單資訊與填寫檢核|Request information and completion checks
委託單資訊|Request information
填寫檢核|Completion checklist
草稿管理|Draft management
基本資料|Basic information
樣品與條件|Samples and conditions
備註與判定|Notes and criteria
確認送簽|Confirm and submit
儲存後產生|Assigned after saving
最後更新|Last updated
目前區段|Current section
儲存狀態|Save status
已填寫|Filled in
待填寫|Not filled in
直屬主管|Direct supervisor
送簽時仍會檢查所有必填欄位；草稿可先儲存部分資訊。|All required fields are checked on submission. Drafts may be saved with partial information.
新增試驗委託單|New test request

試驗執行|Test execution
設備排程|Equipment scheduling
報告管理|Report management
委託申請|Request submission
進度追蹤|Progress tracking
文件管理|Document management
實驗室數位化管理平台|Laboratory digital management platform
實驗室管理|Laboratory management
造隆實驗室|COLONG Laboratory
科隆實驗室|COLONG Laboratory
實驗室操作管理|Laboratory operations management
搜尋與篩選|Search and filters
通知清單|Notifications list
物料庫存已更新，請重新開啟編輯。|Material inventory changed. Reopen the editor.
借用或物料資料無法讀取。|Loan or material data cannot be read.
物料單位已變更，請重新申請。|The material unit changed. Submit a new request.
物料借用紀錄或台帳數量已變更，請先確認台帳。|Material loan records or quantities changed. Check the inventory ledger.
請選擇設備或物料借用。|Select an equipment or material loan.
搜尋借用單、設備、物料或用途…|Search loan ID, equipment, material or purpose…
物料歸還|Material return
核准物料借用|Approve material loan
退回物料借用|Return material loan request
借用資料無法讀取，尚未清除案件。|Loan data cannot be read. Cases have not been cleared.
物料台帳無法讀取，無法釋放借用。|The material ledger cannot be read. Loans cannot be released.
物料借用紀錄不一致，請先確認台帳。|Material loan records are inconsistent. Check the ledger first.
物料台帳數量不一致，無法釋放借用。|Material quantities are inconsistent. Loans cannot be released.
借用類別|Loan category
借用項目／數量|Loan item / quantity
借用項目與用途|Loan item and purpose
Borrowed Item & Purpose|Borrowed Item & Purpose
填寫設備或物料借用需求與預計歸還日期，送出後會建立借用申請紀錄。|Enter equipment or material loan requirements and an expected return date.
物料同步自 LMS 台帳；核准時才扣除可用數量，確認歸還後補回。|Materials come from the LMS catalog. Availability is deducted on approval and restored on confirmed return.
請選擇物料|Select a material
借用數量|Loan quantity
本次為借用，需全數歸還。|All borrowed units must be returned.
單位：|Unit:
請先選擇物料|Select a material first
物料借用|Material loan
物料借用：|Material loan:
借用物料|Borrowed material
借出物料／歸還|Material loans / returns
確認物料歸還|Confirm material return
歸還確認結果|Return inspection result
關閉物料歸還|Close material return
本次確認全數歸還，完成後補回可用數量。|Confirm return of all borrowed units to restore availability.
物料已確認歸還，可用數量已補回。|Material return confirmed and availability restored.
預計歸還|Expected return
借用人|Borrower
物料已移除，請重新選擇 LMS 物料台帳。|Material was removed. Select another LMS catalog item.
物料借用數量須為正整數。|Material loan quantity must be a positive integer.
物料目前不可借用，請確認台帳狀態。|Material is not available for loan. Check its status.
物料可用數量不足，請調整數量或改選物料。|Insufficient available material. Reduce the quantity or select another item.
物料台帳數量不一致，請先確認台帳。|Material quantities are inconsistent. Check the inventory ledger.
請完成物料借用資料，並確認借用期間。|Complete the material loan information and check the loan dates.
僅未參與申請的一階主管或系統管理員可核准物料借用。|Only an uninvolved first-level supervisor or administrator may approve a material loan.
物料借用狀態已變更，無法重複確認歸還。|Material loan status changed. The return cannot be confirmed twice.
僅一階主管或系統管理員可在 LMS 確認物料歸還。|Only a first-level supervisor or administrator may confirm material returns in LMS.
請填寫物料歸還確認結果。|Enter the material return inspection result.
此物料尚有借出紀錄，請先完成歸還；借出期間不可直接修改庫存數量或單位。|This material has active loans. Return them before changing inventory quantities or units.
設備／物料借用申請|Equipment / material loan requests
下一步：|Next:
前往送簽|Go to submission
重設會放棄本次尚未儲存的修改，確定重設？|Reset will discard your unsaved changes. Continue?
電子委託單|Electronic test requests
審查需求・安排資源・掌握試驗進度|Review requests · Allocate resources · Track test progress
試驗執行・設備管理・排程監控|Test execution · Equipment management · Schedule monitoring
報告處理・數據追溯|Report handling · Data traceability
委託申請・簽核流程・進度追蹤|Request submission · Approval workflow · Progress tracking
文件管理・試驗報告|Document management · Test reports
文件控管・品質審查・異常管理|Document control · Quality review · Issue management
稽核追溯・法規管理|Audit traceability · Compliance management
委託審查|Request review
狀態監控|Status monitoring
品質審查|Quality review
異常管理|Issue management
稽核追溯|Audit traceability
登入頁工具|Login tools
系統介紹|System introduction
切換淺色模式|Switch to light mode
切換深色模式|Switch to dark mode
登入說明|Sign-in help
請使用系統管理員提供的帳號與密碼登入。忘記密碼時，請使用登入表單的密碼協助功能。|Sign in with the account and password provided by your administrator. If you forgot your password, use the password help on the sign-in form.
帳號管理僅供系統管理員、二階主管或授權角色使用。|Account management is available to administrators, level 2 supervisors and authorized roles.
儀錶板|Dashboard
儀表板|Dashboard
試驗委託|Test requests
試驗委託管理|Test request management
試驗委託與審查|Test requests and reviews
試驗委託與接收|Test requests and receipt
試驗委託清單|Test request list
排程管理|Scheduling
試驗排程管理|Test scheduling
設備管理|Equipment
物料管理|Materials
報表分析|Reports
資料庫|Library
帳號管理|Account management
系統設定|Settings
系統管理|System administration
返回系統管理|Back to system administration
返回儀表板|Back to dashboard
回到首頁|Home
返回工作入口|Return to workspace selection
試驗報告|Test reports
試驗規範|Test specifications
試驗手冊|Test manuals
報告範本|Report templates
全部|All
全部分類|All categories
全部帳號|All accounts
全部日期|All dates
全部狀態|All statuses
全部角色|All roles
全部排程|All schedules
依分類|By category
依執行人員|By operator
依設備排程|By equipment
試驗排程|Test schedules
設備概況|Equipment overview
物料庫存|Material inventory
委託審查|Request reviews
搜尋|Search
搜尋欄位|Search field
清除篩選|Clear filters
匯出報表|Export report
報表顯示與匯出設定|Report display and export settings
報表與統計偏好|Report preferences
報表預設日期範圍|Default report date range
匯出檔案附上篩選條件與時間摘要|Include filters and export time in exported files
顯示及匯出欄位|Display and export columns
資料概況|Data overview
資料來源|Data source
資料來源健檢|Data health checks
資料來源與計算方式|Sources and calculations
來源讀取異常|Source read errors
來源資料大小|Source data size
工作提醒|Work reminders
待處理工作提醒|Pending work reminders
介面外觀|Appearance
文字與語言|Text and language
字體大小|Font size
較小|Small
標準|Standard
較大|Large
介面語言|Interface language
繁體中文|Traditional Chinese
設備稼動率設定|Equipment utilization settings
設備稼動率起始日期|Utilization start date
設備稼動率統計天數|Utilization period in days
起始日期與統計天數|Start date and reporting period
列表規則|Pagination
每頁顯示筆數|Records per page
系統規則與資料說明|System rules and data information
資料儲存|Data storage
目前瀏覽器|This browser
日期與排程|Dates and schedules
儲存 · 日期 · 分頁|Storage · dates · pagination
儲存偏好|Save preferences
儲存設定|Save settings
還原預設值|Restore defaults
重新檢查|Check again
重新檢查報告|Recheck report
尚未儲存|Unsaved changes
已套用設定|Settings applied
深色模式|Dark mode
淺色模式|Light mode
顯示模式|Display mode
切換為深色模式|Switch to dark mode
切換為淺色模式|Switch to light mode
切換深色或淺色模式|Switch light or dark mode
待排程|Pending scheduling
待排程試驗|Tests awaiting scheduling
未排程|Unscheduled
排程衝突|Scheduling conflicts
有衝突|Conflict
已排程|Scheduled
試驗中|Testing
暫停中|Paused
已完成|Completed
完成|Complete
本週完成|Completed this week
設備稼動率|Equipment utilization
設備排程占用率|Scheduled equipment occupancy
試驗排程狀態分布|Test schedule status distribution
總計|Total
筆排程|schedules
近期試驗委託|Recent test requests
設備狀態|Equipment status
設備總數|Total equipment
待機中|Standby
使用中|In use
維護中|Maintenance
校驗中|Calibration
借用|On loan
待審查|Awaiting review
待核准|Awaiting approval
待審核|Awaiting report review
待查閱|Awaiting acknowledgment
取消|Cancel
已取消|Cancelled
退回|Returned
草稿|Draft
已結案|Closed
已結案／PDF 已封存|Closed / PDF archived
待確認|Awaiting confirmation
待確認項目|Items to confirm
待一階主管審核|Awaiting level 1 review
已停用|Disabled
啟用中|Active
檢視者|Viewer
系統管理員|System administrator
一階主管|Level 1 supervisor
二階主管|Level 2 supervisor
三階主管|Level 3 supervisor
第一階主管|Level 1 supervisor
第二階主管|Level 2 supervisor
第一階審查主管|Level 1 reviewer
第二階審查主管|Level 2 reviewer
第三階審查主管|Level 3 reviewer
實驗室工程師|Lab engineer
實驗室副工程師|Assistant lab engineer
委託者|Requester
委託者主管|Requester supervisor
使用者|User
角色|Role
角色名稱|Role name
角色清單|Role list
功能權限|Page permissions
審查權限等級|Approval level
權限等級設定|Permission levels
帳號與權限管理|Accounts and permissions
帳號與角色權限管理|Accounts, roles and permissions
帳號總數|Total accounts
全部委託|All requests
待簽核/查閱|Pending approval / acknowledgment
委託單|Requests
借用單|Loans
我的委託/借用|My requests / loans
申請借用|Request a loan
新增委託單|New test request
主管登入|Supervisor sign in
委託者登入|Requester sign in
登入系統|Sign in
登出系統|Sign out
登入帳號（電子郵件）|Sign-in account (email)
密碼|Password
記住我|Remember me
忘記密碼？|Forgot password?
個人帳號選單|Account menu
個人設定|Personal settings
個人大頭照|Profile photo
顯示名稱|Display name
電子郵件|Email
電子郵件通知|Email notifications
系統通知|Notifications
通知中心|Notification center
移除照片|Remove photo
上傳照片|Upload photo
＋ 上傳照片|＋ Upload photo
＋ 建立新角色|＋ Create role
＋ 新增物料|＋ Add material
＋ 新增設備|＋ Add equipment
＋ 狀態變更|＋ Change status
＋申請借用|＋ Request a loan
歷史委託|Request history
歷史排程|Schedule history
排程管理圖表|Schedule charts
人力排程甘特圖|Personnel Gantt chart
設備排程甘特圖|Equipment Gantt chart
編輯排程|Edit schedule
儲存排程|Save schedule
中止排程|Stop schedule
暫停試驗|Pause test
恢復試驗|Resume test
查看|View
查看 PDF|View PDF
下載 PDF|Download PDF
下載範本|Download template
範本名稱|Template name
檔案格式|File format
一般性能試驗報告範本|General performance test report template
關閉|Close
關閉預覽|Close preview
結案 PDF 預覽|Archived PDF preview
結案 PDF|Archived PDF
返回|Back
回上一頁|Previous page
返回編輯|Back to editing
返回總覽|Back to overview
返回清單|Back to list
返回系統入口|Back to system selection
返回系統首頁|Back to system home
前一段|Previous section
下一段|Next section
確認|Confirm
確認選擇|Confirm selection
確認變更|Confirm change
確認接收|Confirm receipt
確認刪除|Confirm deletion
確認刪除草稿？|Delete this draft?
確認中止排程？|Stop this schedule?
確認中止並取消委託|Stop schedule and cancel request
確認，重新登入|Confirm and sign in again
刪除|Delete
刪除此草稿|Delete this draft
繼續編輯|Continue editing
放棄變更|Discard changes
編輯草稿|Edit draft
編輯並重新送出|Edit and resubmit
儲存草稿|Save draft
儲存草稿後離開|Save draft and leave
清除|Clear
清除表單|Clear form
清除簽名|Clear signature
送出主管簽核|Submit for supervisor approval
送出借用申請|Submit loan request
送出主管簽核 →|Submit for supervisor approval →
送出借用申請 →|Submit loan request →
操作|Actions
狀態|Status
分類|Category
排序|Sort
時間|Time
起始日期|Start date
開始日期|Start date
預計完成|Expected completion
預計完成日期|Expected completion date
需求日期|Required date
預計借用日期|Expected loan date
預計歸還日期|Expected return date
申請時間|Requested at
提交日期|Submitted date
封存時間|Archived at
簽名日期|Signature date
簽核日期|Approval date
檢查時間|Checked at
取消時間|Cancelled at
最後登入|Last sign-in
最近更新優先|Recently updated first
本週|This week
本月|This month
本月使用率|Monthly utilization
自訂日期|Custom dates
日期範圍|Date range
範圍開始|Range start
範圍結束|Range end
顯示天數|Days displayed
回到今天|Today
委託編號|Request ID
委託單號|Request number
申請單號|Application number
委託人|Requester
申請人|Applicant
申請人姓名|Applicant name
委託者姓名|Requester name
委託部門|Requesting department
申請部門|Applicant department
所屬部門|Department
主管帳號（送簽必填）|Supervisor account (required for submission)
指定直屬主管|Assigned supervisor
直屬委託者主管|Requester supervisor
客戶名稱|Customer name
客戶品番|Customer part number
產品代碼|Product code
產品類型|Product type
產品版本|Product version
產品資訊|Product information
產品／專案|Product / project
專案／試驗|Project / test
專案關鍵|Project keyword
PCBA 版本|PCBA version
軟體版本|Software version
製造日期|Manufacture date
製品版次 Product Version|Product version
PCBA 版次 PCBA Version|PCBA version
軟體版次 Software Version|Software version
製造日期 Date of Manufacture|Manufacture date
試驗項目|Test item
試驗項目清單（單選）|Test items (select one)
試驗項目（單選／送簽必填）|Test item (one required for submission)
試驗目的|Test purpose
試驗目的（送簽必填）|Test purpose (required for submission)
其他試驗目的說明（必填）|Other test purpose (required)
其他說明（非必填）|Other information (optional)
試驗規範／試驗手法|Test specification / method
試驗規範／試驗手法（送簽必填，可修改參考內容）|Specification / method (required; reference content can be edited)
試驗項目與試驗規範|Test items and specifications
試驗資訊|Test information
試驗執行資訊|Test execution information
試驗執行結果|Test results
試驗日程|Test timeline
測試數量|Sample quantity
測試數量（送簽必填）|Sample quantity (required for submission)
樣品資訊|Sample information
樣品來源|Sample source
樣品來源與樣品資訊|Sample source and information
可用空間 U|Available space U
樣品編號|Sample ID
每件樣品使用空間 L|Space per sample (L)
判定基準|Acceptance criteria
判定方式|Evaluation method
判定基準與備註|Acceptance criteria and notes
不作判定|No evaluation required
需作判定|Evaluation required
備註|Notes
備註 NOTE（非必填）|Notes (optional)
備註／簽核|Notes / approval
原因|Reason
原因（必填）|Reason (required)
變更原因|Reason for change
變更為|Change to
退回原因（退回時必填）|Return reason (required when returning)
主管意見|Supervisor comments
主管簽核意見|Supervisor approval comments
審查意見（退回時請填寫）|Review comments (required for a return)
簽核意見（退件時請填寫原因）|Approval comments (provide a reason when returning)
中止原因|Stop reason
中止原因（選填）|Stop reason (optional)
執行人|Operator
設備|Equipment
設備名稱|Equipment name
設備台數|Number of devices
設備負責人|Equipment owner
設備選擇|Equipment selection
附加設備（可複選）|Additional equipment (multiple selection)
設備資訊|Equipment details
設備基本資料|Equipment information
設備狀態變更|Equipment status change
設備與排程安排|Equipment and scheduling
待機設備|Standby equipment
選擇實驗設備|Select test equipment
選擇設備|Select equipment
請選擇設備|Select equipment
請選擇待機中的適用設備|Select suitable standby equipment
請選擇執行人|Select an operator
請選擇直屬主管|Select a supervisor
選擇物料|Select material
物料資訊|Material details
物料狀態變更|Material status change
物料操作紀錄|Material history
物料品項|Material items
物料編號|Material ID
物料名稱／料號|Material name / part number
設備編號|Equipment ID
設備名稱／型號|Equipment name / model
位置|Location
負責人|Owner
型號|Model
序號|Serial number
製造商|Manufacturer
購置日期|Purchase date
規格說明|Specifications
技術規格|Technical specifications
使用配置|Usage configuration
操作注意事項|Operating precautions
保養檢查重點|Maintenance checklist
獨立設備台帳|Individual equipment register
每日可用時間|Available hours per day
可用空間 U|Available space U
可用空間 U|Available space U
人員與試驗時段|Operator and test dates
排程備註|Schedule notes
排程分析|Schedule analysis
排程判讀提醒|Schedule interpretation notes
衝突／待確認|Conflicts / to confirm
選擇試驗項目|Select test item
選擇設備後顯示規格與容量|Select equipment to view specifications and capacity
選擇待機設備，安排執行人與試驗日期|Choose standby equipment, an operator and test dates
設備台帳、規格與校驗保養資訊|Equipment register, specifications, calibration and maintenance
管理實驗室耗材、完檢機、工具與治具|Manage lab consumables, test devices, tools and fixtures
儲存設備資料|Save equipment
儲存物料資料|Save material
編輯設備資料|Edit equipment
編輯物料資料|Edit material
儲存角色權限|Save role permissions
停用帳號|Disable account
安全庫存|Safety stock
總數量|Total quantity
可用數量|Available quantity
借用數量（每筆一台實體設備）|Loan quantity (one device per request)
借用期間|Loan period
借用期間與備註|Loan period and notes
借用用途|Loan purpose
借用設備|Loan equipment
借用設備與用途|Loan equipment and purpose
申請人資料|Applicant information
申請原因|Application reason
申請流程|Application process
申請簽名|Applicant signature
申請取消|Request cancellation
委託基本資料|Request information
委託取消紀錄|Request cancellations
委託簽名與主管簽核|Requester signature and supervisor approval
委託者簽名與主管簽核|Requester signature and supervisor approval
委託者簽名|Requester signature
主管簽名|Supervisor signature
主管簽核（二階流程：第一階段）|Supervisor approval (first stage)
簽名|Signature
簽名歷程|Signature history
簽核流程|Approval workflow
手寫簽名|Handwritten signature
使用預設簽名|Use default signature
上傳簽名檔|Upload signature
上傳電子簽名檔|Upload electronic signature
儲存為預設簽名|Save as default signature
電子簽名與審核|Electronic signature and review
雙階主管審查|Two-level supervisor review
規則檢查與簽核歷程|Rule checks and approval history
審查進度|Review progress
檢查委託資料|Check request
檢查欄位|Check fields
AI 自動化排程|AI scheduling
AI智能助理|AI assistant
AI 審查結果|AI review results
推薦設備與可用時段|Recommend equipment and available dates
取消分析|Cancel analysis
正在準備排程建議|Preparing schedule recommendations
未發現明顯缺漏|No obvious omissions found
常見問題|Frequently asked questions
說明|Help
Demo 工具|Demo tools
Demo 使用說明|Demo instructions
Demo填入|Fill demo data
DEMO 填入|Fill demo data
DEMO 填寫|Fill demo data
Demo試驗加速器|Demo test accelerator
DEMO 完整流程測試|Complete demo workflow
DEMO 展示環境|DEMO environment
Demo展示環境|Demo environment
僅供展示測試|For demonstration only
競賽展示版 · 使用虛構資料|Demo edition · fictional data
Demo 限制與出報告流程|Demo limitations and reporting workflow
Demo 展示 · 20 組常見問答|Demo · 20 common questions
建立完整流程 Demo 案件|Create a complete demo case
報告類型|Report type
試驗報告審核|Test report review
報告流程歷程|Report workflow history
退回報告|Return report
退回委託|Return request
退回補正|Return for revision
提交報告|Submit report
取得試驗報告單|Get test report form
上傳 Excel 報告（必填）|Upload Excel report (required)
下載本案 Excel 範本|Download case Excel template
下載目前 Excel 報告|Download current Excel report
下載結案 PDF（委託單＋報告）|Download final PDF (request and report)
重新下載|Download again
重新載入 Excel|Reload Excel
Excel 報告檢視|Excel report viewer
顯示比例|Zoom
正在準備 Excel 範本|Preparing Excel template
讀取中|Loading
重試儲存|Retry saving
重試讀取報告|Retry loading report
已自動登出|Automatically signed out
已接收，等待開始|Received; waiting to start
已開始下載空白範本，請依委託資料填寫。|Template download started. Complete it using the request details.
已直接退回 LMS 待排程，保留原委託審查結果。|Returned to LMS scheduling; previous review results are preserved.
此筆為系統模擬資料，簽名僅供流程展示。|This is simulated data. Signatures are for demonstration only.
此紀錄沒有可顯示的簽名圖片。|No signature image is available for this record.
此帳號沒有資料庫權限。|This account does not have library access.
此角色無權使用此功能。|This role cannot use this feature.
你沒有此頁的操作權限。|You do not have permission to use this page.
案件不存在或你沒有存取權限。|This case does not exist or you do not have access.
目前帳號沒有檢視此報告的權限。|This account cannot view this report.
目前沒有您可查閱的已封存報告。|No archived reports are available to you.
目前範圍沒有資料|No data in this scope
目前沒有符合條件的排程|No matching schedules
沒有符合條件的委託|No matching requests
沒有符合條件的物料|No matching materials
沒有符合條件的設備|No matching equipment
沒有符合篩選條件的設備排程|No matching equipment schedules
沒有符合搜尋條件的報告範本。|No matching report templates.
尚無設備資料|No equipment available
尚無紀錄|No records
尚無操作紀錄|No operating records
尚未設定|Not configured
尚未建立自訂角色|No custom roles created
尚未儲存的變更|Unsaved changes
尚無符合條件的借用申請紀錄|No matching loan requests
尚無簽名紀錄；舊示範資料未提供簽名圖片。|No signatures. Older demo records did not include signature images.
目前尚無操作或維護紀錄。|No operating or maintenance records yet.
目前沒有需要你處理的待辦。|You have no pending tasks.
目前沒有設備可供變更。|No equipment is available for a status change.
目前沒有實驗室執行人員或排程資料。|No lab operators or schedules are available.
目前沒有即將到期或逾期的進行中案件。|No active cases are due soon or overdue.
目前無對應設備。|No corresponding equipment.
此分類目前沒有歷史委託|No request history in this category
此分類目前沒有歷史排程|No schedule history in this category
此設備尚無試驗安排|No tests scheduled for this equipment
試驗已結束|Test finished
試驗已完成；報告仍待處理，不代表已審核、已查閱或已結案。|Testing is complete. Report review, acknowledgment and closure are still pending.
委託已取消，相關試驗排程已中止。|Request cancelled; related schedules have been stopped.
申請已退回，請查看操作歷程|Application returned. Check the operating history.
報告已移除或尚未同步。|Report removed or not yet synchronized.
目前狀態|Current status
流程狀態|Workflow status
申請流程|Application workflow
操作歷程|Operating history
完整操作歷程|Full operating history
本機操作歷程|Local operating history
操作與維護紀錄|Operations and maintenance records
操作者|Operator
優先待辦|Priority tasks
優先程度|Priority
優先順序|Priority
急件|Urgent
一般|Normal
高|High
中|Medium
低|Low
需求已逾期|Requirement overdue
需求日期提醒|Required date reminders
3 天內到期|Due within 3 days
逾期／急件／日期優先|Overdue / urgent / date priority
查看全部待辦|View all tasks
查看全部日期提醒|View all date reminders
查看清單 →|View list →
查看進度|View progress
點擊查看設備|View equipment
設備管理 ↗|Equipment ↗
前往委託管理 ↗|Request management ↗
全部排程 ↗|All schedules ↗
建立委託單、追蹤案件、補件|Create requests, track cases and submit revisions
審查委託單、核准或退件|Review, approve or return requests
帳號管理僅供系統管理員使用。|Account management is available to administrators and level 2 supervisors.
一般功能角色 · 無簽核權限|Standard role · no approval authority
內建權限唯讀；需自訂權限時，請建立新角色後指派帳號。|Built-in permissions are read-only. Create a custom role and assign it to an account to change access.
選擇工作入口|Choose a workspace
探索智慧實驗室|Explore the smart lab
進入系統|Enter system
電子委託系統|Electronic requests
DQA 實驗室管理系統|DQA laboratory management
COLONG 實驗室|COLONG laboratory
設計品質管理|Design quality management
造隆實驗室整合系統|COLONG integrated laboratory system
主管・管理人員|Supervisors · administrators
委託者・委託者主管|Requesters · requester supervisors
實驗室工程師・副工程師|Lab engineers · assistants
展示入口・尚未開發|Preview · not yet available
進入電子委託系統|Open electronic requests
進入 DQA 實驗室管理系統|Open DQA lab management
進入 COLONG 實驗室|Open COLONG laboratory
查看展示入口|Open preview
二階段流程說明|Two-stage workflow
設備選擇|Equipment selection
設備稼動率設定|Equipment utilization settings
每頁最多 20 筆|Up to 20 records per page
項|items
件|items
台|devices
筆|records
天|days
小時|hours
分鐘|minutes
必填|required
選填|optional
唯讀|read-only
搜尋已結案報告|Search archived reports
搜尋報告範本|Search report templates
搜尋試驗規範|Search test specifications
搜尋試驗手冊|Search test manuals
搜尋報表|Search reports
切換側邊欄|Toggle sidebar
切換功能選單|Toggle menu
切換深色或淺色模式|Toggle light or dark mode
上傳個人大頭照|Upload profile photo
關閉個人設定|Close personal settings
展開AI智能助理|Expand AI assistant
收合AI智能助理|Collapse AI assistant
篩選|Filter
帳號|Account
啟用|Enable
名稱|Name
部門|Department
新增帳號|Add account
編輯帳號|Edit account
新增角色|Add role
儲存|Save
核准|Approve
審查|Review
簽核|Approve
查閱|Acknowledge
需求日期由近至遠|Required date: earliest first
需求日期由遠至近|Required date: latest first
產品名稱遞增|Product name: ascending
委託單號遞增|Request number: ascending
委託單號遞減|Request number: descending
不占用排程|No schedule reservation
每日可用時數|Available hours per day
校驗管理|Calibration management
保養管理|Maintenance management
上次校驗|Last calibration
下次校驗|Next calibration
上次保養|Last maintenance
下次保養|Next maintenance
放置位置|Location
資料大小|Data size
讀取狀態|Read status
筆數|Record count
提醒類型|Reminder type
內容|Details
規範名稱|Specification name
切換系統|Switch system
重設密碼|Reset password
關閉操作訊息|Dismiss message
還原|Restore
設定|Settings
20 題|20 questions
LMS · 第一階主管核准|LMS · Level 1 approval
LMS 主管簽核|LMS supervisor approval
⌕　搜尋試驗名稱|⌕ Search test names
✓ 核准委託單|✓ Approve request
下一段 →|Next section →
儲存／送出 ↓|Save / submit ↓
AI 依設備類型、狀態、容量及設備／人員時段進行 Demo 規則推薦；確認後按「儲存排程」才會套用。|Demo recommendations consider equipment type, status, capacity and operator availability. Review and save to apply a schedule.
Demo 圖片簽名，不具正式電子簽章效力；結案 PDF 順序：委託單 → 試驗報告。|Demo image signatures have no legal electronic-signature validity. Final PDF order: request, then test report.
Demo 容積限制，無法取代實際樣品尺寸與治具間距確認。|Demo volume limits do not replace checks of actual sample dimensions and fixture clearances.
PDF 顯示於頁首；Excel 另列於「匯出摘要」工作表。|Shown in the PDF header and in the Excel export-summary worksheet.
「審查完成」與「試驗已完成」分別來自委託審查與排程資料，不互相混算。|Review completion and test completion are calculated separately from request reviews and schedules.
上傳照片後會顯示在主頁右上角。|Your uploaded photo appears at the top right of the workspace.
依委託目前階段簽核；原有二階審查流程維持不變。|Approve the current request stage using the existing two-level review process.
依已儲存日程推進狀態；排程時間與匯出摘要使用台灣時間。|Saved schedules determine status. Schedules and export summaries use Taiwan time.
依序以逾期、急件、需求日期、等待起點排序。等待起點以最後更新／建立時間為準。|Sorted by overdue status, urgency, required date and waiting start, based on the latest update or creation time.
依排程筆數統計|Based on schedule counts
依排程管理狀態查詢排程紀錄；此處僅供檢視。|Browse schedule history by status. This view is read-only.
依設備掌握試驗安排|Test schedules by equipment
依類別查閱試驗報告、試驗規範、試驗手冊與報告範本。試驗報告僅顯示主管確認查閱並完成 PDF 封存的案件；清除瀏覽器資料會移除本機封存檔案。|Browse test reports, specifications, manuals and templates. Reports appear after supervisor acknowledgment and PDF archiving. Clearing browser data deletes local archives.
僅使用假資料；資料儲存在此瀏覽器，不連接正式系統。|Fictional data is stored in this browser and is not connected to production systems.
僅供流程展示，請勿輸入真實公司或機密資料。|For workflow demonstrations only. Do not enter real company or confidential information.
僅未參與申請的一階主管或系統管理員可核准。|Only a level 1 supervisor or administrator who did not participate in the application may approve it.
分析設備狀態與試驗需求，尋找設備和人員皆可用的時段。|Analyze equipment status and requirements to find times when both equipment and personnel are available.
分頁檢視設備或人力排程；可瀏覽過去與未來日期|View equipment or personnel schedules across past and future dates.
勾選的功能頁面可供此角色操作；帳號與角色管理可建立或修改使用者權限。|Selected pages are available to this role. Account and role management can create or update user permissions.
可先儲存部分資訊，之後再從「我的委託/借用」繼續編輯並送出簽核。|Save partial information as a draft, then continue from My requests / loans and submit for approval.
可從任何狀態切換，不影響設備排程|Change from any status without affecting equipment schedules.
可透過起始日期與日期跨度瀏覽任意過去或未來區間；左右切換不受目前 Demo 日期限制。甘特圖依現有排程資料繪製，點擊任務可開啟既有排程編輯。尚未接上正式資料庫的排程衝突計算與最佳化引擎。|Browse any past or future period using the start date and span. Select a Gantt task to edit its saved schedule. Production conflict detection and optimization are not connected.
可選擇全部設備。開始維護或校驗時記錄起始時間，結束時請填寫處理結果，系統將保存完整紀錄。|Select any equipment. Start times are recorded for maintenance or calibration; enter the result when finished to retain a complete record.
可選擇帳號管理中設定的直屬委託者主管，由該主管登入後簽核。|Select the requester supervisor assigned in account management. That supervisor signs in to approve the request.
同一網站來源共用 localStorage 與 IndexedDB，清除網站資料會影響 Demo 內容。|This website shares localStorage and IndexedDB. Clearing site data affects demo content.
啟用後，系統通知可寄送至上述電子郵件。|When enabled, system notifications can be sent to the email address above.
回到首頁選擇其他系統；不會清除目前的 Demo 資料。|Return home to choose another system without clearing demo data.
報告審核完成後，委託者與指定主管即可查閱。|The requester and assigned supervisor can view the report after review is complete.
填寫借用申請 → LMS 待核准 → 一階主管核准／退回。|Complete loan request → LMS pending approval → level 1 supervisor approves or returns.
填寫設備借用需求與預計歸還日期，送出後會建立借用申請紀錄。|Enter equipment loan requirements and the expected return date, then submit to create a loan request.
多台以獨立設備保留並依容量分配樣品，不支援同槽共用。可用台數以台帳的實體設備為準。|Multiple devices are reserved separately and samples are allocated by capacity. Shared chambers are not supported; availability follows the physical equipment register.
套用於有日期的試驗排程與委託報表。|Applies to dated test schedules and request reports.
套用至儀錶板與試驗排程管理，依試驗排程時數估算稼動率。|Applies to the dashboard and scheduling. Utilization is estimated from scheduled test hours.
委託內容、試驗需求及簽核紀錄|Request details, test requirements and approval records
委託者建立並確認 → 主管簽核 → LMS 建立試驗案件 → 排程與試驗執行 → 試驗報告。|Requester creates and confirms → supervisor approves → LMS creates the case → scheduling and testing → test report.
委託詳細資料與簽核歷程|Request details and approval history
委託送出時自動交由此主管簽核。|The submitted request is automatically routed to this supervisor.
完整委託內容、試驗需求與簽核進度|Complete request details, test requirements and approval progress
客戶名稱（送簽必填）|Customer name (required for submission)
展示環境 · LMS 已排程委託會同步至待確認清單。實驗室接收與操作歷程儲存於此瀏覽器，取消原安排需先進入 LMS 待核准；中斷申請由 LMS 一階主管審核。|Demo environment. Scheduled LMS requests sync to the receipt queue. Receipt and operating history stay in this browser. Cancellation and interruption requests require LMS approval.
已依所選試驗項目帶入參考內容。此版本為前端示範目錄，正式使用時需串接 LMS 核准規範資料庫。|Reference content was filled from the selected test. This demo catalog must be replaced with the approved LMS specification database for production.
已依所選試驗項目帶入參考判定基準。此版本為前端示範目錄，正式使用需串接 LMS 核准判定基準資料庫。|Reference acceptance criteria were filled from the selected test. Production use requires the approved LMS acceptance-criteria database.
待審查委託|Requests awaiting review
從排程、設備、物料與委託資料掌握現況，匯出完整篩選結果。|Explore current schedules, equipment, materials and requests; export all matching results.
您好！可以詢問實驗室流程，或點選常見問題。數量類回答會讀取目前資料。|Hello! Ask about lab workflows or select a common question. Count-based answers use the current data.
找不到符合的試驗名稱，請更換關鍵字。|No matching test names. Try a different keyword.
按「編輯排程」查看委託內容並安排設備；日程結束後自動完成並釋放設備。|Select Edit schedule to review the request and assign equipment. Equipment is released when the schedule completes.
提示：目前為前端 Demo 規則檢查，尚未連接真正的 AI API 或讀取外部規格文件。結果僅供參考，不會自動核准或退回委託。|This demo checks local rules without a live AI API or external specification files. Results are advisory and do not approve or return requests.
支援 PNG、JPG，檔案不超過 1 MB。|PNG or JPG, up to 1 MB.
數量依目前系統資料更新|Counts update from current system data.
日期從明日開始，須於開始前完成接收。|Dates start tomorrow. Complete receipt before the start time.
日期與統計規則 · 台灣時間|Date and calculation rules · Taiwan time
日期起點不得晚於終點。|The start date must not be later than the end date.
明細分頁顯示；報表匯出包含全部符合條件的資料。|Details are paginated; exports include all matching records.
更新此 Demo 帳號的個人資料|Update this demo account's profile.
本機 Demo 紀錄，依簽署順序顯示；清除網站資料後將無法保留。|Local demo records in signing order. Clearing site data removes them.
本週為台灣時間週一至週日；排程狀態依已儲存日程計算。|Weeks run Monday through Sunday in Taiwan time. Status follows saved schedules.
本頁顯示待審查、待核准與報告待審核委託；已完成、取消及退回案件請至歷史委託查詢。|This page shows requests awaiting review, approval or report review. Completed, cancelled and returned cases appear in request history.
查詢已完成、取消及退回的委託單；此處僅供檢視。|Browse completed, cancelled and returned requests. This view is read-only.
查閱主管|Acknowledging supervisor
核准時需簽名；退件只需填寫原因，可不簽名。|Approval requires a signature. Returning a request requires a reason but no signature.
標示「必填」的欄位於送簽時檢查；草稿可不完整。日期格式：YYYY-MM-DD；自動帶入欄位為唯讀。|Required fields are checked on submission; drafts may be incomplete. Dates use YYYY-MM-DD. Automatically filled fields are read-only.
正在依現有規則檢查欄位，請稍候。|Checking fields against current rules. Please wait.
正在產生／檢查本案報告，請稍候…|Generating and checking this report. Please wait…
正在讀取完整 Excel、圖片與簽名…|Loading the complete workbook, images and signatures…
此為 3 秒 Demo 分析展示，使用既有規則產生推薦。完成後會帶入表單，確認並儲存後才會套用排程。|This three-second demo generates recommendations using existing rules. Review the filled form and save to apply the schedule.
此為 Demo 規則模擬，未連接真正 AI；不代表正式試驗合格。圖片簽名無正式電子簽章效力。須依序完成二階、三階簽核，由委託者主管確認查閱後才產生 PDF 並封存。|This simulated rule check does not certify a test result or use live AI. Image signatures are not legally valid electronic signatures. Level 2 and level 3 approval and requester-supervisor acknowledgment are required before PDF archiving.
此電子委託的簽名與審查結果會同步回委託系統；雙階核准後進入待排程。|Signatures and review results synchronize with the request system. The request enters scheduling after both approval levels.
清單與統計讀取同一組本機工作資料；頁面變更與跨分頁操作會同步更新。|Lists and statistics use the same local data and synchronize across pages and browser tabs.
瀏覽器檢視表格、合併儲存格、數值、內嵌圖片與簽名；複雜 Excel 圖表、頁首頁尾或浮動物件需由報告填寫人員核對原始檔。|The browser displays tables, merged cells, values, images and signatures. Verify complex charts, headers, footers and floating objects against the original Excel file.
物料低於安全庫存|Materials below safety stock
狀態可透過「狀態變更」自由切換。|Use Change status to update the status.
狀態變更|Change status
產品代碼（送簽必填）|Product code (required for submission)
產生本案假資料 Excel、展示簽名並檢查；確認後提交送簽。|Generate and check an Excel report with fictional data and demo signatures, then submit for approval.
由登入帳號自動帶入|Filled from the signed-in account
留空則從今天開始；以台灣時間計算完整日曆日。|Leave blank to start today. Full calendar days are calculated in Taiwan time.
目前為 Demo 設定；通知開關尚未連接實際郵件服務。|Demo setting only; the switch is not connected to an email service.
目前設備無法加入排程，請重新選擇待機設備。|This equipment cannot be scheduled. Select standby equipment.
確認後會取消整張委託單及其所有相關排程，並保留操作紀錄。未被其他試驗占用的設備會恢復待機。|Confirming cancels the entire request and all related schedules while preserving the history. Equipment without other reservations returns to standby.
確認接收、試驗執行與主管審核申請|Confirm receipt, execute tests and request supervisor review.
示範問答，助理不會直接變更資料。|Demo Q&A. The assistant does not directly modify data.
示範用追加紀錄，尚未具備正式後端不可竄改稽核機制|Append-only demo records without a production tamper-proof audit backend.
第一階段：委託者送單 → 主管簽核。第二階段：核准案件交由實驗室受理、安排排程並回報結果。|Stage 1: requester submits → supervisor approves. Stage 2: the lab receives approved cases, schedules tests and reports results.
簽名日期（自動記錄）|Signature date (recorded automatically)
維護／校驗設備|Equipment in maintenance / calibration
與試驗委託清單同步|Synchronized with the test request list
規格為 Demo 示範資料，正式使用請依設備原廠文件確認。|Demo specifications. Verify against the manufacturer's documentation before production use.
角色集中管理功能頁面與簽核階級；在帳號清單指派角色，即可套用相同權限。|Roles define page access and approval levels. Assign a role in account management to apply its permissions.
設備同步自 LMS 台帳；僅待機設備可申請，核准時會再次檢查狀態及排程。|Equipment syncs from the LMS register. Only standby equipment can be requested; status and schedules are rechecked on approval.
設備稼動率＝系統設定區間內的試驗排程時數／設備日曆總時數，重疊時段不重複計算；屬排程估算，非實測開機時數。排程占用率＝去除重疊後的預約時數／該分類設備本週日曆總時數。|Utilization is scheduled test hours divided by equipment calendar hours, without counting overlaps twice. It is an estimate, not measured run time. Occupancy uses unique reserved hours over this week's calendar hours.
調整介面外觀、確認資料健康狀態，集中查看需要處理的提醒。|Adjust appearance, check data health and review pending reminders.
請使用「狀態變更」調整設備狀態；新設備預設待機中。|Use Change status to update equipment. New devices default to standby.
請使用本階段對應的二／三階主管帳號登入。申請人及已簽核人不得重複簽核。|Sign in with the level 2 or level 3 supervisor assigned to this stage. Applicants and previous signers cannot sign again.
請檢查以下欄位|Check the following fields
請留意委託單狀態，主管簽核後將更新處理進度。|Monitor the request status. Progress updates after supervisor approval.
請選擇一個試驗項目；確認後會帶入對應參考規範，內容仍可自行修改。|Select one test item to fill the reference specification. You can still edit it.
資料儲存在此瀏覽器，不連接正式資料。|Data is stored in this browser and is not connected to production data.
送出時自動記錄當天日期（台灣時間），無須填寫。|Today's date in Taiwan time is recorded automatically on submission.
這只代表目前規則檢查未發現明顯問題，不代表試驗規格已獲正式認可。|No obvious issue was found by the current checks. This does not constitute formal specification approval.
進行中的試驗優先，其次為即將開始的安排；尚未設定時間的試驗置於最後。時間均為台灣時間。|Active tests appear first, followed by upcoming tests and tests without dates. All times use Taiwan time.
重新讀取設備狀態 ↻|Refresh equipment status ↻
開始日期不可晚於結束日期。|The start date must not be later than the end date.
開始維護／校驗，完成後恢復待機|Start maintenance or calibration; return to standby when finished.
集中檢視排程衝突、校驗與庫存提醒，點選項目即可前往處理。|Review schedule conflicts, calibration and stock reminders. Select an item to handle it.
集中管理使用者、角色與功能權限，從帳號指派到簽核層級一次完成。|Manage users, roles, page access and approval levels in one place.
離開後會失去尚未儲存的表單內容與簽名。你可以繼續編輯，或先儲存草稿。|Leaving loses unsaved form data and signatures. Continue editing or save a draft first.
電子化委託 · 二階簽核與案件追蹤 · Demo UI v2.0（示範資料）|Electronic requests · two-level approval and case tracking · Demo UI v2.0
預設簽名依帳號儲存於此瀏覽器；再次儲存會更新預設圖片。|Default signatures are stored per account in this browser. Saving again replaces the image.
顯示委託審查、申請核准與二／三階報告審核；已結案報告可在案件歷程查閱。|View request reviews, application approvals and level 2/3 report reviews. Closed reports are available in case history.
顯示目前瀏覽器的來源快照；點選來源名稱前往對應管理頁。大小僅計算列出的來源，不代表完整瀏覽器儲存用量。|This is a snapshot of this browser's sources. Select a source to open its management page. Sizes cover only listed sources, not total browser storage.
偏好已儲存，報表預設與設備稼動率區間已更新。|Preferences saved. Report defaults and the utilization period are updated.
設定尚未儲存，請確認瀏覽器儲存權限。|Settings were not saved. Check browser storage permissions.
搜尋編號、名稱、執行人或其他欄位…|Search IDs, names, operators or other fields…
搜尋委託編號、產品代碼、報告類型或查閱主管…|Search request IDs, product codes, report types or supervisors…
搜尋設備編號、名稱、型號、序號、位置或負責人…|Search equipment IDs, names, models, serials, locations or owners…
搜尋委託編號、產品代碼、試驗項目、部門…|Search request IDs, product codes, test items or departments…
請輸入申請人姓名|Enter the applicant name
請輸入樣品編號|Enter the sample ID
請輸入電子郵件|Enter email
請輸入密碼|Enter password
搜尋試驗名稱|Search test names
列表分頁|Pagination
上一頁|Previous page
下一頁|Next page
AI 審查|AI review
Demo 規則檢查|Demo rule checks
DEMO 模擬流程，非本人簽署|Simulated demo signature; not signed by the user
DQA Smart Lab 首頁|DQA Smart Lab home
Excel 活頁簿|Excel workbook
PDF 文件|PDF document
○ 等待檢查|○ Awaiting checks
✓ 已檢查|✓ Checked
一般角色|Standard role
上傳的簽名預覽|Uploaded signature preview
下載準備進度|Download preparation progress
不修改請留空|Leave blank to keep unchanged
不限|Any
中斷申請將交由 LMS 一階主管審核。|Interruption requests are reviewed by an LMS level 1 supervisor.
主管工作區 · 僅列出指定你處理的案件|Supervisor workspace · only cases assigned to you
來源補充說明（廠別、供應商或其他）|Additional source information (factory, supplier or other)
例如：DQA 實驗室|Example: DQA laboratory
例如：RD、PM、DQA|Example: RD, PM, DQA
例如：定期保養、異常檢查或年度校驗|Example: routine maintenance, fault inspection or annual calibration
例如：車用電子控制器|Example: vehicle electronic controller
供應商|Supplier
依委託送出日期篩選；審查完成與試驗完成分別統計。|Filter by request submission date. Review completion and test completion are counted separately.
依狀態篩選|Filter by status
依角色篩選|Filter by role
個人大頭照預覽|Profile photo preview
借用清單|Loan list
借用設備請先確認歸還。|Confirm the return of loaned equipment first.
停用|Disable
僅 lv1 一階主管可儲存進行中試驗的排程。|Only a level 1 supervisor can save schedules for active tests.
僅委託者可建立或編輯委託單。|Only requesters can create or edit requests.
優先度|Priority
儲存修改|Save changes
儲存失敗，請確認瀏覽器儲存空間與權限後重試。|Save failed. Check browser storage space and permissions, then try again.
儲存失敗，請重試。|Save failed. Try again.
全部委託單|All requests
兩次輸入的密碼不一致，請重新確認。|The passwords do not match. Check them again.
兩階主管皆已核准，委託狀態更新為完成。|Both supervisors approved the request; review is complete.
其他|Other
其他備註|Other notes
其他／自訂試驗項目|Other / custom test
切換淺色或深色模式|Switch light or dark mode
判定基準可能不夠具體|Acceptance criteria may be too vague
匯出失敗，請稍後重試。|Export failed. Try again later.
協作簽核|Collaborative approval
取消委託失敗，請確認瀏覽器空間後重試。|Could not cancel the request. Check browser storage space and try again.
取消申請已送至 LMS 待核准。|Cancellation submitted to LMS for approval.
可用|Available
可用空間須為正數（L），未知時請留空。|Available space must be a positive number in liters. Leave blank if unknown.
可用／總數量|Available / total quantity
可靠度與環境試驗項目|Reliability and environmental tests
單位|Unit
型號／料號|Model / part number
執行試驗|Run tests
報告未通過目前規則，請修正後重新檢查。|The report did not pass the current rules. Correct it and check again.
報表分類|Report category
委託審查分類|Request review categories
委託者工作區 · 僅列出你的委託與借用|Requester workspace · your requests and loans only
委託送出|Request submission
安排資源|Allocate resources
完成時間|Completed at
完成處理結果／變更原因|Result / reason for change
完成試驗|Complete test
客戶產品料號|Customer product part number
密碼至少需要 12 個字元。|Passwords require at least 12 characters.
實驗室管理系統|Laboratory management system
審查完成|Review completed
審查狀態|Review status
審核|Review
尚未建立任何委託單。|No requests have been created.
尚未檢查|Not checked
尚未登入|Never signed in
尚未送出|Not submitted
尚未選擇|Not selected
工作入口|Workspaces
工作總覽|Work overview
已填入測試簽名與審查意見，請確認後再提交。|Demo signature and review comments filled. Review before submitting.
已填入測試簽名與簽核意見，請確認後選擇核准或退回。|Demo signature and comments filled. Review before approving or returning.
已填入測試資料及測試簽名，請確認後送出。|Demo data and signature filled. Review before submitting.
已完成，可提交報告。|Completed. The report can now be submitted.
已核准|Approved
已結案清單|Closed cases
已退回|Returned
已退回委託單，委託者可依意見修正|Request returned. The requester can revise it using the comments.
已退回電子委託，委託者可補件重送。|Electronic request returned. The requester can revise and resubmit.
已重新讀取設備狀態。|Equipment status refreshed.
帳號姓名或部門未設定，請至 LMS 帳號管理補齊。|Account name or department is missing. Update it in LMS account management.
帳號沒有 LMS 權限，或密碼不正確。|This account lacks LMS access or the password is incorrect.
帳號清單|Account list
帳號資料已在本次 Demo 畫面更新。|Account information updated for this demo.
平台主題輪播|Platform introduction carousel
序號／批號|Serial / batch number
建立帳號|Create account
建立時間|Created at
建立物料台帳|Create material register
待主管簽核|Awaiting supervisor approval
待主管簽核委託|Requests awaiting supervisor approval
待審查試驗委託|Test requests awaiting review
待接收試驗|Tests awaiting receipt
待簽核|Awaiting approval
待補件|Awaiting supplements
執行中|In progress
已逾期|Overdue
我的委託與借用|My requests and loans
所有事項都已處理完成|All items have been handled
排程儲存失敗，請確認瀏覽器空間與權限後重試。|Could not save the schedule. Check browser storage and permissions.
排程初始化儲存失敗，請確認瀏覽器權限與空間。|Could not initialize schedules. Check browser permissions and storage.
排程資料無法讀取，請重新載入。|Could not read schedule data. Reload the page.
推進改善|Drive improvements
提交|Submit
提出取消申請|Request cancellation
提出委託|Create a request
提出試驗中斷申請|Request test interruption
搜尋姓名、電子郵件或部門...|Search names, email addresses or departments...
搜尋委託編號、產品代碼、試驗項目或設備…|Search request IDs, product codes, tests or equipment…
搜尋帳號|Search accounts
搜尋物料|Search materials
搜尋物料編號、名稱、料號、序號、位置或負責人…|Search material IDs, names, part numbers, serials, locations or owners…
搜尋設備|Search equipment
搜尋試驗名稱，例如：高溫、振動、IPX6…|Search test names, e.g. high temperature, vibration, IPX6…
搜尋試驗項目|Search test items
播放主題輪播|Play introduction carousel
暫停主題輪播|Pause introduction carousel
數量需為非負數，可用數量不可超過總數量。|Quantities must be nonnegative; available quantity cannot exceed the total.
新增物料|Add material
新增設備|Add equipment
新密碼至少需要 12 個字元。|New passwords require at least 12 characters.
暫未開放|Not yet available
最後更新（台灣時間）|Last updated (Taiwan time)
有必要資料缺漏，建議補齊後再送審。|Required information is missing. Complete it before submitting for review.
未分類|Uncategorized
未登入|Not signed in
未通過檢查|Checks failed
本機資料讀取失敗，請先排除錯誤再儲存。|Could not read local data. Resolve the error before saving.
本次操作簽名|Signature for this action
本週占用率|Occupancy this week
查看案件內容與目前流程狀態。|View case details and current workflow status.
查閱清單|Acknowledgment list
案件不存在、不可編輯或沒有權限。|The case does not exist, is not editable or is not accessible.
案件已更新，請重新開啟後簽核。|The case changed. Reopen it before approval.
案件歷程|Case history
案件清單|Case list
樣品尺寸、序號、版本差異、附件或其他注意事項|Sample dimensions, serials, version differences, attachments or precautions
檢查中…|Checking…
檢查與儲存中…|Checking and saving…
正在產生檔案…|Generating file…
此委託已取消，無法重新安排排程。|This request was cancelled and cannot be scheduled.
此帳號無權審核本案件，或已參與本案件的審查。|This account cannot review this case or has already participated in its review.
此操作必須填寫原因。|A reason is required for this action.
此案件排程已更新，請重新開啟編輯。|This schedule changed. Reopen it to edit.
此清單目前沒有案件。|There are no cases in this list.
此物料已更新，請重新開啟編輯。|This material changed. Reopen it to edit.
此電子郵件已經建立帳號，請使用其他電子郵件。|An account already uses this email. Use a different email address.
歸還日期不可早於借用日期。|The return date cannot be earlier than the loan date.
沒有符合搜尋／篩選條件的案件。|No cases match the search or filters.
測試數量不是正數，請確認樣品數量及填寫格式。|The sample quantity is not positive. Check the quantity and format.
測試數量需確認|Check sample quantity
測試數量須為正整數。|Sample quantity must be a positive integer.
測試樣品|Test sample
測試簽名（僅供流程測試）|Test signature (workflow testing only)
瀏覽器禁止保存登入狀態，請允許本機儲存後再試。|The browser blocked sign-in storage. Allow local storage and try again.
無|None
無法儲存審查結果，請檢查瀏覽器空間後重試。|Could not save review results. Check browser storage and try again.
無法儲存排程，請重試。|Could not save the schedule. Try again.
無法儲存設備狀態，請確認瀏覽器空間或權限後再試。|Could not save equipment status. Check browser storage or permissions.
無法儲存設備資料，請確認瀏覽器空間或權限後再試。|Could not save equipment data. Check browser storage or permissions.
無法產生建議，請確認設備與人員。|Could not generate recommendations. Check equipment and operators.
無法讀取最新排程資料。|Could not read the latest schedules.
無法讀取設備資料，請重新載入後再試。|Could not read equipment data. Reload and try again.
版本資訊待確認|Version information needs confirmation
物料|Materials
物料分類|Material category
物料名稱|Material name
物料狀態|Material status
物料編號已存在，請使用獨立編號。|This material ID already exists. Use a unique ID.
物料資料已儲存。|Material saved.
物料資料已更新|Material updated
物料資料無法讀取，請重新載入。|Could not read material data. Reload the page.
狀態變更失敗，請重試。|Status change failed. Try again.
甘特圖類型|Gantt chart type
產生／檢查中…|Generating / checking…
申請已送至 LMS 一階主管審核。|Application submitted to an LMS level 1 supervisor.
發現需要人工確認的項目，請主管與委託人核對。|Some items require manual confirmation by the supervisor and requester.
目前台帳|Current register
目前台帳快照，會隨管理頁面同步。|Current register snapshot, synchronized with management pages.
目前委託|Current request
目前沒有待查閱案件。|No cases await acknowledgment.
目前沒有待簽核案件。|No cases await approval.
確定恢復試驗？暫停期間會計入預估結束時間。|Resume this test? The pause duration will be added to the estimated end time.
確認刪除草稿|Confirm draft deletion
確認接收已儲存，等待排程開始。|Receipt saved. Waiting for the schedule to start.
確認結果|Confirm results
確認規範|Confirm specifications
確認送出|Confirm submission
示範確認|Demo confirmation
第一階主管已核准，等待第二階主管審查。|Level 1 approved. Awaiting level 2 review.
第一階已核准並同步，等待第二階主管審查。|Level 1 approval synchronized. Awaiting level 2 review.
等待主管審核委託內容與報告|Waiting for supervisor review of requests and reports
等待主管簽核委託內容|Waiting for supervisor request approval
等待安排設備與試驗時間|Waiting for equipment and test dates
等待實驗室確認接收|Waiting for the lab to confirm receipt
簽名圖片無法讀取，請重新選擇。|Could not read the signature image. Select it again.
簽核完成，委託單已進入 LMS 待審查|Approval complete. The request is awaiting LMS review.
簽核清單|Approval list
簽核與查閱|Approval and acknowledgment
系統內建角色|Built-in role
給實驗室人員使用|For laboratory staff
編輯委託單草稿|Edit request draft
總覽|Overview
至少 12 個字元|At least 12 characters
舊版未綁定設備|Legacy record without linked equipment
舊紀錄未提供簽名|No signature in the legacy record
草稿已在其他頁面更新，請重新開啟後編輯。|This draft changed in another page. Reopen it to edit.
補件|Revision
補件中|Revision in progress
角色與權限|Roles and permissions
設備分類|Equipment category
設備已移除|Equipment removed
設備序號|Equipment serial number
設備或時段重疊，需要確認|Equipment or time overlap requires confirmation
設備編號已存在，請使用獨立編號。|This equipment ID already exists. Use a unique ID.
設備資料已更新，請重新開啟編輯。|This equipment changed. Reopen it to edit.
設備資料無法讀取，請重新載入後再試。|Could not read equipment data. Reload and try again.
設定密碼|Set password
設定尚未儲存，請確認瀏覽器儲存空間。|Settings were not saved. Check browser storage space.
試驗中的決策請由 lv1 主管在編輯排程處理。|A level 1 supervisor handles active-test decisions in Edit schedule.
試驗中，進度 50%；再次按下將完成試驗。|Testing: 50% complete. Press again to complete the test.
試驗已結束，不可儲存排程。|The test has ended; the schedule cannot be saved.
試驗已結束，不可編輯排程。|The test has ended; the schedule cannot be edited.
試驗與設備已恢復，預估結束時間已順延。|Test and equipment resumed. The expected end time was extended.
試驗與設備已暫停。|Test and equipment paused.
試驗規範引用較籠統|Specification reference may be too general
試驗設備狀態|Test equipment status
請先完成電子簽名。|Complete the electronic signature first.
請再次輸入密碼|Re-enter password
請填寫操作原因|Enter the reason for this action
請完成所有必填欄位，並確認借用與歸還日期。|Complete all required fields and check the loan and return dates.
請完整填寫姓名、電子郵件及所屬部門。|Enter the full name, email and department.
請至少填寫一項委託資訊，再儲存草稿。|Enter at least one request field before saving a draft.
請至帳號管理設定部門|Set the department in account management
請補充委託資訊。|Complete the request information.
請補充資料|Additional information required
請說明借用原因、用途或對應試驗案件|Describe the loan reason, purpose or associated test case
請說明其他試驗目的（必填）|Describe the other test purpose (required)
請輸入姓名|Enter name
請輸入客戶名稱|Enter customer name
請輸入有效的電子郵件地址。|Enter a valid email address.
請輸入核准說明或退件補正事項…|Enter approval comments or required revisions…
請輸入電子郵件及密碼。|Enter email and password.
請選擇帳號設定中的直屬主管。|Select the supervisor assigned in account settings.
請選擇試驗項目。|Select a test item.
請重新登入後再操作。|Sign in again before continuing.
變更失敗，請重試。|Change failed. Try again.
變更密碼（選填）|Change password (optional)
資料更新|Data update
輪播|Carousel
退件|Return
退回原因必填。|A return reason is required.
送出|Submit
送出前請先完成委託者簽名。|Complete the requester signature before submitting.
送出日期|Submission date
送出此操作前請先簽名。|Sign before submitting this action.
造隆實驗室系統|COLONG laboratory system
適合資料整理、篩選與後續分析|For organizing, filtering and further analysis
適合閱讀、列印與分享|For reading, printing and sharing
選擇主題|Choose a topic
選擇系統|Choose a system
配件、治具、設備狀況或其他注意事項（選填）|Accessories, fixtures, equipment condition or other notes (optional)
重新送出|Resubmit
開始時間|Start time
關閉 AI 審查結果|Close AI review results
關閉借用申請|Close loan request
關閉排程管理圖表|Close schedule charts
關閉歷史委託|Close request history
關閉歷史排程|Close schedule history
關閉物料狀態變更|Close material status change
關閉物料編輯|Close material editor
關閉狀態變更|Close status change
關閉編輯|Close editor
關閉視窗|Close dialog
關閉訊息|Dismiss message
關閉設備分類|Close equipment category
關閉選單|Close menu
隨機填入會覆蓋目前表單內容與簽名，確定繼續？|Random demo data will replace the current form and signature. Continue?
雙階審查完成，電子委託已更新為待排程。|Both reviews completed. The electronic request is ready for scheduling.
電子信賴性評價委託、設備借出與歸還、提交委託需求。|Electronic reliability evaluation requests, equipment loans and returns.
電子委託功能|Electronic request features
電子委託單系統|Electronic request system
需求日期可能過期|The required date may have passed
需補正|Revision required
驗證計畫|Validation plan
（Demo 預設，請依實際樣品確認）|(Demo default; verify against actual samples)
（使用中不可校驗）|(Calibration is unavailable while in use)
串聯設計需求、風險與驗證，|Connect design requirements, risks and validation,
讓品質從設計開始，|Build quality into design,
讓每個決策有依據。|with evidence for every decision.
把品質考量帶進每一次開發。|and bring quality into every development cycle.
釐清需求|Clarify requirements
辨識風險|Identify risks
驗證設計|Validate designs
整合設備、排程與現場紀錄，|Unite equipment, schedules and lab records,
讓試驗井然有序，|Keep testing organized,
讓結果值得信賴。|and results trustworthy.
讓每一次試驗都有清晰的軌跡。|with traceability for every test.
從線上委託到簽核與報告查閱，|From online requests to approvals and reports,
讓需求清楚傳遞，|Communicate requirements clearly,
讓委託順暢接軌。|and connect requests seamlessly.
讓每個角色掌握下一步。|so everyone knows the next step.
追蹤成果|Track results
釐清適用要求與驗證依據，|Clarify applicable requirements and validation criteria,
掌握法規的方向，|Navigate regulations,
走穩合規的每一步。|and make every compliance step count.
讓產品開發有明確的遵循方向。|with a clear compliance path for product development.
辨識要求|Identify requirements
規劃驗證|Plan validation
串聯試驗數據與問題脈絡，|Connect test data with problem context,
從現象找到線索，|Find clues in observations,
從解析看見答案。|and answers through analysis.
讓每一次解析成為改善的起點。|so every analysis drives improvement.
蒐集證據|Collect evidence
釐清原因|Identify causes
從試驗需求到報告查閱，追蹤每一個關鍵進度。|Track every key step from test requirements to report acknowledgment.
審查需求、安排資源，讓試驗與設備有序運作。|Review requirements and allocate resources for organized lab operations.
接收試驗、掌握設備狀態，完成報告提交。|Receive tests, monitor equipment and submit reports.
產品驗證規劃的未來工作空間。|The future workspace for product validation planning.
日常作業、試驗執行、數據記錄與內部管理功能。|Daily work, test execution, data recording and internal management.
設備管理、試驗排程、設備保養、物料管理與報表分析。|Equipment management, scheduling, maintenance, materials and reports.
排程估算|Schedule estimate
溫度試驗|Temperature tests
溫濕度試驗|Temperature and humidity tests
機械試驗|Mechanical tests
腐蝕試驗|Corrosion tests
防護試驗|Ingress protection tests
電性試驗|Electrical tests
耐候試驗|Weathering tests
量測觀察|Measurement and inspection
台 ·|devices ·
讀取於|Read at
實驗室未接收退回|Returned before lab receipt
排程|schedules
全部設備|All equipment
全部物料|All materials
借出|Loaned
缺料|Out of stock
欄|columns
編輯|Edit
姓名|Name
確認密碼|Confirm password
實驗室工作清單|Lab work queue
實驗室操作歷程|Lab operating history
設備借用申請|Equipment loan requests
實驗室取消／中斷申請|Lab cancellation / interruption requests
設備台帳|Equipment register
物料台帳|Material register
LMS 委託審查|LMS request reviews
電子委託|Electronic requests
共用帳號|Shared accounts
庫存不足|Low stock
依排程開始日期篩選；未設定日期的項目只列於全部日期。|Filter by schedule start date. Undated items appear only under all dates.
罐|cans
盒|boxes
包|packs
組|sets
支|pieces
個來源 ·|sources ·
項異常|errors
主題|Theme
`.trim().split('\n').map(line=>{const separator=line.indexOf('|');return [line.slice(0,separator),line.slice(separator+1)];});
entries.push(
 ['Demo 填入已標記為虛擬委託；重設後可建立真實委託。','Demo fill marks this request as virtual. Reset the form to create a real request.'],['確認虛擬排程','Confirm virtual schedule'],['已接收，可由助理加速','Received · Ask the assistant to accelerate'],['虛擬委託','Virtual request'],['真實委託','Real request'],['委託種類','Request type'],['虛擬委託・實際流程','Virtual request · Native workflow'],['虛擬試驗進度','Virtual trial progress'],['虛擬試驗已完成','Virtual trial completed'],['虛擬試驗進行中','Virtual trial in progress'],['等待加速虛擬試驗','Awaiting virtual acceleration'],['委託種類已固定，不能變更。','The saved request type cannot be changed.'],['僅供流程測試，可由 AI 助理加速試驗；報告標示測試用途。','For workflow testing. The AI assistant can accelerate the trial; reports are marked for testing.'],['依正常排程時間執行。Demo 填入會自動選為虛擬委託。','Runs on the normal schedule. Demo fill automatically selects a virtual request.'],
 ['流程測試加速器','Flow-test accelerator'],['資料庫測試副本','Database rehearsal copy'],['獨立 Demo 展示','Isolated Demo'],
 ['關閉流程測試加速器','Close flow-test accelerator'],['來源案件','Source case'],['請選擇已確認接收的案件','Select a received case'],
 ['重新讀取測試資料','Reload rehearsal data'],['原始工時','Original test hours'],['原排程','Original schedule'],['排程時窗','Scheduled calendar window'],
 ['模擬進度','Simulated progress'],['模擬經過時間','Simulated elapsed time'],['模擬時間','Virtual time'],['實際操作時間','Actual operation time'],
 ['測試原因','Reason for rehearsal'],['建立並標記測試副本','Create and mark rehearsal copy'],['下載流程測試紀錄','Download rehearsal record'],
 ['正在核對並讀取測試資料…','Checking and loading rehearsal data…'],['流程測試｜非正式試驗結果','FLOW TEST | Not an official test result'],
 ['請由工作區管理者先建立測試副本。','Ask a workspace administrator to create a marked rehearsal copy first.'],
 ['目前沒有可讀取且已確認接收的排程，請先完成排程與實驗室接收。','No received schedule is available. Complete scheduling and lab receipt first.'],
 ['僅推進明確標記的測試副本；正式委託、原排程與設備預約不會改變。','Only a marked rehearsal copy advances. Production requests, schedules and equipment reservations remain unchanged.'],
 ['僅操作目前隔離 Demo 的案件，不連接正式資料庫。','Only isolated browser Demo cases are changed; the production database is not used.']
);
export const ENGLISH_UI=Object.fromEntries(entries);
let locale=readUiPreferences().language;
if(typeof window!=='undefined'){
 const refresh=()=>{locale=readUiPreferences().language;};
 window.addEventListener('storage',refresh);window.addEventListener('dqa:ui-preferences',refresh);
}
export function translateText(value,language=locale){
 if(language!=='en'||typeof value!=='string')return value;
 const text=value.trim();
 if(ENGLISH_UI[text])return value.replace(text,ENGLISH_UI[text]);
 const requestCount=text.match(/^共 (\d+) 筆(借用)? · 每頁最多 (\d+) 筆(.*)$/);if(requestCount)return `${requestCount[1]} ${requestCount[2]?'loans':'records'} · Up to ${requestCount[3]} per page${requestCount[4]?' · Due dates and workflow status are shown separately':''}`;
 const page=text.match(/^第\s*(\d+)\s*頁$/);if(page)return `Page ${page[1]}`;
 const rehearsalProgress=text.match(/^推進至 (50|100)%$/);if(rehearsalProgress)return 'Advance to '+rehearsalProgress[1]+'%';
 const rehearsalConfirm=text.match(/^輸入 FLOW TEST (.+)$/);if(rehearsalConfirm)return 'Type FLOW TEST '+rehearsalConfirm[1];
 const count=text.match(/^(\d+)\s*(天|筆|項|件|台|小時|分鐘)$/);if(count)return `${count[1]} ${ENGLISH_UI[count[2]]}`;
 const empty=text.match(/^目前沒有可查閱的(.+)。$/);if(empty)return `No ${translateText(empty[1],language).toLowerCase()} available.`;
 const pageRange=text.match(/^第\s*(\d+)\s*[–-]\s*(\d+)\s*筆，共\s*(\d+)\s*筆$/);if(pageRange)return `Showing ${pageRange[1]}–${pageRange[2]} of ${pageRange[3]}`;
 const total=text.match(/^試驗排程總計 (\d+) 筆$/);if(total)return `${total[1]} total test schedules`;
 const rowCount=text.match(/^(.+) (\d+) 筆$/);if(rowCount&&ENGLISH_UI[rowCount[1]])return `${ENGLISH_UI[rowCount[1]]}: ${rowCount[2]} records`;
 const conflicts=text.match(/^另有 (\d+) 筆排程衝突$/);if(conflicts)return `Another ${conflicts[1]} scheduling conflicts`;
 const reserved=text.match(/^(\d+) 筆已預約、尚未開始$/);if(reserved)return `${reserved[1]} reserved; not yet started`;
 const notices=text.match(/^目前有 (\d+) 項待處理事項$/);if(notices)return `${notices[1]} pending items`;
 const examples=text.match(/^例如：(.*)$/);if(examples)return `Example: ${examples[1]}`;
 const search=text.match(/^搜尋(試驗報告|試驗規範|試驗手冊|報告範本)名稱…$/);if(search)return `Search ${translateText(search[1],language).toLowerCase()}…`;
 const waiting=text.match(/^等待 (\d+) 天$/);if(waiting)return `Waiting ${waiting[1]} days`;
 const tableSummary=text.match(/^顯示 (\d+)／(\d+) 筆(.*)$/);if(tableSummary)return `Showing ${tableSummary[1]} of ${tableSummary[2]} records${tableSummary[3]?': '+translateText(tableSummary[3],language):''}`;
 const safetyStock=text.match(/^低於安全庫存 (\d+) (.+)$/);if(safetyStock)return `Below safety stock: ${safetyStock[1]} ${translateText(safetyStock[2],language)}`;
 const sourceSummary=text.match(/^(\d+) 個來源 · (\d+) 項異常$/);if(sourceSummary)return `${sourceSummary[1]} sources · ${sourceSummary[2]} errors`;
 const categorySummary=text.match(/^(設備|物料) · (\d+) 個分類$/);if(categorySummary)return `${translateText(categorySummary[1],language)} · ${categorySummary[2]} categories`;
 const columnCount=text.match(/^(\d+)／(\d+) 欄$/);if(columnCount)return `${columnCount[1]}/${columnCount[2]} columns`;
 const exportCount=text.match(/^匯出目前篩選結果 · (\d+) 筆$/);if(exportCount)return `Export current results · ${exportCount[1]} records`;
 const reportScope=text.match(/^(.+。) 顯示 (\d+)／(\d+) 筆；匯出包含全部篩選結果，不限目前頁碼。$/);if(reportScope)return `${translateText(reportScope[1],language)} Showing ${reportScope[2]} of ${reportScope[3]} records. Exports include all matching rows across all pages.`;
 const fieldRequired=text.match(/^(.+)(?:為必填|為必填欄位)[。！]?$/);if(fieldRequired&&ENGLISH_UI[fieldRequired[1]])return `${ENGLISH_UI[fieldRequired[1]]} is required.`;
 if(/^[＋+✓↪←⚙⌕]/.test(text)){const mark=text.match(/^([＋+✓↪←⚙⌕]\s*)(.+)$/);if(mark&&ENGLISH_UI[mark[2]])return `${mark[1]}${ENGLISH_UI[mark[2]]}`;}
 return value;
}
