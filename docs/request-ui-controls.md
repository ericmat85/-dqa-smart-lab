# 步驟、說明圖示與清單搜尋區調整

依使用者本輪五項指示，完成以下介面調整，保留既有資料、簽核流程與查詢條件。

- 委託表單五個步驟編號統一為藍底白字，編號及卡片區段號碼水平、垂直置中；目前步驟仍以文字與 `aria-current` 區別。
- 共用說明按鈕改為參考圖的灰色外圈資訊 i 圖示。保留滑鼠提示、點擊、鍵盤聚焦與 Escape 關閉；登入頁說明工具也同步採資訊圖形。
- 移除電子委託側欄「草稿管理」項目。既有草稿不刪除，仍可從案件清單的「草稿」摘要或狀態篩選進入，編輯、草稿儲存、未儲存離開確認均保留。
- 借用彈窗 `EQUIPMENT BORROWING REQUEST` 改為藍色，深色使用較亮藍色以保持可讀性，亦適用掛載於 body 的彈窗。
- 案件清單、已結案清單下方搜尋區改為原生可收合「搜尋與篩選」區，預設展開。收合不清空條件，重新展開仍保留輸入；借用清單與主管列表共用相同工具列。

## 修改檔案

`src/HelpTip.jsx`、`src/HelpTip.css`、`src/EnterpriseLoginLayout.jsx`、`src/RequestApp.jsx`、`src/RequestListToolbar.jsx`、`src/WorkspacePageHeader.css`、`src/i18n.mjs`；新增 `e2e/request-ui-controls.spec.js`，既有草稿測試改從案件清單摘要進入。

## 畫面

| 項目 | 畫面 |
| --- | --- |
| 桌面淺色 | [檢視](reviews/request-ui-controls/controls-light-1440.png) |
| 桌面深色 | [檢視](reviews/request-ui-controls/controls-dark-1440.png) |
| 手機淺色 | [檢視](reviews/request-ui-controls/controls-light-390.png) |
| 手機深色 | [檢視](reviews/request-ui-controls/controls-dark-390.png) |
| 借用標題藍字 | [淺色](reviews/request-ui-controls/borrowing-light.png)／[深色](reviews/request-ui-controls/borrowing-dark.png) |
| 案件搜尋 | [展開](reviews/request-ui-controls/filters-requests.png)／[收合](reviews/request-ui-controls/filters-requests-collapsed.png) |
| 已結案搜尋 | [展開](reviews/request-ui-controls/filters-history.png)／[收合](reviews/request-ui-controls/filters-history-collapsed.png) |

## 驗證

- 最終相關回歸 12／12 通過，包含既有草稿流程、LMS 視覺與說明圖示，以及新增的四組深淺色／手機控制項與兩組搜尋收合檢查。
- 新增六項檢查另一次單獨補測 6／6 通過，確認條件保留、鍵盤收合、說明工具與借用彈窗顏色。
- 正式包跨系統驗收 44／44 通過。
- lint、正式建置與 diff check 通過。

本輪測試過程同步調整草稿新入口的測試方式，並修正資訊圖示筆畫的幾何中心與借用彈窗的樣式範圍；以上最終案例已通過。未更動帳號、後端、既有案件或權限。預覽供確認，不合併 main。
