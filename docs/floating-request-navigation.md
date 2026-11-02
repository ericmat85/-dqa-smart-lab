# 浮動表單導引與欄位說明調整

依使用者最新指示，移除表單上方的連線步驟列，改為貼近視窗下緣的浮動小面板。五個區段可直接點選定位，捲動時追蹤目前區段；只有目前步驟的編號顯示藍底白字，其餘為中性色。所有編號均以固定尺寸與 grid 置中，保留 `aria-current="step"`。

面板不佔用原步驟列位置，桌面與手機皆可用；表單下方保留空間，避免最後送簽操作被浮動面板遮住。原有上方下一步與底部正式送簽操作不變。

## 其他調整

- 搜尋與篩選預設收合；切換案件、借用、主管或歷史清單時重新以收合狀態呈現。輸入條件不因收合而清除。
- 簽核流程及借用申請流程直接以段落文字顯示，移除這兩處說明圖示，流程內容沿用原文。
- 試驗規範、判定基準及借用設備名稱的說明圖示移至各欄位標題旁，補上明確的 label／欄位關聯，保留原本提示內容與鍵盤操作。

## 修改檔案

`src/RequestEditorPage.jsx`、`src/RequestApp.jsx`、`src/RequestListToolbar.jsx`、`src/WorkspacePageHeader.css`；更新頁首、控制項、清單、歷史搜尋的相關測試，以符合新的浮動導引與預設收合介面。

## 截圖

| 畫面 | Light | Dark |
| --- | --- | --- |
| 桌面浮動面板 | [檢視](reviews/floating-request-navigation/floating-editor-light-1440.png) | [檢視](reviews/floating-request-navigation/floating-editor-dark-1440.png) |
| 手機浮動面板 | [檢視](reviews/floating-request-navigation/floating-editor-light-390.png) | [檢視](reviews/floating-request-navigation/floating-editor-dark-390.png) |

- 說明圖示位置：[試驗規範](reviews/floating-request-navigation/specification-help.png)、[判定基準](reviews/floating-request-navigation/judgement-help.png)、[借用設備](reviews/floating-request-navigation/equipment-help.png)。
- 直接展示流程文字：[簽核流程](reviews/floating-request-navigation/approval-flow.png)、[申請流程](reviews/floating-request-navigation/borrowing-flow.png)。
- 預設收合：[案件清單](reviews/floating-request-navigation/filters-requests-default.png)、[已結案清單](reviews/floating-request-navigation/filters-history-default.png)。
- 展開後仍可操作：[案件清單](reviews/floating-request-navigation/filters-requests.png)、[已結案清單](reviews/floating-request-navigation/filters-history.png)。

## 驗證

- 正式包跨系統驗收 44／44 通過；最後調整區段追蹤判斷後，另完成正式建置。
- 說明、搜尋收合與借用控制項六項、頁首六項通過。
- 最終浮動面板四組深淺色／桌面手機追蹤測試 4／4 通過，包含高度、位置、逐區段定位、目前編號顏色、數字置中、流程文字與欄位說明位置。
- 既有委託、借用及 200% 縮放回歸首輪 26 項通過；一項舊空清單測試需先展開搜尋區，更新後單項補測 1／1 通過。
- 主管與結案搜尋補測 1／1 通過，含權限與不同欄位查詢。
- lint、正式建置與 diff check 通過。

測試中修正了舊定位樣式使浮動面板遮擋頁首、說明移位後標籤關聯，以及短區塊過早切換目前步驟的問題；以上最終檢查均已通過。本次不更動既有案件、資料結構、簽核權限或送簽規則。仍供預覽確認，不合併 main。
