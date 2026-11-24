# 財務管理 v1 驗收紀錄

範圍：隔離本機環境、合成帳號／資料。Git main 再次唯讀查核為 `7beccce96eb1ffa95ff5cc7d4b4447196c6f0721`。沒有任何雲端驗收結果。

## 最終驗證

| 檢查 | 結果 | 驗證層次 |
| --- | --- | --- |
| `npm test` | 832 / 832 通過 | Node；包含新增 8 項 finance HTTP／權限／欄位測試，及既有九階、物料、排程、報告等回歸 |
| `npm run lint` | 通過，0 errors；77 warnings | 靜態檢查；含新 FinancePage 的 2 項 React effect 同步狀態提示，其餘為既有檔案提示，未順手調整其他功能 |
| `npm run build` | 通過 | Vite 正式建置；仍有大於 500 kB 的既有 bundle 提示 |
| `verify_finance.py` | 46 / 46 通過 | 真本機 PostgreSQL，交易測試後 rollback |
| `verify_resources.py` | 46 / 46 通過 | 原設備、物料與庫存流程 |
| `verify_request_workflow.py` | 40 / 40 通過 | 原委託簽核、禁止自審與層級限制 |
| `verify_human_workflow.py` | 38 / 38 通過 | 原人工排程後流程、報告、簽核及封存；Storage 是本機替身 |
| `verify_schedule_drafts.py` | 31 / 31 通過 | 原排程草稿及預約界線 |
| `verify_workspace_access.py` | 25 / 25 通過 | 原帳號、角色、工作區權限與登入撤銷 |
| `verify_project_requests.py` | 25 / 25 通過 | 原專案分項與個別委託流程 |
| `playwright.finance.config.mjs` | 7 / 7 通過 | Chromium 從 LMS 原入口操作；API 合成替身，非真雲端資料庫 |
| `e2e/admin-navigation-ai-pages.spec.js` | 8 / 8 通過 | 原管理導航、角色、AI 設定頁；1440／390、深淺色 |
| `prepare_finance_local.py` | 通過 | 全新 Docker PostgreSQL，`network=none`、無發布埠；完整 001–033 + 035 |
| 回退腳本 | 通過 | 同一交易內驗證 EXECUTE true → false、資料表仍存在；rollback 後 EXECUTE 回復 true |
| `git diff --check` | 通過 | 空白／patch 格式 |

PostgreSQL 測試合計 **251 項通過**。832 項 Node 測試已包含 8 項 finance HTTP 測試，不另加重複計數。

## 財務重點實測

- 登入管理員與財務編輯角色可寫；唯讀角色可查不能寫；缺頁面權限、缺財務權限、其他工作區、匿名與直接查私有表皆拒絕。附件上傳／讀取同樣檢查。
- 以真 API handler 和合成上游驗證 Cookie、Origin、租戶來源固定於 session、額外 tenant 欄位拒絕，以及上游拒絕不得回傳成功。
- 未估保留 NULL；負數／NaN 拒絕；小數精確讀回。不同幣別、預估／實際、內部／外部分組。
- 預估設備試驗 1 小時、排程保留 24 小時、標準費率 100，結果 100；實際設備只採確認運轉時間，人工只採人工工時；未確認不當成 0。
- 211 筆年度成本合計完整，但單頁只有 50 筆；舊服務履歷在 211 筆新履歷之外仍能以確切 ID 找到並關聯。
- 委託和專案共同關聯不重複計算；例行設備費用不能硬掛專案；重測獨立新增，原成本不被覆蓋。
- TWD 6,000 憑證連校驗 4,000＋專案維修 2,000，外部實際總成本 6,000、專案 2,000。憑證不再增加成本；重複憑證、成本重複連結、幣別不符、預估成本、金額超過憑證、外租戶成本皆拒絕。更正成本也不得讓關聯總額失效。
- 新增／更正／作廢都有操作者時間稽核；已連結成本不可直接作廢；作廢列保留而合計移除。
- 回應遺失後，瀏覽器重新載入仍顯示待確認並阻擋新儲存；原操作結果恢復，不再提交。資料庫相同操作只產生一筆；換內容拒絕，不同操作者查不到他人回執。
- 私有附件檔型、大小、同檔冪等、跨租戶和讀寫權限；HTTP 下載為 attachment／nosniff／no-store。
- 財務操作前後，既有 requests／materials／schedules／reports 的合成內容摘要完全不變；既有九階回歸另跑。
- AI API 拒絕 finance source 與額外財務欄位；瀏覽器財務操作沒有發出 AI 請求。沒有呼叫付費或真模型。
- 瀏覽器從物料側欄切換財務，確認緊鄰；新增、取消、重入、更正、重測、異動紀錄、唯讀、直連拒絕、憑證關聯及附件；390 px 深色無整頁橫向溢出，物料原入口可用。已實際查看桌面淺色與手機深色截圖。

## 過程中失敗與修正

- 初次手動本機遷移缺少 Supabase Storage 的本機替身，停在 012；補齊既有準備工具規定的合成表後成功，最後再用新 `prepare_finance_local.py` 建立全新環境從頭通過。
- 初次 SQL 測試抓到 PL/pgSQL record 變數與 JOIN 別名、category 參數同名，已修正。專案測試改用既有正式建立入口，沒有關閉專案不可變更保護。
- 初次瀏覽器將財務案例跑在 Demo 設定，之後合成 snapshot 又缺少當前會員，皆導致停在登入頁；改為專用 `VITE_ORIGINAL_BUSINESS=true` 測試設定及完整合成會員。
- 工時計價瀏覽器案例抓到 select／datalist 標籤名稱被選項文字干擾，補明確 aria-label 後 7 項全部重跑通過。
- AI 拒絕測試初次缺少合成 gateway 設定而先回 503；補合成設定後驗證 422 的欄位／source 拒絕，fetch 全程由替身攔截，未接觸外部服務。

## 未跑／未驗證

- 真 Supabase Auth 登入／重新登入、PostgREST、Storage API、正式或 Preview 資料庫、Vercel／Render 部署；不將本機通過等同雲端通過。
- 真附件病毒掃描、OCR、大型檔案、正式資料量效能與多個真瀏覽器同時操作；交易鎖／revision 的基本契約已驗證，但未做負載測試。
- 其他未列出的完整 E2E 套件未全部執行；沒有更改 CI、寄信、付款、會計介接或正式報告。

原始 logs、JSON 結果與截圖：`/workspace/artifacts/finance-v1-20261124/`。本機 PostgreSQL 狀態：`/workspace/work/finance-db-final-20261124/LOCAL_DATABASE.json`（只有本機容器資訊，沒有雲端憑證）。
