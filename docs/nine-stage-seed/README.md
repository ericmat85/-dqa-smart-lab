# 九階流程 Demo 資料交付

本機分支：`demo/nine-stage-seed`。未推送、未合併、未部署，未修改線上或正式資料。

## 清除舊案並載入

在電子委託或實驗室系統開啟「Demo 工具」，選擇「清除並重設九階18筆 Demo」。確認後先在記憶體準備完整資料及文件，成功後才替換目前瀏覽器的舊委託單、排程、試驗、借用及報告資料。原帳號、角色、設備及物料台帳保留，解除舊案件占用，另加入專用假帳號及六台假設備。原「僅清空 Demo 案件…」仍保留。

不會在頁面載入時自動清除資料。此功能只操作展示版瀏覽器 localStorage／IndexedDB，沒有新增真實資料庫依賴。準備失敗不清除；寫入失敗還原先前案件與報告；準備期間若資料有變更，取消替換以保留較新資料。

## 初始案件

| 階段 | A 正常流程 | B 異常流程 |
| --- | --- | --- |
| 待簽核 | DEMO-001 | DEMO-002 |
| 待審查 | DEMO-003 | DEMO-004 |
| 待排程 | DEMO-005 | DEMO-006 |
| 待確認 | DEMO-007 | DEMO-008 |
| 試驗中 | DEMO-009 | DEMO-010 |
| 已完成 | DEMO-011 | DEMO-012 |
| 待審核 | DEMO-013 | DEMO-014 |
| 待查閱 | DEMO-015 | DEMO-016 |
| 已結案 | DEMO-017 | DEMO-018 |

每筆具有唯一樣品編號 `SMP-DEMO-001` 至 `SMP-DEMO-018`、假產品與客戶、試驗項目、委託者、指定主管、執行人員及設備。未排程案件記錄預定資源，不假稱已完成排程。日期相對重設當下產生；執行中的案件會依既有生命週期自然推進，再次重設可恢復九階各兩筆。

沿用既有狀態模型：內部「待主管簽核」對應待簽核，「已核准」進入 LMS 待審查；待確認由實驗室接收狀態判斷；電子委託「執行中」對應實驗室試驗中。數量從實際流程與接收狀態推導，不依賴初始階段標籤。

A 組可執行正常流程；B 組用於退回、衝突、取消、中斷與異常報告操作。B 組報告明確記錄 DEMO NG／非正式判定。DEMO-014 已含二階退回再送審歷程，目前待三階審核；DEMO-018 含查閱退回、補正及重新審核歷程。

DEMO-013 待二階主管審核，DEMO-014 待三階主管審核。DEMO-015／016 可由指定委託者主管確認封存，或輸入原因退回報告補正，補正後重新走既有主管報告審核。DEMO-017／018 可下載實際合併的展示 PDF（委託內容及簽核報告）；文件與模擬簽名均明確標示 DEMO，不具正式效力。

## 假帳號

共用展示密碼：`demo1234`。所有信箱均為不可實際投遞的 example.invalid 網域。

| 帳號 | 名稱／角色 |
| --- | --- |
| a@demo.example.invalid | 模擬委託者A |
| b@demo.example.invalid | 模擬委託者B |
| manager@demo.example.invalid | 模擬委託者主管 |
| level1@demo.example.invalid | 模擬一階主管 |
| level2@demo.example.invalid | 模擬二階主管 |
| level3@demo.example.invalid | 模擬三階主管 |
| laba@demo.example.invalid | 模擬執行人A／實驗室工程師 |
| labb@demo.example.invalid | 模擬執行人B／實驗室副工程師 |

原帳號保留；原委託者不會取得新假委託者案件的所有權。保留既有權限、非本人簽核限制及版本檢查，不覆寫自訂角色限制；若對應內建角色已停用或保留 ID 衝突，準備階段會拒絕，避免破壞既有設定。

## 修改檔案

- `src/nineStageSeed.mjs`：18 筆可操作案件、假資源與歷程、Excel／合併 PDF、實際階段統計。
- `src/installNineStageSeed.mjs`：準備、清除替換、併發檢查與失敗還原。
- `src/ClearCasesButton.jsx`：一鍵重設入口與進度。
- `src/reportStore.mjs`：報告及索引的交易式替換。
- `src/reportWorkflow.mjs`：指定主管查閱退回操作。
- `src/ReportUi.jsx`：查閱退回原因及操作。
- `src/demoApprovalSignature.mjs`：精簡展示簽名，避免 18 筆簽核副本超出瀏覽器儲存額度。
- `src/scheduleLifecycle.mjs`：重設期間阻擋舊生命週期寫入、帳號快照交易支援。
- `tests/nineStageSeed.test.mjs`：八項整合測試。
- `e2e/nine-stage-seed.spec.js`、`playwright.nine-stage.config.js`：瀏覽器操作與跨頁同步測試。
- `docs/nine-stage-seed/`：交付說明、重設清單與操作截圖。

## 驗證

- `npm test`：46 個測試檔結果通過，0 失敗。
- `node tests/nineStageSeed.test.mjs`：8 項通過；九階轉換、異常退回、簽核限制、取消／中斷、接收後試驗啟動、PDF、重設、失敗還原及併發修改保護。
- `node --test tests/nineStageSeed.test.mjs tests/reportWorkflow.test.mjs tests/resetCases.test.mjs`：3 個測試檔結果通過。
- Playwright：1 項完整 UI 流程通過；實際點擊清除重設、委託核准及退回、主管報告審核、查閱退回／封存、PDF 下載、第二次重設；同時開啟 LMS／實驗室頁面驗證同步。
- Lint 通過。Production Build 通過；仍有既有大型 bundle 提示。
- E2E 使用 localhost Vite 開發伺服器，並非線上 Production 驗收。
- 重設後實測 18 筆、九階各 2 筆，文字儲存約 1.84 MB。詳見 [seed-manifest.json](seed-manifest.json)。

操作截圖：[查閱退回](readback-return.png)、[已結案展示 PDF](archived-demo-pdf.png)。

## 尚未涵蓋

沒有正式後端簽章或正式文件認證；合併 PDF 與簽名僅供展示。線上資料尚未清除，需在使用此版本的瀏覽器明確執行重設。依本次限制未推送、合併或部署。
