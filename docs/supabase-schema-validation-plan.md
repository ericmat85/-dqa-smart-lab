# 隔離本機重播與定義比對計畫

本文件是未執行的測試設計；沒有啟動資料庫或執行查詢。

## 前置條件

取得完整且經秘密掃描／人工審查的原始證據、manifest、server major 與 extension versions。使用一次性 local Supabase stack，版本與遠端相容；不載入遠端 URI／憑證，不使用正式資料、帳號或密碼。確認 target 僅 loopback／隔離 Docker network，且沒有任何到遠端 DB 的連線路徑。任何 Docker 操作前遵循 Cloud runtime Docker 技能；本階段不執行。

## 重播步驟

1. 啟動全新一次性本機 stack，先保留其 managed auth/storage/extensions 基準。
2. 審查候選 Migration 的 owner、ACL、search_path、全域角色引用、跨 schema dependencies 及 Event Trigger 時序；不重建 Supabase managed 物件。
3. 用本機管理者在本機重播 Schema，再套用獨立 RBAC Seed；執行時明確確認資料庫 hostname、port 及 database 為隔離目標，錯誤即停止。與正式遠端 History 無關。
4. Event Trigger 特別測試：盤點 public.rls_auto_enable() 定義、event/tag/enable 狀態與 owner；在本機合成 schema/table 上測試觸發效果與 RLS，確認不改變預期 ACL/policy。需要高權限時只限本機，不能因此擴大遠端權限。
5. Auth 同步以本機合成 Auth 使用者測試新增及其他實際支援的事件；核對同步內容、錯誤／重複行為與 tenant scope。測試角色／權限的允許與拒絕案例，不將 auth.uid() 或 SET ROLE 模擬當作完整應用驗收替代。
6. 完成後刪除一次性 stack 與合成資料，保留去敏測試結果與 manifest。

## 定義比對方法

在來源的已審查證據與本機使用相同 catalog 查詢／相同 pg_dump major。以 schema + object kind + qualified name + function identity arguments 作穩定 key，不使用 OID 跨環境比對。比較欄位順序／型別、defaults、constraints、indexes、RLS/policies、trigger enabled、event/tags、函式本文與 owner／SECURITY DEFINER／search_path／EXECUTE ACL、type enum 順序、domain checks、partition/inheritance、publication 與 default privileges。

ACL 展開為 grantor/grantee/privilege/grant-option 集合，保留 PUBLIC、owner 與 NULL-ACL 預設語意；role membership 另比對。SQL 僅正規化無語意格式和 dump 隨機標記；不能排序 enum 值、刪除函式設定或把所有 owner/ACL 差異忽略。若 pg_dump 版本導致文字差異，人工比較語意並留下理由。

物件 counts 與 SHA-256 為輔助；定義等價才是門檻。managed baseline 差異、extension 內部物件與允許的環境參數需逐項列入明確 allowlist；不採用整個 schema 的忽略規則。

## 正式 Migration 啟用前驗收

- coverage manifest 無缺片、截斷或 permission denied，所有必要物件與跨 schema／動態依賴有證據。
- raw evidence 安全保存，衍生 Migration 已掃描並人工審閱，沒有憑證或敏感資料。
- 全新本機從零重播成功，物件定義比較無未解釋差異。
- Auth 同步、Event Trigger、RLS 與 RBAC 正負案例通過；11/40/99 scope 與完整矩陣核實。
- 全域角色與 owner/ACL 前提列明；不以擴大遠端權限補洞。
- 既有遠端 History 仍另案處理；本次沒有對齊或部署授權。
