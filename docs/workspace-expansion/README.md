# 實驗室功能擴充與 LMS 工作區改版

本次依使用者清單實作，並依已確認的權限解釋：**保留既有帳號管理入口權限，由具權限的管理者編輯所有角色項目，包含內建角色**。未開放所有登入者管理帳號或角色。

## 實驗室系統

| 需求 | 實作 |
|---|---|
| AI 智能助理 | 加入共用助理與藍色視窗；實驗室概況／進行中數量讀取目前工作清單，設備問題會說明唯讀限制與授權管理流程。 |
| 物料管理與側欄 | 新增物料管理入口，沿用庫存、查閱、新增／編輯、狀態變更與既有借還規則。 |
| 試驗委託命名 | 側欄、頁面標題與麵包屑改為「試驗委託」。 |
| 資料庫 | 頁籤移近頁面標題、縮小搜尋與列表間距；保留四分類、範本與授權封存報告功能。 |
| 列表緊湊化 | 試驗、操作歷程、資料庫與共用物料列表縮小內距、按鈕與說明行距。 |
| 唯讀設備狀態 | 新增側欄「設備狀態」；可搜尋、篩選、查看規格／保養／歷程，不提供新增、編輯、狀態變更；唯讀元件不寫回設備資料。 |
| 方塊說明、箭頭、逾期 | 五張 68px 方塊，加入藍色右下箭頭與 hover／鍵盤說明；點擊篩選、再次點擊返回全部。新增「已逾期」。 |

逾期以**台灣日期**判定：最新對應排程預計完成日（無對應排程時採工作項目的預計完成日）早於今天，且委託尚未完成／結案／取消／終止。無效日期不推算；只篩選，不更改試驗狀態。

## LMS

- 報表顯示／匯出設定核取方塊使用藍色，縮小展開區塊內距。
- 排程搜尋新增「清除篩選」，清空搜尋並取消狀態篩選；與設備／物料共用同一放大鏡 SVG。
- 歷史委託、歷史排程、排程管理圖表改為**真正的瀏覽器新分頁**，保留原查詢、表格、圖表及任務操作。路徑：
  - `/lms/requests/history`
  - `/lms/schedule/history`
  - `/lms/schedule/chart`
- 新分頁使用一般頁面區塊，不顯示背景遮罩或 `dialog`；麵包屑顯示「實驗室管理系統 › 排程管理／試驗委託 › 子頁面」。相同網站的新分頁沿用原登入階段。
- 分類頁籤上的圖示背景透明；LMS 設備管理預設「使用中」、物料管理預設「可用」。實驗室唯讀設備頁預設顯示全部。
- 帳號頁改緊湊表格及 36px 表單控件；新增／編輯使用原生浮動對話框，說明文字直接展開。
- 新增帳號刪除確認；不允許刪除目前登入帳號，仍有主管指派關係時需先調整關係。既有操作歷史不刪除。
- 角色頁改表格，顯示角色名稱、權限等級、人數、系統入口、功能及帳號管理權限；內建／自訂角色均可編輯，保留建立新角色。
- 內建角色覆寫另存，不改寫角色名稱或既有帳號關聯；設定可跨頁面、重新整理與同站分頁更新。簽核階段、自簽限制及登入守衛仍保留。
- 三系統自動登出視窗確認按鈕統一藍色。

## 關鍵修改檔案

- `src/LabApp.jsx`、`src/LabWorkspaceExpansion.css`、`src/labRequestFilters.mjs`：Lab 入口、唯讀頁、KPI 與逾期。
- `src/EquipmentPage.jsx`、`src/MaterialsPage.jsx`、`src/useDemoPersistence.js`：唯讀保護與初始篩選。
- `src/LmsApp.jsx`、`src/WorkspaceExpansion.css`、`src/CompactDialog.jsx`：新分頁、麵包屑、帳號 CRUD 與布局。
- `src/ScheduleViews.jsx`、`src/CatalogSearchToolbar.jsx`：共用搜尋及清除。
- `src/RoleSettings.jsx`、`src/customRoles.mjs`、`src/demoPermissions.mjs`、`src/accountManagement.mjs`、`src/useLabSnapshot.js`：角色編輯、授權入口、刪除保護與即時更新。
- `src/IntelligentAssistant.jsx`、`src/assistantDemo.mjs`：Lab 情境回答與現有功能說明同步。
- `tests/workspaceExpansion.test.mjs`、`e2e/workspace-expansion.spec.js`：邊界與實際工作流程驗收；既有測試同步更新命名、新分頁、預設篩選與角色操作。

沿用本機 Demo 資料與登入架構，未新增後端服務；未修改委託、排程、簽核資料欄位結構。內建角色設定屬本次明確授權的行為變更。

## 驗證結果

- Lint 與 Production Build 通過（保留既有 bundle 大小提示）。
- 全部單元測試檔案結果 **44 通過、0 失敗**，包含新增的逾期日期、角色入口／審查等級、自簽限制、刪除保護及 Lab 助理來源測試。
- 完整 Production 驗收 99 項執行：98 項直接通過；1 項舊歷史物料情境需依新「可用」預設先清除篩選，更新後納入最終驗收重跑通過。另新增手機角色編輯情境。
- 最終 11 項 Production 驗收全部通過，含六組 Lab 桌面／手機深淺色、兩組 LMS 新分頁／表單／角色、完整帳號 CRUD、手機角色頁及歷史物料。
- 最後針對帳號／角色 36px 控件與介面截圖重跑 3 項，全部通過。
- 既有流程回歸 34 項覆蓋通過；圖表 hover 測試改用新分頁自己的滑鼠事件後獨立重跑通過。
- 三系統自動登出／重新登入與藍色確認按鈕 9 項全部通過。
- 覆蓋 1920×1080、1600×900、1366×768、390×844，以及既有小螢幕與英文化流程。

既有開發模式語言切換的 React static-children 診斷記錄保留於先前文件；本次未擴大修改翻譯／React 整合。沒有已知阻擋本次需求的未完成項目。

## 實際截圖

所有圖片來自本機 Production Build 與固定 Demo 資料，非正式營運數字。

| Lab | 淺色 | 深色 |
|---|---|---|
| 試驗委託 1920px | [檢視](lab-expansion-1920-light.png) | [檢視](lab-expansion-1920-dark.png) |
| 試驗委託 1366px | [檢視](lab-expansion-1366-light.png) | [檢視](lab-expansion-1366-dark.png) |
| 試驗委託 390px | [檢視](lab-expansion-390-light.png) | [檢視](lab-expansion-390-dark.png) |
| 唯讀設備 1366px | [檢視](lab-equipment-light.png) | [檢視](lab-equipment-dark.png) |

- [Lab AI 助理](lab-assistant.png) · [Lab 物料管理](lab-materials.png) · [Lab 資料庫](lab-archive.png)
- [歷史委託新分頁](request-history-page.png) · [歷史排程新分頁](schedule-history-page.png) · [排程圖表新分頁](schedule-chart-page.png)
- [LMS 設備預設](lms-equipment-light.png) · [LMS 物料預設](lms-materials-light.png)
- [帳號清單](accounts-compact.png) · [新增帳號](new-account-dialog.png) · [編輯帳號](edit-account-dialog.png)
- [角色列表](roles-compact.png) · [角色編輯](role-editor.png) · [手機角色頁](roles-mobile-dark.png)

更新既有 PR #39 供確認，未合併 main、未直接修改正式站部署。
