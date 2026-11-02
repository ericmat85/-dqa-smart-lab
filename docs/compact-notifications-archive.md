# 通知列表瘦身與資料庫重複標題移除

依使用者提供的通知中心及資料庫截圖調整：通知中心保留頁面主標題，移除卡片內重複標題；每筆通知改為緊湊橫列，縮小圖點、內距與文字間距。桌面讓標題、說明並排，手機自動上下換行，內容不截斷。

電子委託與 Lab 資料庫已有外層頁面標題，因此不再顯示頁籤上方第二份「資料庫」及說明圖示。LMS 沒有外層重複標題，保留其原有單一標題。頁籤、搜尋、報告權限與檔案操作不變。

## 修改檔案

- `src/RequestApp.jsx`：通知清單版型與資料庫標題選項。
- `src/WorkspacePageHeader.css`：通知列緊湊排版與手機換行。
- `src/ReportArchive.jsx`：可控制是否顯示元件內標題，預設行為不變。
- `src/LabApp.jsx`：資料庫沿用外層標題。
- `src/i18n.mjs`：通知清單可及性標籤的英文翻譯。
- `e2e/compact-notifications.spec.js`：通知高度、文字完整、單一資料庫標題及頁籤鍵盤操作。

## 畫面

| 畫面 | 桌面 Light | 桌面 Dark | 手機 Light | 手機 Dark |
| --- | --- | --- | --- | --- |
| 通知中心 | [檢視](reviews/compact-notifications-archive/notifications-light-1440.png) | [檢視](reviews/compact-notifications-archive/notifications-dark-1440.png) | [檢視](reviews/compact-notifications-archive/notifications-light-390.png) | [檢視](reviews/compact-notifications-archive/notifications-dark-390.png) |
| 資料庫 | [檢視](reviews/compact-notifications-archive/archive-light-1440.png) | [檢視](reviews/compact-notifications-archive/archive-dark-1440.png) | [檢視](reviews/compact-notifications-archive/archive-light-390.png) | [檢視](reviews/compact-notifications-archive/archive-dark-390.png) |

截圖中的資料庫已透過鍵盤切到試驗規範頁籤，以確認移除重複標題後仍可操作分類。

## 驗證

新增檢查 5／5 通過，涵蓋桌面深淺色通知列高度不超過 64px、手機橫向無溢出、完整描述、電子委託及 Lab 單一資料庫標題、分類鍵盤切換。既有資料庫／委託回歸 24／24 通過；lint、正式建置及 diff check 通過。

不更動通知計數、案件內容、資料庫讀取權限或檔案處理。預覽供確認，不合併 main。

通知列後續微調：標題、描述與圓點改為垂直置中，移除圓點原有的上方偏移。lint、正式建置、diff check 及版型測試 5／5 通過，通知截圖已更新。
