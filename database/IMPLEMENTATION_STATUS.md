# 業務資料庫建置驗收 — 2026-11-21

狀態：**CLOUD_DATABASE_FOUNDATION_PASS**。

| 項目 | 實際結果 |
| --- | --- |
| 專案 | dqa-smart-lab-dev／mmazbwzdiizabikmiily |
| 方案 | 使用者確認 Free；未購買、升級或建立新專案 |
| 恢復 | 既有暫停專案已恢復，ACTIVE_HEALTHY |
| 新 schema | dqa_business、dqa_private |
| 資料表 | 28 張業務表 + 1 張 migration 紀錄表 |
| 外鍵／索引／觸發器 | 76／165／66 |
| RLS | 28 張業務表，28 個 SELECT policy；用戶無業務寫入權限 |
| 資料 | 新業務資料 0 筆；僅保存 3 筆 migration 雜湊；未匯入 Demo 或瀏覽器資料 |
| 原有 public | 9 張表；建置前後定義指紋均為 6d5aab1193d08ac6401d3441496d2395 |
| 遠端回讀 | 3/3 migration SHA256 一致；資料表、RLS、ACL、外鍵、約束、索引、觸發器及函式定義與本機逐項一致 |
| 本機驗收 | PostgreSQL 17，20/20 組通過；多個斷言涵蓋 28 張表的隔離與完整性 |
| 還原驗收 | 合成資料 dump 還原至另一個隔離資料庫；29/29 表內容一致，安全驗收 20/20 通過 |
| 原網站 | 未修改前端，未切換資料來源，未部署 Vercel／Render |
| AI／設備 | 付費模型呼叫 0；實體設備連線 0 |

雲端套用包 SHA256：`5e06cc573ccfd244d5088c636918e913df0181310b14386c2b10ea569075aca5`。

| Migration | SHA256 |
| --- | --- |
| 001_business_schema.sql | 95a79b170475412bd42e217ba6cdb68efed308b70c42a757ce9a3abd53e8afba |
| 002_tenant_read_security.sql | 938d50295ac35494a767920a37ff37ddf2013f0926601407829c2c52447a9b58 |
| 003_integrity_audit_and_policy_gates.sql | 90ca9672f09f267facdbd17656650bb00030253c8a81caf585a4ebcd6a9c4490 |

首次套用被定義指紋保護攔下，整筆 rollback，遠端確認兩個新 schema 都未留下。原因是 catalog 定義文字受 search_path 影響；已固定比較方式，以同名 public／業務表的本機回歸驗證後完成套用。沒有刪除或重建現有 public 表，也沒有修改 Supabase 既有 migration history。

遠端沒有執行合成帳號／業務 fixtures。遠端驗收以回讀實際 DDL、ACL、RLS、空資料狀態及 migration 雜湊為證據；跨租戶合成情境與還原測試在隔離本機完成。

## 下一階段

資料庫結構可供後續共用後端使用；網站尚未因此具備跨裝置同步。下一步須完成正式 Auth 與工作區／角色對應，再建立服務端業務 API、物件儲存授權、資料搬遷檢查及逐功能切換驗收。現有表仍受草稿與 Gate 限制，不提供繞過正式流程的寫入捷徑。

設備 U 欄位、試驗目錄與文件版本已具備儲存位置，但尚未將目前裝置中的資料自動匯入，也沒有為空資料庫擅建管理者或啟用正式案件流程。

```
G2_GATE=NOT_PASSED
P08_STATUS=POLICY_BLOCKED
RULE_NOT_APPROVED=MAINTAINED
```

詳細原始證據放在 Git 外的 `/workspace/work/business-database-20261121/evidence/`，包含 REMOTE_VERIFICATION_SUMMARY.json、SUPABASE_REMOTE_READBACK.json、CURRENT_RUNTIME_ACCEPTANCE.json、RESTORE_VERIFICATION.json，以及兩次套用回應與 rollback 證據。此目錄不包含 Token。
