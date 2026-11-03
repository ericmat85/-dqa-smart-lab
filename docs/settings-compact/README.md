# 系統設定：緊湊企業藍色介面

以原系統設定頁為範圍重整布局，保留現有功能與設定機制。

- 資料概況由四條大型直列改成單一四欄摘要列；小螢幕改為兩欄。呈現來源數、讀取異常、工作提醒與資料大小，使用主題藍色線條圖示。
- 五個設定區塊保留原生展開／收合與鍵盤操作，加入藍色圖示、標題、精簡說明及開啟狀態；預設展開介面外觀。
- 欄位高度統一 36px、按鈕最小 32px，縮小表單間距與內層留白。資料來源表格與規則說明同步精簡。
- 保留字體大小、語言、稼動率起始日期／天數、偏好儲存／還原、來源健檢、工作提醒、每頁筆數、資料說明與回到首頁。
- 深色模式沿用既有主題變數；Logo、側欄、Header、資料與權限均不變。

## 修改檔案

`src/LabSettings.jsx`、`src/SettingsCompact.css`、`e2e/settings-compact.spec.js`、`playwright.workspace-ui.config.js`。

## 本機 Production 實際截圖

| 尺寸 | 淺色 | 深色 |
|---|---|---|
| 1920×1080 | [檢視](settings-1920-light.png) | [檢視](settings-1920-dark.png) |
| 1366×768 | [檢視](settings-1366-light.png) | [檢視](settings-1366-dark.png) |
| 390×844 | [檢視](settings-390-light.png) | [檢視](settings-390-dark.png) |
| 展開稼動率設定 1366×768 | [檢視](settings-activity-light.png) | [檢視](settings-activity-dark.png) |

截圖採固定 Demo 資料，非正式營運數字。PR 供使用者確認，未合併 main。

## 驗證

- Lint、Production Build 通過；保留既有 bundle 大小提示。
- 六組 Production 驗收通過：1920×1080、1366×768、390×844 深淺色。驗證摘要列布局、五個原生收合區塊、36px 欄位、字體／語言／分頁偏好、重新檢查、稼動率儲存與重載、資料來源跳轉、回首頁及業務資料保持。
- 17 項既有回歸覆蓋通過：稼動率、管理頁／報表、帳號、跨系統字體／語言／分頁與圖表操作。跨系統偏好測試已改用目前的設備狀態方塊，取代先前移除的下拉選單，獨立重跑通過。
- `e2e/preferences-and-chart.spec.js` 因上述操作方式同步而更新。
- 開發模式語言切換測試仍輸出 React static-children console 診斷；操作測試及 Production 驗收通過，本次未擴大修改 React／翻譯整合。

未修改設定資料模型、儲存機制、權限或業務流程。等待使用者確認 Preview，不合併 main。
