# 帳號、角色浮動視窗與排程精修

- 排程安排中的紫色文字、步驟數字、AI 圖示／箭頭與相關細節統一藍色；保留狀態語意色。
- 試驗資訊收合列縮為桌面約40px，手機合理換行；縮減展開內容、排程安排標題與欄位間距，不刪欄位或變更驗證。
- 編輯／新增帳號視窗改為白色內容、淺藍標題列、淺灰輸入底色與清楚分隔的操作區；深色模式相應套用既有主題色。
- 帳號標題、統計卡片、頁籤與搜尋列採12px節奏，清除舊版重複邊距。
- 建立新角色按鈕恢復適當寬度，與角色列表標題排列；避免舊視窗關閉按鈕的36px規則套用到新增角色按鈕。
- 建立及編輯內建／自訂角色改為原生浮動視窗，取代列表下方表單。保留角色列表、權限、建立／儲存機制與管理員進入權限。
- 支援取消、Escape、原生焦點限制與關閉後焦點還原；Escape 不會連帶退出角色頁籤。

## 驗證

Lint、Production Build 通過。四項1366／390深淺色介面E2E與四項帳號／角色既有回歸共八項Production E2E通過：角色建立、編輯內建與自訂角色、權限儲存、取消與Escape、帳號CRUD及手機視窗，並檢查按鈕不截斷與排程藍色／收合列高度。

以下皆為本機實際瀏覽器截圖，使用Demo資料。

| 畫面 | 桌面淺色／深色 | 手機淺色／深色 |
| --- | --- | --- |
| 帳號排列 | [淺色](accounts-aligned-1366-light.png) · [深色](accounts-aligned-1366-dark.png) | [淺色](accounts-aligned-390-light.png) · [深色](accounts-aligned-390-dark.png) |
| 帳號視窗底色 | [淺色](account-background-1366-light.png) · [深色](account-background-1366-dark.png) | [淺色](account-background-390-light.png) · [深色](account-background-390-dark.png) |
| 角色列表與建立按鈕 | [淺色](roles-aligned-1366-light.png) · [深色](roles-aligned-1366-dark.png) | [淺色](roles-aligned-390-light.png) · [深色](roles-aligned-390-dark.png) |
| 建立角色視窗 | [淺色](role-new-modal-1366-light.png) · [深色](role-new-modal-1366-dark.png) | [淺色](role-new-modal-390-light.png) · [深色](role-new-modal-390-dark.png) |
| 編輯角色視窗 | [淺色](role-edit-modal-1366-light.png) · [深色](role-edit-modal-1366-dark.png) | [淺色](role-edit-modal-390-light.png) · [深色](role-edit-modal-390-dark.png) |
| 排程緊湊藍色 | [淺色](schedule-compact-blue-1366-light.png) · [深色](schedule-compact-blue-1366-dark.png) | [淺色](schedule-compact-blue-390-light.png) · [深色](schedule-compact-blue-390-dark.png) |

更新既有PR #39供確認，未合併main，未變更正式部署。
