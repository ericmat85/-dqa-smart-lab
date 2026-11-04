# 機器人九階產品導覽

入口：首頁「機器人九階導覽」，或任一既有 AI 智能助理內的同名連結。路徑 `/tour`。

沿用 EnterpriseBotIcon，提供逐階解說、目前角色、重點框線、手動示範、已完成階段回看、自動導覽（每階閱讀 12 秒）、暫停、重新開始及離開。桌面使用流程／案件／助理三欄，手機將助理及階段導覽移到內容上方。支援深淺色及鍵盤操作。

## 真正執行的展示流程

單一虛構案件 `TOUR-DEMO-001`，從待簽核依序進入待審查、待排程、待確認、試驗中、已完成、待審核、待查閱、已結案。

導覽呼叫原有 `reviewRequesterDecision`、`reviewElectronicRequest`、`validateSchedule`、`confirmLabReceipt`、`syncScheduleLifecycle`、`completeLabTrial`、`submitReportWorkflow`、`approveReportWorkflow`、`confirmReportViewed`。二階及三階報告主管使用不同虛構帳號，未放寬既有禁止自審及簽核檢查。

使用獨立記憶體 storage 及 report repository，沒有接管真實登入或寫入業務 localStorage／IndexedDB。沿用既有 idle session 活動記錄機制。重新整理會重新開始；離開後釋放導覽文件 URL。回看是唯讀歷史快照，不會撤回或重做簽核。操作中阻擋重複點擊；失敗會回復該步驟的私有資料並允許重試。

第八階確認前沒有結案 PDF；第九階透過既有轉換及合併功能產生含委託單和簽名報告的 PDF，可預覽／下載。文件及圖片簽名均為 Demo，無正式效力。PDF 使用專案既有本機字型，不呼叫外部 AI／後端服務。

本次是正常九階流程的獨立展示畫面，非以實際登入帳號跨系統代辦。退回、取消、中斷等規則沒有修改；導覽文案解釋其用途，沒有加入導覽用權限豁免。

## 驗證（2026-11-04）

- `npm run lint`、`git diff --check`、`npm run build` 通過。保留既有大型 bundle 警告。
- `npm test`：48 個測試檔通過，0 失敗。
- productTour 單元測試：九階真實轉換、接收／執行狀態、不同報告審核人、PDF header、失敗回復及重試通過。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- e2e/product-tour.spec.js e2e/lms-assistant-interactions.spec.js e2e/lab-enterprise.spec.js --reporter=line`：14/14 通過。
- 覆蓋 1366／390、深淺色、九階結案、回看、重設、離開、下載及預覽、自動導覽暫停與繼續、重新整理、字型載入失敗後重試、現有助理入口及原資料／登入身分保留。
- PDF 轉換耗時會隨機器負載變化；驗證等待實際狀態完成，不以固定延遲當成成功。
- 已檢視桌面與手機截圖。未執行完整全部 E2E、未驗證線上部署或非 Chromium 瀏覽器。

本機測試基線是從 PR42 程式恢復的工作樹；發布分支已以最新 main 為父提交，只帶入本次指定導覽檔案，未覆蓋遠端歷史。未合併或手動部署。

## 開發範圍更新

依使用者最新指示，後續只開發與驗證電腦版，不再追加手機功能。本次已完成的基本手機適配保留。此次發布自最新 main 建立分支，僅包含本導覽檔案；未合併或手動部署。
