# 排程方塊瘦身與儀錶板配色

## 排程管理

五張統計方塊統一為 68px 高、10px×12px 內距、20px 圖示與 30px 底框，沿用其他管理頁的緊湊排列。依用途區分圖示：待排程為時鐘、排程衝突為警示、已排程為確認日曆、試驗中為試驗瓶、設備稼動率為設備管理圖示。

設備稼動率原本的日期文字會撐高整列，現將統計天數及起訖日期改為滑鼠移入或鍵盤 Tab 聚焦時的提示。原數字、計算、系統設定與篩選方式不變，排程卡片不增加箭頭。

## 儀錶板

五張統計方塊的圖示、圖示底框統一主題藍色，不再使用綠／橘／灰圖示。標籤、數字與補充說明統一使用主要文字色：淺色模式為近黑色，深色模式為可讀的淺色文字；沿用原主題機制。捷徑箭頭維持藍色。

## 修改檔案

- `src/ScheduleSummaryIcon.jsx`：五類排程統計圖示，共用現有主題狀態配色。
- `src/LmsApp.jsx`：排程卡片圖示、日期提示及鍵盤聚焦。
- `src/WorkspaceControls.css`：卡片、提示與儀錶板色彩樣式。
- `e2e/schedule-summary-compact.spec.js`、`playwright.workspace-ui.config.js`：新增 Production 驗收。
- `e2e/equipment-activity.spec.js`：維持原稼動率數值驗證，統計期間改由新的提示讀取。

## 驗證

- Lint、Production Build 通過；保留既有 bundle 大小提示。
- 六組 Production 驗收通過：1920×1080、1366×768、390×844 深淺色；檢查五張方塊精確 68px、五種不同圖示、20px 尺寸、日期的鍵盤提示、篩選切換、無水平溢出，以及儀錶板所有標籤／數字／說明與圖示色彩。
- 13 項既有回歸通過，涵蓋稼動率統計區間／數值／儲存、清單操作、儀錶板捷徑與管理頁視覺。
- 沒有已知未解決的本次問題。未修改資料模型、API、權限或業務流程。

## 本機 Production 實際截圖

| 頁面／尺寸 | 淺色 | 深色 |
|---|---|---|
| 排程管理 1920px | [檢視](schedule-compact-1920-light.png) | [檢視](schedule-compact-1920-dark.png) |
| 排程管理 1366px | [檢視](schedule-compact-1366-light.png) | [檢視](schedule-compact-1366-dark.png) |
| 排程管理 390px | [檢視](schedule-compact-390-light.png) | [檢視](schedule-compact-390-dark.png) |
| 儀錶板 1920px | [檢視](dashboard-blue-1920-light.png) | [檢視](dashboard-blue-1920-dark.png) |
| 儀錶板 1366px | [檢視](dashboard-blue-1366-light.png) | [檢視](dashboard-blue-1366-dark.png) |
| 儀錶板 390px | [檢視](dashboard-blue-390-light.png) | [檢視](dashboard-blue-390-dark.png) |

截圖採固定 Demo 資料，非正式營運數字。部分畫面保留鍵盤聚焦外框，以展示鍵盤操作狀態。PR 供確認，未合併 main。
