# 帳號啟用與驗證信

「允許使用此帳號」控制工作區存取權限，電子郵件驗證另行顯示。管理者儲存啟用中的待驗證帳號時，帳號資料與寄信意圖在同一資料庫交易提交；伺服器再派送驗證信。驗證後的使用者會設定登入密碼，既有電子簽名及業務流程不變。

- 已驗證或已停用帳號不寄信。一般資料編輯會沿用同收件地址的寄送紀錄。
- 「重寄啟用信」是明確操作，至少間隔 60 秒；等待中的寄信共用同一意圖，不會重複派送。
- 寄信結果不明時不自動重送。帳號儲存及信件寄送分開顯示；`SENT` 僅代表 Auth 寄信服務接受，非收件匣投遞證明。
- 重寄只針對資料庫中同一工作區的帳號與版本。前端不能指定任意收件人，也不能呼叫伺服器的派送／完成函式。

## 服務設定

在 Supabase Authentication 的 SMTP 設定填入寄信服務。Resend 使用 `smtp.resend.com`、連接埠 `465`、使用者名稱 `resend`；密碼使用 API Key。正式寄件地址需使用 Resend 驗證完成的自有網域。

`onboarding@resend.dev` 僅供寄至 Resend 註冊信箱的測試，不能寄給一般使用者。測試模式在帳號管理顯示限制。

BFF 僅在伺服器執行環境設定 `BUSINESS_SUPABASE_SERVICE_ROLE_KEY`。不可使用 `VITE_` 前綴，不得放入建置參數、原始碼、瀏覽器或日誌。一般業務操作仍使用登入使用者的 JWT。

資料庫 migration 014 預設不派信，migration 015 限制測試寄件的收件人。確認 SMTP 設定後，由維運設定 `dqa_private.account_mail_policy.enabled`，並依寄件地址設定 `sender_mode` 為 `TEST_ONLY` 或 `CUSTOM_DOMAIN`，測試模式還須設定 `test_recipient_email` 為 Resend 註冊信箱。公開前端無法變更這個設定。

新版 Preview 的 `/account/activate` 完整網址須加入 Supabase redirect allow list。驗證連結會先移除網址中的憑證，再建立安全 Cookie，並要求受邀使用者設定密碼。
