# Lab Compact Enterprise UI V2.0 — Phase 0／Phase 1

2026-11-03（台灣時間）。依本次貼上需求，只盤點現況與優化既有 Lab 工作概覽，不進入 Phase 2–6。不新增第二套 Lab、選單、AI 或排程功能。

## Phase 0：Git 與環境基準

- 原工作區：`/workspace/-dqa-smart-lab`，分支 `codex/lms-dashboard-phase1`，HEAD `a1847ce`；已追蹤檔案無未提交修改，另有既有未追蹤 `work/`、`artifacts/`。已回報並保留，未 reset、stash、丟棄或覆寫。
- 最新已合併主分支為 `origin/main` 的 `4a407c7`。未把尚未合併的 LMS Dashboard PR #38 混入本次 Lab 工作。
- 獨立工作樹：`/workspace/lab-compact-enterprise-v2`；本機分支 `ui/lab-compact-enterprise-v2`，由 `4a407c7` 建立。
- 使用現有 React／Vite／CSS、主題 tokens 與共用元件。沒有修改後端、Supabase、API、資料結構、正式資料或網站存取設定。
- 原版先完成 Production Build，並實際擷取六張三尺寸／雙主題基準畫面，才修改產品樣式。

## Phase 0：目前已實作的頁面與功能

| 實際位置／功能 | 盤點結果 |
| --- | --- |
| `/lab/login` | 現有登入頁，保持不變 |
| `/lab/dashboard` | 登入後的「試驗委託與接收」工作台；沒有另一個獨立 Dashboard 選單 |
| 工作概覽 | 四張 KPI：待確認、已排程、試驗中、已完成，及七欄試驗委託清單 |
| 清單內操作 | 案件詳情、確認接收、申請取消、設備狀態、提交報告；依原狀態及權限顯示 |
| 日程 | 清單內既有 `ScheduleTimeline` 顯示日期、進度與時數；沒有獨立工程師個人排程／甘特圖頁 |
| 設備 | 有試驗設備狀態／設備資訊視窗，沒有另一個獨立 Lab 設備管理列表 |
| 報告／簽名 | 現有 Excel 上傳、檢查、簽名與提交視窗；規則與樣式不在本輪調整 |
| 其他頁籤 | 操作歷程、依原權限顯示的資料庫，保持不變 |
| 完成試驗 | 目前沿用 LMS 排程操作／Demo 加速器，不新增 Lab 完成按鈕，也不新增正常完成原因必填 |
| AI 助理 | Lab 尚無 AI 浮動按鈕或 Drawer，不自行新增，也不宣稱 Lab AI 已驗證 |
| Demo 控制 | 原有 Demo 工具與 Demo 試驗加速器均保留，不改重設／資料產生／Mock／環境邏輯 |

主要實作在 `src/LabApp.jsx`；既有樣式為 `EnterpriseLab.css`、`LabApp.css`、`LabDashboardFrame.css`。主題沿用 `useSystemTheme.js` 與 `EnterpriseTokens.css`，案件詳情、設備、報告、簽名均沿用原元件。

## Phase 1：本輪變更與界線

- 四張 KPI 統一為最小 96px、padding 16px、標籤 13px、數值 26px、圖示 32px。保留原指標、順序與計數，卡片為中性背景。
- 工作台標題、KPI 與概覽容器間距精簡為 12px；清單標題列內距 12px／16px。
- 七個既有欄位、試驗項目、48h、樣品編號、完整日程／進度與操作都保留。僅略縮資料列內距，沒有強制把多行資料裁成 44px；實際高度依內容自然增加。
- 試驗中的小圖示／狀態標記使用既有品牌藍與主題變數，仍保留文字狀態。
- 截圖發現原本右下角 Demo 工具遮住清單操作欄，因此僅在此工作概覽以 CSS 移到頁面標題右側；原開關、Escape、重設及確認事件完全不變。手機選單展開時暫時避讓，關閉後恢復。
- 沒有改 Logo、Header、Sidebar、通知、帳號、深淺模式狀態。新樣式只針對工作概覽的兩個專用 class；操作歷程、資料庫與接收／取消／設備／報告／簽名視窗沒有改版。

工作概覽與接收列表是同一個現有畫面，因此本輪只精修其概覽容器與資料呈現；Phase 2 的接收視窗、取消介面及操作設計沒有提前執行。

## 修改檔案

| 檔案 | 內容 |
| --- | --- |
| `src/LabApp.jsx` | 匯入樣式，加上 KPI／概覽兩個 class；原函式、條件、文字與事件均不變 |
| `src/LabDashboardCompactV2.css` | 僅 Lab 工作概覽的局部樣式及 Demo 工具避讓 |
| `e2e/lab-dashboard-v2.spec.js` | 六組視覺／資料不變案例與取消原因／待核准回歸 |
| `playwright.lab-ui.config.js` | 隔離本次測試，使用 4183／4186 本機連接埠，不修改原測試設定 |
| 本文件與 `docs/reviews/lab-compact-v2-phase1/` | 盤點、修改前後實際截圖與驗收結果 |

## 實際瀏覽器截圖

同一組隔離假資料、固定瀏覽器時間與尺寸：八筆委託，各 KPI 為 2；每筆仍有樣品、設備、日期、進度與時數。沒有讀取或改動使用者既有案件。以下不是 AI 生成概念圖。

| 尺寸 | 修改前 Light | 修改後 Light | 修改前 Dark | 修改後 Dark |
| --- | --- | --- | --- | --- |
| 1920×1080 | [檢視](reviews/lab-compact-v2-phase1/before-1920-light.png) | [檢視](reviews/lab-compact-v2-phase1/after-1920-light.png) | [檢視](reviews/lab-compact-v2-phase1/before-1920-dark.png) | [檢視](reviews/lab-compact-v2-phase1/after-1920-dark.png) |
| 1600×900 | [檢視](reviews/lab-compact-v2-phase1/before-1600-light.png) | [檢視](reviews/lab-compact-v2-phase1/after-1600-light.png) | [檢視](reviews/lab-compact-v2-phase1/before-1600-dark.png) | [檢視](reviews/lab-compact-v2-phase1/after-1600-dark.png) |
| 1366×768 | [檢視](reviews/lab-compact-v2-phase1/before-1366-light.png) | [檢視](reviews/lab-compact-v2-phase1/after-1366-light.png) | [檢視](reviews/lab-compact-v2-phase1/before-1366-dark.png) | [檢視](reviews/lab-compact-v2-phase1/after-1366-dark.png) |

修改前在原版應用程式擷取，修改後來自最終 Production Build。`LAB_UI_BEFORE` 只作基準擷取指令的圖片命名與跳過新尺寸斷言，不會還原產品樣式。

## 已完成的驗證

- 原版 Production Build 成功；六組修改前擷取完成，僅作視覺基準，不計為功能測試。
- 新增 7／7 E2E 通過：六種尺寸／主題、KPI／外框尺寸、七欄資料與所有多行內容、Demo 工具開關／Escape、接收／取消視窗、案件詳情、操作歷程切換、資料不變。
- 取消流程另以真實有效的隔離排程測試：未填原因被阻止；填入後仍為待一階主管審核，排程為待核准，Lab 仍為待確認，不直接取消。
- 現有 Unit Test：43 個測試檔通過，沒有失敗。
- 最終 Production Build 成功；整合驗收 51／51 通過（原有跨系統 44 項＋本次 Lab 7 項）。
- 原版及最終建置皆有既有的大型 bundle 提示，沒有在本輪進行拆包重構。

正式服務、資料庫及真實 AI API 未接入本次驗證；所有流程操作限隔離的本機 Demo。不存在的 Lab AI／獨立工程師甘特圖不標示為通過。

## 回歸結果與驗證界線

- 既有相關 E2E 30／30 全通過（選取 demo、Lab enterprise、登入控制、控制項對齊與資料庫分類測試，非宣稱整個 E2E 目錄都執行）。
- 覆蓋實際 Lab 登入、接收；既有加速器的試驗中→暫停／恢復→完成及設備資訊；報告 Excel 上傳、簽名、二階／三階審核、退回／修訂與 PDF 封存；入口返回、資料庫權限及手機選單。
- 最後補驗由 Lab 側欄返回四大入口，正式包 Dashboard 7／7 再次通過。
- 最終 lint／diff check 通過。現有 Layout、Logo、Sidebar、Header 尺寸亦有斷言，未改動。
- Lab 沒有 AI 助理或獨立工程師甘特圖，所以不把 LMS 相關功能的測試當作 Lab 功能已完成；這些不存在的功能不在本次新增。
- 正常試驗完成仍走原有操作，沒有新增原因必填或新的完成按鈕。Excel、簽名圖片／時間、版本、PDF 與資料流的產品程式均未修改。

## 尚未解決項目

目前沒有本輪新增的已知 UI 失敗。多行資料列高於 44px 是刻意保留完整資訊，而非裁切內容。既有大型 bundle 提示仍存在，沒有在 UI 工作中加入拆包或功能重構。

Phase 2–6 尚未執行；現有缺少的 Lab AI／個人甘特圖僅盤點回報，未自行增加。

## 本機交付與後續授權

- 工作樹：`/workspace/lab-compact-enterprise-v2`。
- 分支：`ui/lab-compact-enterprise-v2`，僅本機。
- 本機預覽：`http://127.0.0.1:4180/lab/dashboard`，僅此工作區可用，不是遠端公開網址。
- 尚未推送、尚未建立 PR 或遠端 Preview，也沒有修改 Production 或網站存取權限。
- 依使用者第 15.3 節「如需推送分支或建立 PR，必須先確認使用者授權」，待驗收可審查成果後才請求推送／PR／Preview 授權。

重跑方式：

```bash
npm test
npm run build
LAB_UI_PRODUCTION=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test --config playwright.lab-ui.config.js
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test --config playwright.lab-ui.config.js e2e/demo.spec.js e2e/lab-enterprise.spec.js e2e/login-credentials.spec.js e2e/control-alignment.spec.js e2e/archive-categories.spec.js
```
