# 設備與物料狀態圖示

統計方塊依狀態使用不同的主題化線條圖示，保留原 20px 圖示、30px 底框、卡片布局與藍色選取外框。側欄與頁面主標題仍維持同一圖示。

| 狀態 | 圖示 |
|---|---|
| 設備總數／物料品項 | 原設備監控／物料箱圖示 |
| 使用中 | 波形監測 |
| 待機中 | 電源 |
| 可用 | 圓形勾選 |
| 維護中 | 工具扳手 |
| 校驗中 | 校驗儀表 |
| 暫停中 | 圓形暫停 |
| 借用／借出 | 人員與物品 |
| 缺料 | 三角警示 |
| 停用 | 圓形停用 |

配色採低彩度藍、綠、琥珀、紫、靛藍、紅與中性色；深色模式使用相應深底與較亮線條。圖示不使用捷徑箭頭，也不只靠顏色區分狀態。

## 修改檔案

- `src/InventorySummaryIcon.jsx`、`src/InventorySummaryIcon.css`：共用狀態圖示與雙主題配色。
- `src/EquipmentPage.jsx`、`src/MaterialsPage.jsx`：統計卡片接入狀態圖示；原數量與篩選操作不變。
- `e2e/inventory-summary-icons.spec.js`、`playwright.workspace-ui.config.js`：Production 驗收。

## 驗證

- Lint、Production Build 通過；仍有既有 bundle 大小提示。
- 6 項 Production 圖示驗收通過，覆蓋 1920×1080、1366×768、390×844 深淺色。
- 驗證設備 7 種、物料 8 種卡片圖示在各頁不重複；圖示與底色對比至少 3:1、尺寸一致、無捷徑箭頭。
- 逐一驗證所有狀態卡片的選取、下拉選單與清單筆數一致，原庫存／設備資料不變，無水平溢出。
- 8 項既有視覺及物料借用／歸還／庫存保護回歸通過。

## 本機 Production 實際截圖

| 頁面／尺寸 | 淺色 | 深色 |
|---|---|---|
| 設備 1920px | [檢視](equipment-icons-1920-light.png) | [檢視](equipment-icons-1920-dark.png) |
| 設備 1366px | [檢視](equipment-icons-1366-light.png) | [檢視](equipment-icons-1366-dark.png) |
| 設備 390px | [檢視](equipment-icons-390-light.png) | [檢視](equipment-icons-390-dark.png) |
| 物料 1920px | [檢視](materials-icons-1920-light.png) | [檢視](materials-icons-1920-dark.png) |
| 物料 1366px | [檢視](materials-icons-1366-light.png) | [檢視](materials-icons-1366-dark.png) |
| 物料 390px | [檢視](materials-icons-390-light.png) | [檢視](materials-icons-390-dark.png) |

截圖使用固定 Demo 資料，非正式營運數字。本次不修改業務流程、資料、權限或功能。PR 供確認，未合併 main。
