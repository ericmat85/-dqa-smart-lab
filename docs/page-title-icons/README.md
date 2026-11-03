# 頁面標題圖示同步側邊選單

電子委託、LMS、Lab 的主要頁面標題現在直接使用側邊選單共用的 `LmsSidebarIcon` 元件；移除原本一律顯示文件圖示的 CSS 遮罩。圖示維持 22px 寬，跟隨標題深淺色，且不影響標題無障礙名稱。

- 電子委託：總覽、新增／編輯委託單、申請借用（含表單）、我的委託／借用、簽核／查閱、案件歷程、通知中心、資料庫。
- LMS：儀錶板、試驗委託、排程管理、設備管理、物料管理、資料庫、報表分析、帳號管理、系統設定。
- Lab：試驗委託與接收、操作歷程、資料庫。

未改動選單、業務邏輯、表單、資料或權限；未推送、未建立 PR、未部署。

## 修改檔案

`src/RequestApp.jsx`、`src/LabApp.jsx`、`src/LmsApp.jsx`、`src/EquipmentPage.jsx`、`src/MaterialsPage.jsx`、`src/LabReports.jsx`、`src/LabSettings.jsx`、`src/ReportArchive.jsx`、`src/WorkspacePageHeader.css`、`e2e/workspace-controls.spec.js`。

## 本機實際頁面截圖

| 系統 | 淺色 1366×768 | 深色 1366×768 |
|---|---|---|
| 電子委託 | [檢視](request-title-light.png) | [檢視](request-title-dark.png) |
| LMS | [檢視](lms-title-light.png) | [檢視](lms-title-dark.png) |
| Lab | [檢視](lab-title-light.png) | [檢視](lab-title-dark.png) |

截圖來自本機 Production Build 與固定 Demo 資料，非正式站截圖。

## 驗證

- Lint 與 Production Build 通過（既有大型 bundle 提示仍存在）。
- 9 項 Production UI 驗收通過：三系統各選單頁面的 SVG path 比對、移除舊圖示、深淺色、三種桌面尺寸、手機收合及卡片導向。
- 10 項既有 Header／編輯頁導覽回歸通過。
- 本次為圖示呈現調整，未新增單元測試。沒有已知未解決問題；尚未部署至正式站。
