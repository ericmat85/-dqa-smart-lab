# 原介面共用資料接線

基底：`9566432388de4a2105d514bc8efa1c6ba2e0c144`。僅在新私人 Preview 設定 `VITE_ORIGINAL_BUSINESS=true`；既有 Demo、Production、Render 及 AI 預算均不變。

## 可驗收範圍

- 沿用原 `/lms/login`、`/request/login`、`/lab/login` 與四入口首頁；不導向技術試接的獨立工作區。
- 正式登入使用原 Email／密碼欄位、Supabase Auth、HttpOnly Cookie 及可撤銷的後端 Session；不接受 Demo 密碼作為正式身分。
- 既有畫面從租戶授權快照讀取委託、試驗目錄、設備、物料及排程等已接線來源。每 15 秒及視窗重新取得焦點時更新。單來源超過 1000 筆會停止讀取並回報，尚未開放大資料量工作區。
- 原委託表單可建立、儲存與編輯本人草稿。完整原表單附加欄位與 PNG／JPEG 草稿簽名一併儲存；簽名不代表正式電子簽章驗證。
- 寫入前以伺服器身分、租戶、所有人、DRAFT、revision 檢查。衝突與未知寫入不自動重送，編輯內容保留；儲存途中新增的修改也保留。
- 舊瀏覽器的業務資料與 IndexedDB 原檔不覆寫、不匯入。空資料庫顯示空資料，避免以 Demo 資料假裝正式案件。

## 尚待後續接線

這一輪是登入／原畫面讀取／委託草稿接線，並非所有業務寫入已啟用。正式送簽、電子簽章效力、排程存入與開始／完成試驗、設備／物料／管理設定的共用寫入、雲端檔案與報告儲存仍受 Gate 控制。原頁面會保留，未開放的寫入拒絕執行。內建試驗參考範本仍可產生；原瀏覽器上傳檔案不會冒充雲端檔案。

舊站案件尚未取得來源匯出與對應核對，這個 Preview 不應拿來判斷既有案件遺失。原 Demo 網址與其瀏覽器資料保持原狀。新來源中的 20 筆試驗參考仍標記 SYNTHETIC。

AI Gateway 與此正式登入的 Session 對接不在本輪啟用，未進行付費模型呼叫，也沒有放寬預算或 Gate。

## 驗證

- `node tools/verify-original-ui.mjs`：全部原 CSS 位元組與 JSX 呈現結構比對（排除事件處理函式與 React key）。
- `node --test tests/business-connection.test.mjs tests/original-business.test.mjs`：BFF、隔離、撤銷、未重送、資料適配與登出競態。
- `playwright.original-business.config.mjs`：桌面與手機原登入、原表單儲存／回讀、衝突、未知結果及儲存時繼續編輯。
- 隔離 PostgreSQL：基礎完整性、既有連線 RPC、原表單／簽名／快照 RLS；僅合成測試資料，全部寫入測試回滾。

G2_GATE=NOT_PASSED
P08_STATUS=POLICY_BLOCKED
RULE_NOT_APPROVED=MAINTAINED
