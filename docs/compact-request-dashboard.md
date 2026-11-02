# 工作總覽方塊瘦身

依使用者提供的工作總覽截圖，移除紅框中的「待實驗室安排」與「即將到期」捷徑方塊。主管總覽也不再顯示「即將到期」方塊，保留其原有待簽核、待查閱、已逾期與本月核准項目。

委託者保留五張方塊：「草稿／待送出、待補件、待簽核、執行中、已逾期」。卡片改為約 68px 高的緊湊排版，左側圖示、中央標題與數字、右側箭頭；移除原「查看清單」文字，按鈕仍可點選進入對應集合。

僅調整顯示名稱及捷徑，不更動「待主管簽核」等實際案件狀態、計數規則、日期提醒資料或既有權限。英文介面同步補上新名稱。

## 修改檔案

- `src/RequestWorkspaceUi.jsx`：方塊項目、短標題與箭頭圖示。
- `src/WorkspacePageHeader.css`：緊湊卡片與對齊。
- `src/i18n.mjs`：新顯示名稱翻譯。
- `e2e/request-dashboard-compact.spec.js`：卡片高度、數量、標題、箭頭、篩選及資料不變。
- `e2e/request-workspace.spec.js`：依新顯示名稱操作待補件方塊。

## 畫面與驗證

[桌面淺色](reviews/compact-request-dashboard/dashboard-light-1440.png)／[桌面深色](reviews/compact-request-dashboard/dashboard-dark-1440.png)／[手機淺色](reviews/compact-request-dashboard/dashboard-light-390.png)／[手機深色](reviews/compact-request-dashboard/dashboard-dark-390.png)。畫面使用獨立 Demo 資料，非使用者案件。

新增桌面／手機、深淺色與主管測試 5／5 通過；既有委託回歸 22／22 通過。包含待補件計數、點選後集合路由、案件列數、底層資料相同及頁面不橫向溢出。lint、正式建置與 diff check 通過。

提供預覽驗收，不合併 main。
