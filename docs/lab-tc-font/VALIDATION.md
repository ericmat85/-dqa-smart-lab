# 驗證紀錄（2026-11-24，本機）

執行基準為 README 列出的 PR #49 `ea59fc6`。所有資料為本機合成資料；沒有登入、讀寫遠端資料庫或遠端 Preview。

| 檢查 | 結果 |
| --- | --- |
| `npm ci --cache /tmp/dqa-font-npm-cache` | 通過；依既有 lock 安裝，未改 dependencies 或 lock |
| `npm run build` | 通過；保留既有大 chunk 警告 |
| `npm run lint` | exit 0；88 個既有警告，未順手修無關項目 |
| `BROWSER_MODE=demo PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/lab-tc-font.spec.mjs` | 6/6 通過；桌面 1440、手機寬度 390、LMS、電子委託、英文、離開 lab 範圍清除 |
| 字型專項追加實際 textarea shadow DOM 字形檢查後，`--grep 'local glyphs'` | 2/2 通過；標題、表格、對話框、輸入文字、body portal 實際使用 custom TC font，保留 rendered-fonts.json 及截圖 |
| `e2e/lab-dashboard-v2.spec.js` | 7/7 通過；1920、1600、1366 深淺色版面、取消必填原因、送 LMS 核准、返回不異動資料 |
| `node --test tests/labOperations.test.mjs tests/nineStageSeed.test.mjs` | 17/17 通過；九階樣本流程、禁止自審、層級檢查、取消／中斷、失敗回復 |
| 字型 manifest SHA-256 與檔案 | 108 個檔案逐一驗證 |
| 補丁套用 main／較新 PR #49 head | 暫存 Git index `git apply --cached --check` 通過；不修改這兩條分支 |

## 中途失敗與修復

- 最初借用舊 node_modules，缺少 PR #49 已列入 lock 的 pdfjs-dist：初次 build 與 6 個瀏覽器測試失敗。改為隔離工作樹 `npm ci` 後解決，未改套件版本。
- CDP 測試最初未啟用 CSS agent，2 個字形測試失敗；啟用後 6/6 通過。
- 追加 textarea 實際字形檢查時，原 helper 未讀取瀏覽器內部 shadow DOM，回傳空字形資料而使 2 項失敗。helper 改讀 shadow DOM 後 2/2 通過；不是移除字形斷言。

## 證據與未驗證範圍

交付目錄 `/workspace/artifacts/lab-tc-font-20261124/` 包含 patch、字型渲染證據、桌面／手機截圖及測試日誌。桌面與手機截圖已人工檢視，表格沿用原有水平捲動；字型專項網路攔截禁止非 localhost 請求。

未測：Safari／Firefox、實體手機、遠端登入與連線、正式／Preview 部署、全套 e2e、完整 PDF 輸出視覺比較。報告產生程式與既有報告 OTF 的 Git diff 均為零；九階本機測試包含 Demo PDF，但不代表正式 PDF 驗證。較新 PR #49 head 僅驗證補丁可套用，沒有重跑整合後 UI。
