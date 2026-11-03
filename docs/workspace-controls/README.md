# 三系統側欄與儀錶板 UI 同步

本次依 2026-11-03 四點需求調整，僅本機開發，未推送、未建立 PR、未部署。

## 修改內容

- 電子委託、LMS、Lab 共用 Header 展開／收合按鈕，按鈕距側欄右緣 12px；收合後距畫面左緣 12px。保留各系統原有手機選單斷點、導航及鍵盤操作。
- 修正電子委託桌面版 Header 48px、Grid 卻預留 64px 的空隙；工作總覽與 LMS 儀錶板標題同高。
- 電子委託與 LMS 共用緊湊卡片布局：桌面五欄、最小高度 68px、卡片內箭頭靠右下並朝右下，深淺色均使用主題藍色。
- LMS 新增「排程衝突」卡片，讀取既有 `metrics.counts['有衝突']`，點擊開啟既有排程衝突篩選。其餘卡片保留原統計與導向；日期與補充資訊於滑鼠移入或鍵盤聚焦時顯示。
- LMS 沿用電子委託側欄 Logo 容器、位置、選單 40px 高度、5px 間距、14px 字體與 22px 圖示；保留權限控制及全部選單。

## 修改檔案

- `src/WorkspaceMenuToggle.jsx`、`src/useSidebarMobile.js`：共用收合按鈕與響應式狀態。
- `src/WorkspaceDiagonalArrow.jsx`、`src/WorkspaceControls.css`：共用箭頭與限定範圍的視覺樣式。
- `src/RequestApp.jsx`、`src/LabApp.jsx`、`src/LmsApp.jsx`：各系統接入按鈕與側欄狀態。
- `src/WorkspaceSidebarBrand.jsx`：支援 LMS 沿用原有識別 class。
- `src/RequestWorkspaceUi.jsx`、`src/LabPanels.jsx`、`src/LiveDashboard.jsx`：緊湊卡片與衝突捷徑。
- `e2e/workspace-controls.spec.js`：三種桌面尺寸、深淺色、對齊、收合、箭頭、衝突導向及手機導航。
- `e2e/compact-lms-workspace.spec.js`：同步卡片數量與高度驗收值；其餘驗證維持。
- `playwright.workspace-ui.config.js`：獨立開發／Production 測試連接埠，避免影響其他工作樹。

## 邊界

此分支建立於先前尚未推送的 Lab V2 工作樹 commit `64fa1c1`，保留其已完成修改；未納入另一個未合併的 LMS Dashboard Phase 1 分支。未修改資料模型、API、權限、帳號、驗證、草稿、簽核或排程判定。

實際截圖使用本機 Production Build 與固定 Demo 資料，並非正式站截圖；數字依測試資料而異。遠端 Preview 需推送，因此本次不提供遠端 Preview URL。

## Production Build 實際截圖

| 系統 | 1920×1080 淺色 | 1920×1080 深色 | 1366×768 淺色 | 1366×768 深色 |
|---|---|---|---|---|
| 電子委託 | [檢視](request-1920-light.png) | [檢視](request-1920-dark.png) | [檢視](request-1366-light.png) | [檢視](request-1366-dark.png) |
| LMS | [檢視](lms-1920-light.png) | [檢視](lms-1920-dark.png) | [檢視](lms-1366-light.png) | [檢視](lms-1366-dark.png) |
| Lab | [檢視](lab-1920-light.png) | [檢視](lab-1920-dark.png) | [檢視](lab-1366-light.png) | [檢視](lab-1366-dark.png) |

## 驗證結果

- `npm test`：43 項通過。
- `npm run lint`：通過。
- `npm run build`：通過；仍有既有 bundle 大小提示，本次未擴大調整打包策略。
- Production Build：51 項通過（44 項既有跨系統驗收＋7 項本次新增驗收）。
- UI 回歸：28 項側欄、Header、Request 卡片與編輯步驟、LMS 視覺操作通過；6 項 LMS 緊湊頁面測試在修正卡片數量／高度驗收值後重跑全部通過。涵蓋清單、搜尋、分類鍵盤操作、審查視窗、歷史委託與資料保持。
- 1920×1080、1600×900、1366×768 均驗證深淺色；390×844 驗證三系統手機選單導航。
- 無已知未解決的本次功能問題。未驗證正式站部署；依使用者要求未推送或建立 PR。

分支：`ui/unified-workspace-controls`。檢查紀錄保留於本工作樹 `work/workspace-controls-production.log`、`work/workspace-controls-regression.log`、`work/workspace-controls-lms-final.log`。後兩份合計覆蓋 34 項既有 UI 回歸；第一次測試仍載入更新前的分類頁籤預期值，因此 6 項曾失敗，修正後獨立重跑通過。

## 2026-11-03 交付狀態更新

使用者已授權推送並建立 PR；本文件上方「未推送／未建立 PR」為先前本機驗收階段的紀錄。此分支現提交 PR 供審查，尚未合併 main。另已將 LMS 麵包屑名稱改為「實驗室管理系統」，同步更新相關 E2E 驗收文字。
