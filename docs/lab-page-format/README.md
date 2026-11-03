# 實驗室物料、設備與資料庫格式

- 物料管理／設備狀態改為與LMS相同的共用目錄版型：標題移入框內，移除框外重複標題與實驗室專用樣式覆蓋。
- 兩個目錄頁使用LMS的框內標題、統計方塊、頁籤、搜尋與列表內距；資料庫保留前版12px內距，三頁使用企業藍色與深淺色主題。
- 目錄表格同步LMS的無額外外框、水平分隔線、字體與列內距；資料庫維持既有細框。
- 物料新增／狀態操作列隨LMS版型排列；設備標題仍為「設備狀態」並保持唯讀，不開放變更屬性或狀態。兩頁Demo工具移至內容下方，避免遮擋操作。
- 實驗室資料庫使用同樣的36px放大鏡搜尋欄，加入清除搜尋；報告權限、範本下載不變。
- 修正資料庫側欄按鈕的active class運算，避免錯誤的React元素被當作className。

## 驗證

Lint、Production Build通過；既有實驗室流程六項Production E2E（1920／1366／390，深淺色）通過。涵蓋KPI、AI、設備唯讀及資料不變、物料新增視窗、資料庫頁籤、搜尋清除與範本下載連結，無水平溢出及頁面錯誤。

實際本機瀏覽器截圖（Demo資料）：

| 畫面 | 1920淺色／深色 | 1366淺色／深色 | 手機淺色／深色 |
| --- | --- | --- | --- |
| 設備狀態 | [淺色](lab-format-equipment-1920-light.png) · [深色](lab-format-equipment-1920-dark.png) | [淺色](lab-format-equipment-1366-light.png) · [深色](lab-format-equipment-1366-dark.png) | [淺色](lab-format-equipment-390-light.png) · [深色](lab-format-equipment-390-dark.png) |
| 物料管理 | [淺色](lab-format-materials-1920-light.png) · [深色](lab-format-materials-1920-dark.png) | [淺色](lab-format-materials-1366-light.png) · [深色](lab-format-materials-1366-dark.png) | [淺色](lab-format-materials-390-light.png) · [深色](lab-format-materials-390-dark.png) |
| 資料庫 | [淺色](lab-format-archive-1920-light.png) · [深色](lab-format-archive-1920-dark.png) | [淺色](lab-format-archive-1366-light.png) · [深色](lab-format-archive-1366-dark.png) | [淺色](lab-format-archive-390-light.png) · [深色](lab-format-archive-390-dark.png) |

更新既有PR #39供檢視，未合併main，未直接變更正式部署。
