# 系統管理整合第一階段（本機）

## 基線與授權範圍

2026-11-23 核實 origin 為 `https://github.com/ericmat85/-dqa-smart-lab.git`，main `df2ee6f15aaa7feef9fb0a7ea5fa794bb4c768b8`；#47 開啟、未合併，head `a8537a92eb45634a082e21e4a1b66ea930a7b182`。main 缺少 AdminCenterModule/AdminCenterCards、adminOperations 與 business handler，故使用精確 #47 SHA 開獨立本機 `local/admin-integration-20261123`，不修改來源分支。未推送、合併、部署、存取雲端資料庫、Preview 或正式站。

本 checkout 與 /workspace 未找到適用 AGENTS.md 或 .agents/skills。讀取 database/README.md、migration history 說明、現有測試與 Supabase skill；參閱官方 functions 文件與 changelog。既有 repo 採用 001–031 SQL journal。嘗試隔離目錄的 Supabase CLI migration new 未成功（npm 初次 cache 唯讀、改 workspace cache 後 CLI 安裝 exit 1），因此依使用者要求的版本化可回滾與現有 repository 命名交付 032；未呼叫雲端 CLI/MCP。

圖片需求採父任務逐張實際檢視的摘要。本執行緒未另取圖，未宣稱重看原圖；repo 不含截圖或截圖種子資料。

## 實作及資料契約

- 同一個 `dqa_business.settings`、module `workspace_profile_v1` 保存顯示名稱、顯示日期／時區與實驗室資訊，未另建組織表。Cloud 模式移除瀏覽器組織名稱編輯／摘要入口；Demo 模式保留原有本機名稱編輯流程，明確不作為 Cloud 共用資料。部門、成員與設備據點仍沿用原來源。
- 未設定時讀取既有 tenants.name 作為工作區顯示名稱預設，日期 YYYY/MM/DD、Asia/Taipei，其他欄位空白；讀取不插入資料。不改 tenants.name/時區或工作區 ID，顯示名稱是可選顯示覆寫，不能改變工作區身分。
- GET `/api/business/access?section=profile`；POST `/api/business/access` 的 action `save_profile`、configuration、expected_revision。租戶取自加密 Session，不接受 browser tenant/actor/role。沿用 cookie、same-origin、session validation、refresh 與 user JWT RPC，無 service-role。
- RPC 先驗證既有成員，寫入再驗證管理員；鎖定同租戶設定、檢查修訂號，避免併發覆寫。固定 schema、字數、日期格式、時區與聯絡資料檢查同時存在 server 與 SQL。主管欄不影響授權。設定表原觸發器提供修訂號與最小欄位稽核，不寫設定內容至 log。
- UI 不以 localStorage 假裝共享保存。未連線僅告知未連線，讀取失敗不覆寫空預設；儲存結果不明時清除可重送狀態，要求重入讀回，不自動重送。取消只丟棄未儲存草稿。每次重入與重新登入取服務端設定。
- 日期格式／時區僅作用於新增設定更新日期與合成預覽，既有各頁日期顯示與排程計算尚未整體套用；不寫時間或改既有編碼。套件版本 0.0.0 唯讀，非臆造產品發行號。
- 文件頁的合成稿 v1 直接使用同份實驗室抬頭；強調色／頁尾只在當頁記憶體，無外部 URL 圖片、SVG、下載、正式報告變更或預填認證。正式新草稿的明確採用、快照與版本封存是下一階段，不把預覽當成已採用範本。

## 分類矩陣

| 參考 | 分類 → 原頁 | 狀態 | 實際來源／限制 |
|---|---|---|---|
|654|一般 → 試驗與設備參數|已接|settings.workspace_profile_v1，顯示名稱／日期／時區；版本 package.json 唯讀|
|654|貨幣／樣本前綴／引導開關|待做|尚未確認共用消費者，不加無作用開關|
|654|Session／密碼週期 → 資訊安全|唯讀|既有 business session 與安全政策，不改登入|
|655|實驗室資訊 → 組織與租戶|已接|同份 workspace_profile_v1；聯絡資訊及選填識別／主管|
|656|報告品牌 → 文件與報告|合成預覽|共享抬頭，當頁強調色／頁尾；標誌安全上傳與正式新範本採用待做|
|657|委託／報告待審、排程、開始／完成、退回 → 通知|唯讀現況|migration 020 request/report status triggers、BusinessNotificationDelivery；不改觸發／模板／收件人|
|657|設備校正／低庫存／品質／資格／維護／SOP|待做寄送連動|有各自業務資料，尚未確認對應共用郵件事件；無新開關|
|657|每日摘要／發票提醒|待做|沒有事件服務；帳號驗證信為獨立流程|
|658|SMTP → 介面／通知|唯讀|沿用通知服務查詢，這次不寄信或測連線|
|658|儀器匯入 → 介面|部分實作摘要|equipment_ports/points 有設定；通用儀器匯入待做|
|658|ERP／客戶入口 API／條碼 QR → 介面|待做|未新增 API、連線、金鑰或傳輸|
|658|外部 AI → AI 引擎|既有頁|原四引擎與狀態，不發模型請求|
|658|備份目的地 → 備份／資料維護|待做|JSON 管理設定匯出不是資料庫備份，不灌 Demo|
|659|安全／合規 → 安全、九階流程|唯讀|原 audit_events、WORKFLOW_RULES；不宣稱 Part 11／ISO 合規|
|660|品質保證 → 品質／資格／文件|唯讀|既有 quality_records、qualifications、文件範本；不啟動 OOS，不改 QA 發行或保留資料|
|661|發票 → 商業功能路線圖|待做|不新增開票／付款阻擋；平台訂閱不代表客戶帳款|
|初始化|OOBE 對接|契約|此基線無 OOBE，不合併其他分支；見下節|

矩陣以原 14 模組的小區呈現相關現況，沿用既有 AdminCenterCards/Nav，無新增選單。661 留在路線圖，不新增商業頁。

## OOBE 對接契約

未來已驗證首位管理員經原登入／工作區機制，可呼叫同一 GET/POST profile API；以 can_manage 判定顯示編輯、expected_revision 避免覆寫，不建立另一套組織資料。缺少選填欄不得封鎖已完成工作區，不變更首次驗證／登入／初始化完成旗標。方法、設備、儲位與流程只導向現有權威頁。跨分支接入需另核對 OOBE 版本及原驗證狀態，不能假設已合併。

## 本機重播與回滾

Python 3.12.14（沿用 render-backend/.python-version）；這些腳本只用標準庫，未改 requirements 或 CI。以 `uv run --python 3.12.14 --no-project python database/tools/prepare_profile_local.py --directory <全新 worktree 外目錄>` 建立 network=none、無 host ports 的 PostgreSQL 17 容器，套用 001–032 與兩合成租戶，補測試平台 Storage/verified Auth 替身。不得用此腳本或測試 seed 操作雲端。

針對既有資料庫部署仍需另案授權與基線核對；此交付未部署。032 只新增兩 RPC，不改舊函式或 schema。回滾先退回 UI/API 版本，再使用 database/rollback/032_workspace_profile.sql 移除新函式，保留 profile 資料與稽核以供恢復；不刪使用者設定。migration journal 的遠端管理不在本次範圍。

資料層參考：[Supabase Database Functions](https://supabase.com/docs/guides/database/functions)、[官方 Changelog](https://supabase.com/changelog.md)。沒有使用新 SDK／CLI 介接；沿用 repo 既有 user-JWT RPC 架構。032 是此獨立分支的序號，未來與其他未合併分支整合前必須核對 migration 順序，不能直接覆蓋其他分支同號檔。
