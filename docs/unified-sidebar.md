# 各系統側邊欄統一為 LMS 版型

以使用者提供的 LMS 儀表板截圖為準，將電子委託及實驗室側邊欄統一。LMS 本身的側欄及其選單不變；DQA 只有展示登入頁，沒有新增內部側欄。

## 調整內容

- 桌面側欄 232px、頂部放置既有企業 Logo（170px），Logo 下方細分隔線與 LMS 對齊。
- 原頁首的 Logo 移到側欄，頁首顯示各系統名稱，避免桌面同時出現兩份 Logo。
- 導覽統一 22px 線條圖示、40px 最低列高、14px 字體、藍色選取列及深淺色背景。
- 各系統保留自己的選單、角色權限與導航行為；底部以相同圖示及樣式提供「回到首頁」。電子委託沿用未儲存資料離開確認。
- Demo 說明收在可展開的說明區，內容仍可讀取；電子委託 Demo 工具保留在內容區，避免新布局多出空白列。
- 手機保留既有選單開關及選取後關閉行為，不把完整桌面側欄擠入窄螢幕。

## 修改檔案

| 檔案 | 內容 |
| --- | --- |
| `src/WorkspaceSidebarBrand.jsx`／`src/WorkspaceSidebar.css` | 共用 Logo 區與側欄樣式、桌面布局 |
| `src/LmsSidebarIcon.jsx` | 保留 LMS 圖示，增加委託系統所需圖示 |
| `src/RequestApp.jsx`／`src/LabApp.jsx` | 套用側欄品牌區、線條圖示、底部導航與說明 |
| `e2e/sidebar-consistency.spec.js` | 側欄尺寸、Logo、頁首對齊、首頁導航及手機操作 |
| `e2e/enterprise-request.spec.js` | 字元圖示改為 SVG 後，草稿選單文字預期同步更新 |

## 前後畫面

截圖使用獨立測試瀏覽器與 Demo 帳號。調整前沿用 Phase 6 整合驗收的同系統桌面畫面，調整後為本次正式建置，兩者均為 1440 × 900 視窗。

| 系統 | 調整前 Light | 調整後 Light | 調整前 Dark | 調整後 Dark |
| --- | --- | --- | --- | --- |
| 電子委託 | [檢視](reviews/unified-sidebar/before-request-light.png) | [檢視](reviews/unified-sidebar/after-workspace-request-light-desktop.png) | [檢視](reviews/unified-sidebar/before-request-dark.png) | [檢視](reviews/unified-sidebar/after-workspace-request-dark-desktop.png) |
| 實驗室 | [檢視](reviews/unified-sidebar/before-lab-light.png) | [檢視](reviews/unified-sidebar/after-workspace-lab-light-desktop.png) | [檢視](reviews/unified-sidebar/before-lab-dark.png) | [檢視](reviews/unified-sidebar/after-workspace-lab-dark-desktop.png) |
| LMS 基準 | — | [檢視](reviews/unified-sidebar/after-workspace-lms-light-desktop.png) | — | [檢視](reviews/unified-sidebar/after-workspace-lms-dark-desktop.png) |

## 驗證

- lint、正式建置與 diff check 通過。
- 最終正式包驗收：44／44 通過。
- 最終側欄與相關操作補測：10／10 通過（側欄深淺色與手機 8 項、草稿流程 1 項、Demo 工具 1 項）。
- 擴大回歸首輪：42 項通過，1 項仍預期舊字元圖示「▧草稿管理」而失敗。SVG 替換後更新該文字預期，單項補測及最終 10 項補測均已通過；沒有留下未解決的測試失敗。

測試範圍包含三系統深淺色、英文大字體、手機導航、委託表單與草稿、主管權限、Lab 操作、閒置工作階段及 Chrome 200% 縮放。

本次僅統一側欄與其布局，沒有變更案件資料、帳號權限、送簽流程、排程或報告邏輯。仍以預覽提供使用者確認，不合併 main。
