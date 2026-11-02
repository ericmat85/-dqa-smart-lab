# Schema Baseline 準備與安全審查報告

2026-11-03（Asia/Taipei）。狀態：準備完成，Migration 尚未建立／驗證。

## Repository 與範圍

本機分支為 backend/supabase-schema-baseline，工作起始乾淨，沒有既有 Migration。使用者已確認交付使用現有 ericmat85/-dqa-smart-lab；不更改 remote。

本次只新增工作區說明、離線預檢腳本、忽略規則與本報告。保留既有六項方案及分拆 catalog 查詢；不修改 UI，不連線遠端資料庫，不執行 db pull/db push/db reset/migration repair，不更改角色、GRANT、RLS、Trigger 或 History。

## 使用者提供的驗證結果

以下來自使用者回報，Codex 本次沒有重新執行查詢：專案 dqa-smart-lab-dev，PostgreSQL 17.11，public tables 9、functions 2、RLS 9/9、public policies 0；auth.users 自訂 on_auth_user_created；自訂 Event Trigger ensure_rls；另外六個平台 Event Triggers 不納入應用 Migration。

函式回報：handle_new_user() 為 postgres owner、SECURITY DEFINER、空 search_path，完整限定 public.user_profiles、無動態 SQL、ON CONFLICT (id) DO NOTHING。rls_auto_enable() 為 postgres owner、SECURITY DEFINER、search_path=pg_catalog，format 識別字引用且僅作用於 public，但 WHEN OTHERS 目前只記錄錯誤。

尚未取得 dqa_public_schema_raw.sql，不能推測欄位、FK、unique、indexes 或認定候選 SQL 與遠端一致。9/9 RLS 且 0 policies 對一般角色通常意味預設拒絕；owner、BYPASSRLS 或 SECURITY DEFINER 仍有特殊行為，需另驗證有效存取。

## 工作目錄與交付

- supabase/baseline/README.md：稽核證據與衍生檔分離流程。
- scripts/supabase/preflight_schema.py：只讀本機檔，輸出 SHA-256、格式依賴的計數和風險分類，不執行 SQL、不輸出秘密片段。
- supabase/private-exports/、supabase/raw-dumps/：忽略追蹤的私人證據區。
- supabase/migrations/：尚不建立 SQL；待原始檔審查與還原驗證後才建立。
- 既有 docs/supabase-schema-validation-plan.md：隔離重播方法；docs/supabase-rbac-seed-plan.md：獨立 Seed。

## 待補物件與依賴

需安全審查的 public dump、pg_dump client version／選項／hash、九表完整 DDL、兩函式完整本文／signature／owner／ACL、schema/relation/sequence/type/default ACL、indexes／constraints／FK／unique、跨 schema dependencies、extensions、必要 types/enums/domains、partition/inheritance 與 publications。

public-only dump 不包含 auth.users 上的自訂 table trigger，需另外提供 on_auth_user_created 的 pg_get_triggerdef、enabled 與 handler 對應。ensure_rls 需 event、tags、enabled、owner、handler 對應及相依順序。不得僅從名稱推測；六個平台 Event Triggers 保留於平台基礎環境，不重播。PostgreSQL 全域角色／membership 不由 public dump 包含，不匯出角色密碼。

## 函式改善提案（未實作）

handle_new_user：先確認 display_name 來源、型別與欄位限制，再定義長度、空白／控制字元與空值處理；不要自行假設資料模型或截斷使用者名稱。測試 metadata 缺少／錯誤型別／極長值、既有同 id profile、重試與衝突。DO NOTHING 可使重試不覆寫既有資料，但也可能隱藏不一致；須明確決定接受、記錄或拒絕，並檢查 signup 交易失敗的產品語意。

rls_auto_enable：首選評估 fail-closed，對應啟用 RLS 失敗時重新拋錯，讓建表 DDL 原子失敗；不要只記錄後放行。保留 pg_catalog search_path、安全識別字引用及 public 範圍，明確定義支援的 DDL tags／partition 行為及錯誤訊息去敏。替代方案是明確交易內建立表＋啟用 RLS並由 CI 驗證；此方案不能默默替代現行保障。需確認 enum/event trigger handler 等相依後才能寫實際變更 SQL。任何改善先在隔離環境對成功／權限失敗／不支援物件／非 public／partition 測試，不修改遠端函式。

## 隔離重播方案與驗收

取得已審查檔後，使用 PostgreSQL 17 相容且 Supabase managed schemas/extensions 相符的一次性本機環境，不注入遠端憑證或正式資料。先建立 managed 基礎，再以實際 dependencies 決定 types/tables/functions/constraints/ACL/Auth trigger/Event Trigger 的順序；ensure_rls 不得不經評估提前改變重播結果。

保留 owner 與 grants 的原始證據；衍生 SQL若需調整 owner，須特別驗證 SECURITY DEFINER 與 EXECUTE 語意。還原後用同版工具／catalog 定義比對，核對九表、兩函式、九表 RLS、零 policies（若 dump 證據吻合）、自訂 Auth／Event Trigger，平台物件另列。計數不能替代定義／ACL／行為比較。

以合成本機 Auth 身分測試同步、重試、display_name 邊界與有效存取；測試 Event Trigger 失敗能否原子阻擋建表。RBAC 11/40/99 是先前預期，仍需實際 tenant scope／FK／unique 與資料矩陣證據，獨立 Seed，不匯入使用者帳號或權限指派。

通過條件：證據 coverage 完整、無秘密、沒有未解釋物件差異、依賴順序可重播、RLS／Auth／Event Trigger 正負案例通過。既有遠端 History 對齊仍是另一項待授權作業。

## 尚未完成

原始檔接收與秘密掃描／人工審查、完整物件盤點、Migration 產生、隔離 DB 啟動與重播、函式改善驗證、RBAC Seed、遠端 History 對照均未完成。離線腳本只有啟發式預檢，不能作安全或完整性認證。本階段提交準備工作後停止，等待安全審查檔案及下一階段授權。
