# LMS 財務管理 v1（本機交付）

基準：`7beccce96eb1ffa95ff5cc7d4b4447196c6f0721`（PR #47 合併版）。分支：`local/finance-v1-20261124`。沒有混入未上線四引擎分支。未推送、合併、部署、變更雲端資料庫、讀取真實財務資料或呼叫外部模型。

## 使用入口與資料來源

`/lms/finance`，LMS 側欄在「物料管理」正下方；既有選單相對順序不變。沿用既有頁面外框、主題、按鈕與 CompactDialog。Demo 不提供假持久化財務帳本。

| 功能 | 實作與來源 |
| --- | --- |
| 試驗成本 | 工作區獨立 `dqa_private.finance_costs`，預估／實際、人工／設備／耗材／外包試驗／其他、內部使用／外部支出、幣別、日期、次數、備註 |
| 設備費 | 使用／校驗／保養／維修；外部廠商校驗維修仍是設備。設備類必須關聯既有設備。例行費用用設備歸屬，不接受專案或委託；專用費選專案／委託歸屬 |
| 關聯 | 既有 `requests`、`request_projects`、`equipment`，同工作區複合外鍵；委託歸屬的專案由伺服器核對，禁止矛盾專案 |
| 服務履歷 | `resource_events` 選填連結，同工作區與設備核對；可以用確切履歷 ID 搜尋超過最新 200 筆的舊紀錄，不修改原履歷 |
| 篩選／合計 | 日期、專案、委託、類別；清單每頁 50 筆，資料庫對全部符合列計算合計，不由瀏覽器頁面加總。年度合計只按年度及專案，畫面明示不套用其他清單篩選 |
| 憑證 | `finance_vouchers`：收到的發票／收據、供應商、號碼、日期、幣別、金額、財務單號、備註；不開票、請款、收款、標示已付款或另加至成本 |
| 關聯成本 | `finance_links` 一張憑證連多筆成本，每筆成本最多一張有效憑證；只能是同幣別、金額已知的外部實際成本，合計不得超過憑證金額；更正成本也重新檢查 |
| 私有附件 | 選填 PDF／PNG／JPEG，每張憑證一份、上限 256 KiB。存於私有資料表 `finance_files`，不是公開 URL；MIME、檔頭、大小、檔名驗證，SHA-256，下載強制 attachment、nosniff、no-store。不得覆寫舊檔，錯誤附件可作廢原憑證重建 |
| 異動 | `finance_events` 保存新增／更正／作廢／附件的操作者 UUID、時間、版本；作廢保留原列且不計合計 |

既有來源搜尋每類最多回傳 50 筆；可輸入名稱／編號搜尋，或直接貼上確切識別碼。關聯成本目前輸入識別碼（成本清單可取得），未新增複雜選取器。費率由授權財務人員填標準／角色費率名稱與數值，沒有個人薪資欄位，也沒有假設既有系統有可靠費率來源。

## 計價與不重複計算

- 金額留空是「未估」，不當成 0。合計顯示已知金額和未估筆數，缺資料明示合計不完整。零元是明確輸入的 0。
- 費率計價：人工用人工工時；設備使用的預估用預計試驗時間，實際用確認設備運轉時間；其他費率項目用數量。排程保留時間只供記錄，永不作乘數。缺費率或必要數量／工時就保留未估。
- 費率「已含校驗／保養」是明示記錄；計算只有費率乘數，沒有另加校驗／保養或依設備狀態產生費用。內部使用與外部支出分組，不能將兩組直接視作同一支出總額。人工輸入兩筆不同 ID、實際卻是同一費用的語意重複仍需財務人員核對。
- 成本以唯一列計算一次，連結委託及其專案不做雙重 JOIN 加總。重測建立新 ID 與遞增次數，原成本保留。
- 憑證只是佐證，不再次入帳。一張 TWD 6,000 憑證連設備例行校驗 4,000 及專案專用維修 2,000，工作區外部實際成本是 6,000，專案是 2,000。
- 金額採 PostgreSQL numeric；合計與可編輯小數經 API 回傳字串，避免 JavaScript 浮點加總。幣別分組，沒有匯率換算。

## 授權與失敗處理

既有工作區管理員可操作；其他帳號需 LMS 入口、財務頁權限及 `finance.read`。編輯另需 `finance.write`，角色表單選編輯時補上 read，但不偷偷開通頁面。側欄及直連前端守門；每個 RPC 都重新核對登入者、會員啟用狀態、工作區和角色。API 只採用已驗證 session tenant 與使用者 access token；不用 service-role 繞過財務授權。資料表不給 PUBLIC、anon、authenticated、service_role 直接存取。

新增／更正／作廢具 revision 檢查及工作區交易鎖，保存操作 ID／操作者／內容指紋。回應遺失時保留 sessionStorage 中的操作 ID（不保存財務內容），按「查詢原操作結果」，不自動重送。查不到仍保持待確認，避免將正在處理當成失敗。不同帳號不能取回別人的操作結果。附件相同檔案重送具冪等性，不能覆寫不同內容。

財務資料只存在專用 API 與頁面，不加入原 shared snapshot、AI context、E1–E4 輸入、報告、庫存、排程或九階狀態。一般 AI 路由仍拒絕 finance source／額外財務欄位。此隔離不等同可以防止使用者自行在自由文字對話貼上敏感資料。

## 遷移與回退

新增 `database/migrations/035_finance_v1.sql`。基準最後是 033；034 預留給另一條未整合 AI 工作，035 不依賴 034。遷移只擴充角色允許的 permission/page 值並建立私有表、索引與 RPC，不回填財務資料、不更改既有角色內容、歷史成本或流程政策。

本機準備（Python 3.12.14，無新增 Python dependencies）：

```sh
uv run --python 3.12.14 --no-project python database/tools/prepare_finance_local.py --directory /tmp/dqa-finance-local
uv run --python 3.12.14 --no-project python database/tests/verify_finance.py --state /tmp/dqa-finance-local/LOCAL_DATABASE.json --result /tmp/finance-result.json
npm test
npm run lint
npm run build
npx playwright test --config playwright.finance.config.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/admin-navigation-ai-pages.spec.js
```

準備工具只建立 Docker `network=none`、無發布連接埠、合成帳號的 PostgreSQL，套用 001–033 及 035；Supabase Auth/Storage 僅最小本機替身。沒有 DSN／雲端參數。

回退採保留資料停用：`database/rollback/035_finance_disable.sql` 撤回 authenticated 的全部 finance RPC 權限；前端回到基準版本即可。私有表、附件、稽核與角色值保留，不刪財務資料。重新開放需另行審查並恢復 035 末段的函式 EXECUTE grants；不重跑整份建表遷移。任何雲端執行均不在本輪授權內。

## 明確限制

- 未部署、未實測 Vercel／Render／真 Supabase Auth、PostgREST、雲端資料庫或正式站登入。瀏覽器測試使用合成 API；SQL 授權測試是本機 PostgreSQL 真查詢；HTTP 測試跑真 handler、合成上游。
- 附件做類型與檔頭驗證，未配置病毒掃描、OCR 或完整 PDF 解析；僅下載，不在頁內執行／預覽。256 KiB 是 v1 限制，大型附件需要後續私有物件儲存與掃描方案。
- 不做自動分攤、會計總帳、稅額拆分、付款狀態、開票、採購簽核或外部會計服務。未估資料由授權財務人員補齊。
- 不宣稱法規合規或雲端驗收通過。
