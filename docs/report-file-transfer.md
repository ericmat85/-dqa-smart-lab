# 試驗報告容量與傳輸

單份試驗報告 `.xlsx` 與封存文件 `.pdf` 的上限統一為 20 MiB（介面顯示 20 MB，20,971,520 bytes），真實與虛擬委託使用同一上限。共用常數位於 `src/reportFilePolicy.mjs`；前端欄位檢查、上傳／下載、後端報告驗證與數位驗章文件讀取均使用它。

自訂範本上傳的 10 MB、簽名圖檔大小、PDF 頁數及 Excel 結構／解壓縮限制是不同用途的限制，這次不調整。檔案增大也不會把照片或簽名圖傳給 AI；原有有界文字欄位投影不變。

## 私有傳輸

- 上傳仍先以已登入帳號取得單次上傳授權，再直接 PUT 到私有 Storage；API 只接收檔案 metadata。
- 讀取採 `GET /api/business/execution/download/:fileVersionId`。後端先經原 `human_report_file` RPC/RLS 驗證案件可見性，再取得 60 秒有效的 Storage signed URL，回傳原始 SHA-256、大小與 MIME。
- 瀏覽器以 `credentials: omit`、`redirect: error`、`referrerPolicy: no-referrer`、`cache: no-store` 讀取；下載大小有界且須符合原始 hash。signed URL 不導航、不寫入持久儲存。
- 大檔案內容不經 Vercel API request/response body，以免放大容量後受平台 body 上限阻擋。既有 `/execution/file/:id` 保留相容性；新版介面全部使用上述 metadata 路徑。
- 送簽前仍由後端獨立讀取私有物件，驗證 hash、檔案結構、案件關聯與真實／虛擬用途標記，然後建立檔案 attestation。沒有跳過審查、簽名或版本控制。

## 部署

需依序套用 `database/migrations/029_report_file_limit.sql`（上傳 intent CHECK、prepare_report_upload 及私有 bucket 大小），並部署同一版本的前後端。原已套用的 012 不重寫。029 保留既有 ACL/RLS、bucket 私有屬性、檔案類型及既有資料；本次開發只在隔離的合成資料庫套用，尚未變更雲端。

驗證涵蓋真實 PNG 組成且超過 10 MiB 的工作簿、超過 3 MiB 的有效 PDF、20 MiB 邊界、hash/串流長度不符、超限與未授權拒絕、固定 BFF rewrite、真實與虛擬上傳、私有 bucket/授權及完整虛擬流程。
