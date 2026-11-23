# 共用業務資料庫接線 Preview

本次建立獨立入口 `/lms/connected/login`，沿用既有品牌、登入版型與桌面／手機視覺。原入口、展示委託流程、四引擎與 Render 保持原樣。接線入口使用 Supabase Auth、業務 API 與共用資料庫，不讀取 Demo 帳號或瀏覽器案件作為正式身分與資料。

## 可驗收範圍

- 正式電子郵件／密碼登入，管理者啟用信的 callback 與設定密碼。
- HttpOnly、Secure、SameSite=Strict、AES-GCM 加密 Cookie。Auth access／refresh token 不回傳給一般前端 API，也不放入 localStorage／sessionStorage。
- 每個請求由 Supabase Auth 驗證身分，再檢查資料庫中的 browser session 與啟用中的工作區成員。撤銷與登出保存在資料庫，可跨實例驗證。
- 查詢委託、20 種內建試驗參考、設備、物料、排程、報告、文件中繼資料、借用、資格、品質、部門、場域與稽核，含分頁與適用的搜尋。
- 具有 requests.draft 權限（或工作區管理者）的使用者可建立、編輯自己的委託草稿。規範與判定內容從共用試驗目錄讀入。
- 版本衝突回報 409，保留使用者表單；新增使用 UUID 防止重複建立。寫入結果未知時先查詢，不自動重送。

## 邊界

此入口是第一階段共用資料接線驗收，尚未將原有九階流程整套切換。既有瀏覽器案件、設備、庫存、排程、簽名與附件不會自動搬移。共用目錄的 20 項為固定來源的 SYNTHETIC 參考，並非正式核准規範。

設備／物料異動、正式送簽、排程啟用、試驗開始、正式簽核、報告上傳下載與核准，仍須後續獨立的服務端命令與物件儲存接線。本次報告／文件頁只查中繼資料，不能把不存在的檔案當作已上傳。

本次沒有啟用 E1／E3 真實 Provider，也沒有改變 E2／E4 預算或呼叫模型。所有原 Gate 保持：

```
G2_GATE=NOT_PASSED
P08_STATUS=POLICY_BLOCKED
RULE_NOT_APPROVED=MAINTAINED
```

## 權限與信任邊界

BFF（`server/business/handler.mjs`）只使用匿名／publishable project key 與登入者自己的 JWT 呼叫資料 API。將 service_role key 誤設為匿名 key 時拒絕啟動。管理 Token 與 service_role 不部署到網站業務 API。

PostgREST 在保留既有 public、graphql_public 的前提下加入 dqa_business；dqa_private 不對外開放。表仍只授權 authenticated SELECT。6 個明確授權的 RPC 提供登入上下文、session 開啟／查核／撤銷，以及自有草稿新增／更新；RPC 驗證 auth.uid()、工作區權限與資料版本，不接受前端指定角色、委託所有人或狀態。

browser_sessions 位於私有 schema，客戶端不能直接讀寫。Cookie 的絕對期限為 8 小時；access token 到期由單一 refresh 流程更新。應用 session 撤銷立即由共享資料庫拒絕；直接取得的 Supabase JWT 生命週期仍遵守平台 Auth 規則，不宣稱所有平台 JWT 因應用登出而立即失效。

已知的外部請求錯誤只回傳安全的錯誤碼與 Trace，不回傳上游原始錯誤、密碼、Token、Cookie 或 SQL。一般業務 API 不允許任意資料表、RPC 名稱、租戶篩選或 SQL。

## 伺服器設定

僅在本次 Preview 設定以下值，秘密從安全環境傳入：

- BUSINESS_ENABLED=true
- BUSINESS_SUPABASE_URL：固定專案 HTTPS origin
- BUSINESS_SUPABASE_ANON_KEY：該專案的匿名／publishable key
- BUSINESS_COOKIE_KEY：32-byte 隨機金鑰的 base64url 編碼
- BUSINESS_ORIGIN：可省略，採用 Vercel 自己的 VERCEL_URL；使用固定別名時須明確設定相符 origin。

保留 Vercel 既有 Preview 保護、Production target、main 與 Render。未修改全域環境變數或將管理憑證交給前端。管理者邀請只在使用者明確同意後發送至指定地址，不自動寄送測試郵件或邀請其他人。

## Migration 與驗收

004_business_connection.sql 接在已遠端驗證的 001–003 之後，維持原檔 SHA256。套用包會檢查原三份紀錄、004 尚未套用及 public 定義指紋；使用單一交易，出錯 rollback，結果未知時先回讀。

```bash
python database/tools/build_connection_bundle.py \
  --out /tmp/business-connection.sql \
  --expected-public-fingerprint '<唯讀 catalog 的固定搜尋路徑指紋>'

node --test tests/business-connection.test.mjs
python database/tests/verify_connection.py --state /path/LOCAL_DATABASE.json --result /tmp/connection-tests.json
python database/tests/verify_database.py --state /path/LOCAL_DATABASE.json --result /tmp/foundation-tests.json --migration-count 4
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --config playwright.business.config.mjs
npm run build
```

API 測試使用模擬上游；RPC 與隔離測試使用真正的本機 PostgreSQL 與合成資料；瀏覽器測試使用模擬 API。遠端另外回讀實際 migration／RLS／ACL／函式與健康狀態，並探測匿名請求拒絕與 Preview 保護。使用者必須從啟用信自行設定密碼，才完成本人登入與跨裝置草稿驗收；本機模擬成功不替代此項證據。

## 下一階段接線

1. 使用者啟用帳號、設定密碼，驗收登入與自有草稿在不同裝置讀取。
2. 從目前瀏覽器匯出案件與檔案 manifest，先 staging、去重、關聯與雜湊檢查，再決定搬遷範圍。
3. 逐項接線設備／物料維護、排程命令、簽核與報告 Storage，完成對應服務端授權及各 Gate 的獨立驗收。
4. 正式上線另行準備 MFA、帳號生命週期、session 清理、備份監控與災難復原，不以本次 Preview 視為 Production 全站切換。
