# LMS Compact Enterprise UI

依使用者確認的範例圖，僅精修 LMS「儀錶板」及「試驗委託管理」資訊密度。未重新設計資訊架構，沒有新增分類、按鈕或業務流程。

## 變更

- 儀錶板四張既有統計卡改為約 80–88px，自然容納日期與說明，保留四個指標及原本導航。
- 卡片 padding 16px、間距 12px、圓角 6–8px；圖表縮減留白，近期委託與設備狀態提早出現在筆電首屏。
- 柱狀圖、座標軸與內部 bar slot 同步縮減高度，確保分類名稱留在卡片內，百分比仍依原計算結果繪製。
- 圓環保留所有八個狀態、數量、比例、hover／焦點高亮及點選篩選；精簡圖例列高與高亮字級，不改資料或計算。
- 試驗委託管理保留四頁籤、搜尋、歷史委託、九個表格欄位與原操作。搜尋欄 40px，表格列約 41px、列內按鈕 32px，每頁原本 20 筆設定不變。
- 深色沿用現有主題變數；手機統計卡改兩欄，圖表／表格改單欄，寬表格及圖表在自己的容器捲動，不使整頁橫向溢出。

Header、Logo、Sidebar、入口、登入、帳號與權限、其餘 LMS 管理頁、電子委託、Lab 均未改版。委託內容、簽核／退件、日期、狀態、圖表計算與 API 都沒有修改，AI 的程式與事件亦未更動。

## 修改檔案

| 檔案 | 用途 |
| --- | --- |
| `src/LmsCompactWorkspace.css` | 以 LMS dashboard／request list 為範圍的 Compact 樣式 |
| `src/LmsApp.jsx` | 匯入樣式；委託列表加專用 class，既有函式與事件不變 |
| `e2e/compact-lms-workspace.spec.js` | 六組尺寸／主題、圖表標籤邊界、導航／列表、資料不變檢查 |
| `e2e/preferences-and-chart.spec.js` | 圖例高亮數字由舊 20px 更新為新 14px 的視覺預期 |
| `playwright.acceptance.config.js` | 將新增 LMS 檢查納入正式包驗收 |
| 本文件與 `docs/reviews/compact-lms-workspace/` | 驗證與實際截圖 |

## 範圍與分支

獨立分支 `codex/compact-lms-workspace` 由 `codex/compact-request-editor` 建立。交付時遠端 PR #33 已合併 main，PR #35 已合併至 `codex/slim-login-panel`；因此新 PR 以包含前置 UI 的 `codex/slim-login-panel` 為 base，差異僅含 LMS 本輪改版，不將電子委託或其他工作混入本輪審查。不合併 main，不手動部署 Production，不改存取權限。

截圖使用隔離的測試帳號與 25 筆示範委託；零排程資料會如實顯示 0 與空圓環，不為設計而製造統計資料。

## 實際畫面

| 尺寸 | 儀錶板 Light | 儀錶板 Dark | 試驗委託 Light | 試驗委託 Dark |
| --- | --- | --- | --- | --- |
| 1920×1080 | [檢視](reviews/compact-lms-workspace/dashboard-1920-light.png) | [檢視](reviews/compact-lms-workspace/dashboard-1920-dark.png) | [檢視](reviews/compact-lms-workspace/requests-1920-light.png) | [檢視](reviews/compact-lms-workspace/requests-1920-dark.png) |
| 1366×768 | [檢視](reviews/compact-lms-workspace/dashboard-1366-light.png) | [檢視](reviews/compact-lms-workspace/dashboard-1366-dark.png) | [檢視](reviews/compact-lms-workspace/requests-1366-light.png) | [檢視](reviews/compact-lms-workspace/requests-1366-dark.png) |
| 390×844 | [檢視](reviews/compact-lms-workspace/dashboard-390-light.png) | [檢視](reviews/compact-lms-workspace/dashboard-390-dark.png) | [檢視](reviews/compact-lms-workspace/requests-390-light.png) | [檢視](reviews/compact-lms-workspace/requests-390-dark.png) |

## 驗證

- 新增 6／6 瀏覽器案例通過；直接檢查九個欄位、每頁 20 筆、搜尋、鍵盤分類、歷史委託／詳細資料、核准控制、排程導航及業務資料相同。
- 既有回歸 22／22 通過，包含審查分類與分頁、圖表 hover／鍵盤篩選、字體／語言偏好、AI 助理對話與移動、深淺色樣式。
- `npm test`：43 個測試檔通過，無失敗。
- `npm run test:acceptance`：Production Build 與 58／58 驗收通過，包含前置電子委託的 5 項流程與本輪 LMS 6 項檢查。
- lint、diff check 通過。

首輪新增案例修正測試預期為原有每頁 20 筆，並修正舊柱狀圖子元素固定 260px 使標籤超出縮小卡片的樣式。最終驗證已通過，目前未發現未解決的 UI 或流程問題。以上 E2E 操作使用本機開發伺服器與 Production Build，截圖來自最後的正式包驗收。
