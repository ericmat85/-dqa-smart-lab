# 設備／物料精簡搜尋與欄位

## 調整

- 移除「設備總數」「物料品項」以及物料的「維護中」方塊，兩頁各保留六張狀態方塊。設備仍保留原維護功能。
- 移除搜尋列的「全部分類」「全部狀態」下拉選單，改用與排程管理相同的單一搜尋欄，可搜尋編號、名稱、分類、型號、序號、位置、負責人及狀態。
- 狀態方塊可再次點擊取消；「清除篩選」同時清空搜尋與狀態，回到全部資料。「全部／依分類」頁籤與分類分組仍可使用。
- 輸入及選擇欄位縮為 36px，操作按鈕最小 32px，表格縮小內距與型號說明行距；新增／編輯表單同步套用。多行說明欄仍保留足夠高度。
- 物料不再提供「維護中」作為可設定狀態。新 Demo 台帳中原維護示範物料改為停用；既有儲存的資料與操作歷史不自動改寫，歷史維護物料仍可查閱並改為有效狀態，庫存數量不變。

## 修改檔案

`src/CatalogSearchToolbar.jsx`、`src/CatalogCompact.css`、`src/EquipmentPage.jsx`、`src/MaterialsPage.jsx`、`src/demoMaterials.mjs`、`tests/materials.test.mjs`、`e2e/catalog-compact.spec.js`、`e2e/inventory-summary-icons.spec.js`、`playwright.workspace-ui.config.js`。

## 驗證

- Lint、Production Build 通過；仍有既有 bundle 大小提示。
- 現有單元測試執行通過（43 項測試檔案結果）；新增物料維護停用／歷史紀錄與庫存保持測試。
- 7 項 Production 驗收通過：三種尺寸深淺色、搜尋分類／狀態、狀態取消／清除、分類頁籤、新增欄位 36px、表格列高不超過 48px、無水平溢出，以及歷史維護物料安全變更。
- 14 項圖示／管理頁／物料借還回歸通過；包含六張狀態方塊的圖示、對比、篩選筆數與資料不變。

## 本機 Production 實際截圖

| 頁面／尺寸 | 淺色 | 深色 |
|---|---|---|
| 設備管理 1920px | [檢視](catalog-equipment-1920-light.png) | [檢視](catalog-equipment-1920-dark.png) |
| 設備管理 1366px | [檢視](catalog-equipment-1366-light.png) | [檢視](catalog-equipment-1366-dark.png) |
| 設備管理 390px | [檢視](catalog-equipment-390-light.png) | [檢視](catalog-equipment-390-dark.png) |
| 物料管理 1920px | [檢視](catalog-materials-1920-light.png) | [檢視](catalog-materials-1920-dark.png) |
| 物料管理 1366px | [檢視](catalog-materials-1366-light.png) | [檢視](catalog-materials-1366-dark.png) |
| 物料管理 390px | [檢視](catalog-materials-390-light.png) | [檢視](catalog-materials-390-dark.png) |

截圖使用固定 Demo 資料。未修改 API、權限或設備維護流程；未合併 main，待使用者確認 Preview。
