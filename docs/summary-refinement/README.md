# 方塊、細框、AI 助理與主題圖示精修

依 PR #39 Preview 的七點回饋調整，保留既有資料與互動。

1. LMS 儀錶板「設備稼動率」沿用側欄設備管理 SVG。
2. LMS 與 Lab 方塊圖示統一 20px、底框 30px，與電子委託總覽一致。
3. 試驗委託搜尋區移除外層工具列邊線，保留輸入欄位本身。
4. 排程、設備、物料等頁面移除內層頁面容器、分類容器、搜尋工具列與表格容器的重複邊線。保留表單邊框、表格列分隔與鍵盤焦點。
5. LMS 排程、設備、物料、報表、帳號統計及 Lab 試驗委託與接收統一緊湊方塊：8px 圓角、10px×12px 內距、12px 標籤、22px 數字、最小高度 68px。一般統計方塊不增加箭頭；儀錶板與工作總覽原有捷徑箭頭保留。卡片原有篩選與資料計算不變。
6. AI 智能助理標題列改為企業藍，標題與收合按鈕白色，副標淺藍；其餘文字沿用深淺色主題。
7. 全系統 SVG／文字太陽圖示改暖金色，涵蓋工作區與登入頁；不變更主題切換機制。

## 修改檔案

- `src/WorkspaceControls.css`：方塊、內層框架、AI 助理樣式。
- `src/LiveDashboard.jsx`：設備稼動率圖示。
- `src/EquipmentPage.jsx`、`src/MaterialsPage.jsx`、`src/LabReports.jsx`、`src/LmsApp.jsx`：一般統計方塊使用既有圖示元件。
- `src/EnterpriseLoginLayout.jsx`、`src/SystemHeaderActions.jsx`、`src/EnterpriseLogin.css`：太陽圖示樣式標記與全系統色彩。
- `e2e/workspace-controls.spec.js`：六組深淺色／尺寸驗收，逐頁檢查框架、尺寸與色彩。
- `e2e/lms-visual-refinement.spec.js`、`e2e/lab-dashboard-v2.spec.js`：同步此次已授權變更的工具列外框與 Lab 方塊尺寸預期。

未修改 API、模型、權限、排程判定、簽核或 AI 回答功能。PR 更新供審查，不合併 main。

## Production Build 實際截圖（1366×768）

| 頁面 | 淺色 | 深色 |
|---|---|---|
| LMS 儀錶板 | [檢視](dashboard-light.png) | [檢視](dashboard-dark.png) |
| 試驗委託搜尋區 | [檢視](requests-light.png) | [檢視](requests-dark.png) |
| 排程管理 | [檢視](schedule-light.png) | [檢視](schedule-dark.png) |
| 設備管理 | [檢視](equipment-light.png) | [檢視](equipment-dark.png) |
| 物料管理 | [檢視](materials-light.png) | [檢視](materials-dark.png) |
| AI 智能助理 | [檢視](assistant-light.png) | [檢視](assistant-dark.png) |
| Lab 試驗委託與接收 | [檢視](lab-summary-light.png) | [檢視](lab-summary-dark.png) |

本機 Production Build 搭配固定 Demo 資料的瀏覽器截圖，非正式站截圖。

## 驗證結果

- Lint、Production Build 通過；保留既有 bundle 大小提示。
- Production 跨系統與 UI 驗收 59 項通過：含 44 項既有驗收、9 項側欄／卡片／標題圖示驗收與 6 項本次精修驗收。
- 17 項既有 LMS 清單、管理頁篩選、AI 助理位置／拖曳／回覆與視覺操作回歸通過。
- Lab 7 項接收、取消申請、資料保持與六組桌面深淺色驗收通過。原測試採舊版 90–110px／16px 內距預期，已依本次需求同步為 68–84px／10px×12px，再完整重跑通過。
- 最後補正 Lab 深色圖示的既有灰色覆蓋規則，並重跑六組精修驗收與更新截圖。
- 涵蓋 1920×1080、1600×900、1366×768、390×844；深淺色、手機導航與無水平溢出。

沒有已知未解決的本次功能問題。仍待使用者確認 Preview；未合併 main、未直接修改正式站部署。
