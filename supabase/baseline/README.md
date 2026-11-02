# Schema Baseline 工作區

目前沒有 Migration。原始 dqa_public_schema_raw.sql 尚在使用者 Windows 本機，未提供 Codex。

- `supabase/private-exports/`：忽略追蹤的稽核證據與本機報告；不得以 git add -f 提交。
- `supabase/baseline/`：可追蹤的流程、證據需求；不存原始 dump。
- `supabase/migrations/`：經審查且隔離重播通過後才建立候選檔，不放空白 SQL。
- RBAC Seed：另案安全取得資料後設計，不包含於 schema-only。

收到經安全審查的副本後，先在 Git 外安全保存不可變原始證據及 SHA-256，再產生可審閱的衍生 Migration。原始證據與衍生檔各自記錄 hash、工具版本、取得時間、審閱人及轉換理由。不將含敏感內容的原始證據傳入對話。

離線預檢（只讀本機檔案；不執行 SQL、不連 DB）：

```sh
python3 scripts/supabase/preflight_schema.py /secure/path/reviewed-schema.sql
```

預檢是啟發式檢查，不是 SQL parser、秘密掃描器或完整性證明。輸出只包含 hash、計數與風險類別，不輸出 SQL 本文。通過後仍需人工審閱及隔離還原；不得以此自動授權套用。

詳見 docs/supabase-baseline-preparation-report.md 與既有驗證方案。
