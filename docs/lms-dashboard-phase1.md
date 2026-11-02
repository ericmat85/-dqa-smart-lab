# LMS Dashboard Phase 1 — Compact Enterprise UI

2026-11-03（台灣時間）。依本次貼上需求，只執行 Phase 1，完成後等待驗收，不進入 Phase 2–6。

## 開始狀態與範圍

開始時為 `codex/compact-lms-workspace`，HEAD `d63641c`；只有原有未追蹤的 `work/`、`artifacts/`，沒有已追蹤檔案的未提交修改。確認 PR #36 及後續整合已合併後，以最新 `origin/main` 的 `4a407c7` 建立獨立分支 `codex/lms-dashboard-phase1`。

主分支已含上一輪 Compact 改版，因此本次「修改前」是現有主分支，不使用更早的肥大版或生成概念圖當成比較基準。後端／Supabase 分支及檔案完全沒有修改。

## 本輪調整

- KPI 改成左側圖示、右側標題／數值、底列完整說明的 grid 排版。最小高度 100px、padding 16px，日期不必擠在圖示旁。現有版本的 KPI 已較新目標小，本次不宣稱再次縮小 KPI 15–25%，而是對齊新 90–110px 目標並提升可讀性。
- 桌面圖表保持兩張，微調為等寬；狀態圖例整理為兩欄，保留全部八個狀態、數量、百分比、高亮及導航。
- 同步縮減柱狀圖、座標軸、bar slot 的顯示高度，比例仍由原數值控制，沒有修改占用率或任何統計計算。
- 近期委託及設備列表字體 13px、列高 42px；維持所有欄位、連結、狀態與分頁。待辦事項字體同步 13px，卡片 padding／間距沿用 16px／12px。
- Dashboard 右側預留 64px 操作帶，AI 按鈕仍為原本右下角 48×48px、可上下移動的按鈕；以內容避讓方式避免它壓到卡片或資料。沒有改 AI 元件、對話內容、動畫、拖動、API 或事件。
- 深淺色沿用既有 tokens 與同一 Theme State，沒有修改 Logo、Sidebar、Header、通知或帳號選單。窄螢幕保留響應排列及內容容器捲動。

所有新增 CSS 只匹配 `#root .lms-enterprise .live-dashboard`。審查、排程、設備、報告及其他 LMS 頁面、電子委託、Lab、DQA 的既有內容與樣式均未在本輪修改；既有頁面只作回歸測試。

## 修改檔案

| 檔案 | 內容 |
| --- | --- |
| `src/LmsDashboardPhase1.css` | 僅 Dashboard 的 KPI、圖例、列表及 AI 避讓 |
| `src/LiveDashboard.jsx` | 只新增 CSS import，所有原 JSX 內容、計算及事件不變 |
| `e2e/lms-dashboard-phase1.spec.js` | 三種桌面尺寸、深淺色、資料不變、圖表／近期委託導航、AI 開關及避讓 |
| `e2e/compact-lms-workspace.spec.js` | 柱狀圖外框高度的既有視覺預期由 208px 更新為 184px |
| `playwright.acceptance.config.js` | 正式包驗收加入六項 Phase 1 檢查 |
| 本文件與 `docs/reviews/lms-dashboard-phase1/` | 修改前後的實際截圖及驗收結果 |

## 實際瀏覽器比較

同一組隔離測試資料、相同尺寸與主題。測試台帳含 12 筆待審查委託、1 筆待排程及 1 筆已排程，畫面數值由原程式算出。未讀取或改變使用者案件。所有圖片均為瀏覽器截圖，非 AI 生成。

| 尺寸 | 修改前 Light | 修改後 Light | 修改前 Dark | 修改後 Dark |
| --- | --- | --- | --- | --- |
| 1920×1080 | [檢視](reviews/lms-dashboard-phase1/before-1920-light.png) | [檢視](reviews/lms-dashboard-phase1/after-1920-light.png) | [檢視](reviews/lms-dashboard-phase1/before-1920-dark.png) | [檢視](reviews/lms-dashboard-phase1/after-1920-dark.png) |
| 1600×900 | [檢視](reviews/lms-dashboard-phase1/before-1600-light.png) | [檢視](reviews/lms-dashboard-phase1/after-1600-light.png) | [檢視](reviews/lms-dashboard-phase1/before-1600-dark.png) | [檢視](reviews/lms-dashboard-phase1/after-1600-dark.png) |
| 1366×768 | [檢視](reviews/lms-dashboard-phase1/before-1366-light.png) | [檢視](reviews/lms-dashboard-phase1/after-1366-light.png) | [檢視](reviews/lms-dashboard-phase1/before-1366-dark.png) | [檢視](reviews/lms-dashboard-phase1/after-1366-dark.png) |

修改前以原版實際瀏覽器擷取；修改後使用本次 Production Build 擷取。

## 驗證紀錄

- 原版基準擷取：6 張（只作截圖比較，不算功能回歸）。
- 新增 Dashboard Phase 1：6／6 通過，覆蓋三種桌面尺寸、深淺色、KPI 尺寸、Logo／Header／Sidebar 尺寸、八個狀態、圖表標籤邊界、圓環鍵盤導航、設備分類及近期委託查閱、AI 開關與焦點返回、滾動到底仍有 AI 避讓、業務資料相同及無橫向頁面溢出。
- `npm test`：43 個測試檔全數通過，無失敗。
- `npm run test:acceptance`：Production Build、跨系統整合驗收 64／64 通過，含本輪 6 項與既有 58 項。前置的電子委託新增／草稿編輯及物料借用回歸也通過，未因 Dashboard 調整受影響。
- lint、diff check 通過。

操作使用隔離的瀏覽器 Demo 資料，不連接或變更正式案件、資料庫與 AI API；不宣稱正式後端或真實 AI 的驗證已完成。原有 Demo／正式版控制機制未改動。
