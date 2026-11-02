# Supabase Schema 基準化方案（有條件通過）

日期：2026-11-02（Asia/Taipei）。專案：`mmazbwzdiizabikmiily`。
分支：`backend/supabase-schema-baseline`。本文件只提出方案，未執行遠端 SQL、網路連線探測、匯出、權限變更或 Migration History 操作。

## 1. Codex Cloud 的實際限制

已讀取環境 readiness、設定草稿及 `/etc/codex/network-policy.json`：

- HTTP policy 已 enforced，額外允許 `api.supabase.com`，僅證明 Management API 路徑可用。
- `tcp_connect_proxy` 為 `http://proxy:8088`，但 `tcp_network_access.domains`、`ip_ranges` 皆空；VPN 未設定。
- Cloud runtime 的 networking / VPN 文件明定：8088 raw TCP 需 VPN 與獨立 TCP grant，僅接受解析為 RFC1918 或 100.64.0.0/10 的 IPv4；公開 IPv4 及 IPv6 不能藉此接通。HTTP allowlist 不授權 PostgreSQL TCP。
- 本機 `command -v pg_dump` 無結果，尚需在執行匯出的環境準備 PostgreSQL client。

結論：平台有受限制的 TCP 機制，但目前環境**不能直接使用這個機制連線 Supabase 公開 Direct / Pooler**。不能以「加網域後重試」或關閉 proxy / TLS 解決。未做實際資料庫連線測試。

若組織已有受支援的 VPN 私有資料庫轉送端點，需由管理者確認架構與安全政策，再提供該私有端點的精確主機、TCP grant、VPN 路由與目的地限制；本次沒有這些資料，不假造私有主機，也不建立轉送。修改 grant 需依 runtime 文件建立使用新版設定的替換環境。目前優先採用下述本機匯出方案，不要求修改 Cloud 設定。

## 2. 目的地主機及連線選擇

| 用途 | 主機 | TCP port | 證據與限制 |
| --- | --- | --- | --- |
| Direct | `db.mmazbwzdiizabikmiily.supabase.co` | 5432 | Supabase project-ref 命名格式推導；尚未經 Dashboard 或 DNS 核實。通常預設 IPv6，IPv4 取決於專案方案／設定 |
| Session Pooler | `aws-0-ap-northeast-1.pooler.supabase.com` | 5432 | 從既有 `supabase/.temp/pooler-url` 僅解析 host/port，不輸出密碼或完整 URI；執行前須以 Dashboard Connect 核對 |
| Transaction Pooler | 同區域 pooler（須以 Dashboard 核對） | 通常 6543 | 本方案不選用，避免 dump 所需 session 行為受交易池影響 |
| Management API | `api.supabase.com` | HTTPS 443 | 已允許，但不是 PostgreSQL 連線 |

操作人員在 Supabase Dashboard → 專案 → **Connect** 選 Direct Connection 或 Session Pooler，核對 host、port、database、SSL 要求與自訂帳號的 username 格式。Pooler username 通常為 `<db_role>.mmazbwzdiizabikmiily`；必須確認既有最小權限角色受該 pooler 支援，不能直接改用 postgres 管理者。不要把完整 Connection String 貼到對話、Git 或工單。

在外部本機／受控 runner 的網路，僅允許選定主機 outbound TCP 5432，並確認 IPv4/IPv6 路由、DNS 與 Supabase Network Restrictions 的來源 IP 規則。如現有規則不允許，停止，由管理者另行處理；本階段不修改遠端網路限制。這兩個公開主機即使加入目前 Cloud TCP grant，仍無法解除公開 IP 限制。

參考資料（產品行為需執行時再核對）：

- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://www.postgresql.org/docs/current/app-pgdump.html

## 3. 最小權限與唯讀邊界

使用**已存在**的專用登入角色；若沒有符合條件的帳號，本階段停止，不建立角色或發出 GRANT。理想權限：

- 可 LOGIN、對 postgres database 有 CONNECT、對納入匯出的 schema 有 USAGE。
- 能讀取必要 PostgreSQL catalogs，且對納入 dump 的資料表具足夠 SELECT 權限，以取得 pg_dump 所需 ACCESS SHARE locks。Schema-only 不查詢資料列，但一般 pg_dump 仍會鎖定目標資料表。
- 無 superuser、CREATEDB、CREATEROLE、BYPASSRLS、目標物件 ownership、寫入權限、可 SET ROLE 成高權限角色或其他隱含權限。
- 檢查 PUBLIC / 繼承角色／SECURITY DEFINER 函式可帶來的額外能力；只看直接 grants 不足以證明唯讀。Schema 匯出本身不需要 EXECUTE 應用函式。

SELECT 權限意味著該帳號在其他命令中可能讀到資料；`--schema-only` 是本次命令的資料最小化，不是帳號層的資料保密隔離。不能為了通過 dump 改用 postgres 或賦予 BYPASSRLS。若缺少上述權限，回報缺項，不自動修復。

設定 `default_transaction_read_only=on` 是防誤操作措施，不是不可繞過的授權邊界。唯讀交易也可能取得鎖、耗用資源及留下連線／查詢稽核紀錄；本方案的「不寫入」指不修改應用資料、DDL、角色權限與 Migration History。

## 4. 可操作的本機 pg_dump 流程（本次不執行）

1. 在信任的本機或 runner 安裝與伺服器相同 major 的 `pg_dump` / `psql`，記錄實際版本；client 不得舊於 server。準備服務端信任 CA。
2. 使用系統 secret manager／安全檔案注入 `PGSERVICEFILE` 與 `PGPASSFILE`。檔案權限 0600，不使用含密碼的命令列 URI，不開 shell trace。Cloud 的 Supabase Access Token 不能代替 PostgreSQL 密碼。密碼、username、URI、CA 路徑皆由安全設定提供，不經對話。
3. service 名稱設定為 `dqa_schema_ro`；service 內容包括選定 host、port 5432、dbname postgres、既有唯讀 user、`sslmode=verify-full`、`sslrootcert`、`connect_timeout=10`。密碼放獨立 passfile，勿寫進 service 範本或 Git。不要降低 TLS 驗證。
4. 先以唯讀交易檢查 server version、登入角色、有效權限與 Migration History（僅在有讀取權限時 SELECT），確認不需要臨時角色或連線初始化 DDL。下列範例只顯示安全狀態，不輸出憑證：

```sh
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000'
psql 'service=dqa_schema_ro' -X -v ON_ERROR_STOP=1 \
  -c 'BEGIN READ ONLY; SHOW server_version; SHOW transaction_read_only; COMMIT;'
```

5. 在不屬於 Git 的私人工作目錄匯出 public 的原始 schema，保留 owner / ACL 資訊作為稽核證據。以下不使用 `--clean`、`--create`、`--no-acl` 或 `--no-owner`，也不使用任何資料匯出選項：

```sh
umask 077
pg_dump --dbname='service=dqa_schema_ro' \
  --schema-only --schema=public --format=plain \
  --lock-wait-timeout=5s --file=public.schema.raw.sql
sha256sum public.schema.raw.sql > public.schema.raw.sql.sha256
```

不要把 raw SQL 直接放到 migrations。指令失敗或檔案不完整時保留失敗狀態，不視為有效基準。檢查 stderr、exit code、物件清單及 SHA-256；不可因檔案非空就判定成功。匯出會持有 ACCESS SHARE locks，可能與 DDL 互相等待，安排低負載時段。

6. **Auth 補充**：public dump 不包含定義於 `auth.users` 的 Trigger。以唯讀 catalog 查詢取得自訂 Trigger DDL、觸發函式及相依物件，保存獨立 sidecar。須用 `pg_trigger`、`pg_proc`、`pg_namespace`、`pg_depend` 等追蹤相依性；若函式採動態 SQL，還需人工審閱，catalog 並不保證列出所有依賴。不匯出 auth.users 資料、不重建整套 Supabase 管理的 auth schema。
7. 對原始輸出做秘密掃描及人工審查：函式本文、foreign server / user mappings、defaults、comments、FDW options 可能包含憑證。不能因 schema-only 就認定沒有敏感內容。原始檔僅安全儲存；經審查的基準才進 Git。
8. 在**全新隔離的本機 Supabase DB** 上重播經審查的基準，核對物件、ACL、RLS 與 Auth 同步；本階段只規劃，不啟動 DB 或執行 SQL。依賴管理角色、extensions 與 auth 物件需先由本機 Supabase 提供，不產生全域角色 dump。對遠端零套用、零 History 登記。

## 5. 完整性判斷

| 物件 | schema-only public 的一般涵蓋 | 必須另行確認 |
| --- | --- | --- |
| Functions / procedures | public 的可匯出定義 | 函式 owner、SECURITY DEFINER、search_path、ACL、其他 schema 相依性與動態 SQL |
| Triggers | public 表上自訂 Trigger | auth.users 上的自訂 Trigger 必須另取；內部 constraint triggers 由 constraint 重建 |
| RLS / Policies | 表的 RLS enable/force 及 policies | USING / WITH CHECK、command、permissive/restrictive、目標角色完整比對；不要只查 information_schema 可見子集 |
| Grants | 預設保留物件 ACL 與適用的 default privileges | 不含全域登入角色／membership 定義；跨 schema 權限與預設 ACL scope 另核對 |
| Indexes | 索引與表 constraint 定義 | constraint-backed indexes、partial / expression / unique、invalid indexes 狀態、extension 管理物件 |
| Foreign Keys | public 表上的 FK | 跨 schema 被參照物件不會因 `--schema=public` 自動全數納入；驗證 deferred/validated 等屬性 |

唯讀帳號可以取得多數 DDL catalog 定義，不需成為 owner；但不能保證任意唯讀帳號取得所有物件，也不能保證 public 篩選涵蓋所有相依性。任何 permission denied、物件數量落差、extension 管理物件、受限制 catalog 都列為未完成。驗收比較定義及 scope，不只比較物件數量。`--no-acl` 會丟失 grants，`--no-owner` 會影響 owner 及 SECURITY DEFINER 語意；如需可攜化，只能在審查過的衍生 Migration 中明確處理。

## 6. 不具 TCP 時的 Dashboard 替代方案

首選仍是在可連線的本機透過 Dashboard Connect 取得連線設定後執行 pg_dump。不能假設 Dashboard 存在一鍵完整 schema-only SQL 下載；Table Editor 的 CSV 匯出是資料，不符合本任務。

若只能使用 Dashboard，操作人員可在 SQL Editor 手動執行本分支提供的 `docs/supabase-readonly-catalog-inventory.sql`。它以 READ ONLY 交易 SELECT catalogs，回傳物件定義和屬性，不查 auth.users 資料或呼叫應用函式。檢查腳本後手動執行，將結果透過 UI 的結果下載功能（若可用）保存；若無下載功能則以安全檔案保存結果。不要選取或匯出資料表內容。此處不由 Codex 執行。

此 catalog 結果是**重建與比對材料，不是完整 pg_dump**：表欄位的 type/default/identity/generated、constraints、indexes、functions、triggers、RLS、ACL、sequence 等分項列出，還可能缺少 partition、views 的完整 CREATE wrapper、extensions、custom type、collation、publication、FDW 等 DDL。需另行補齊後才可稱完整 Migration；不能將查詢輸出直接串接為 SQL。

交付檔應經本機檢查、去除敏感內容，再以安全附件交由 Codex 產生候選 Migration、列出缺漏，在隔離本機還原驗證。若無法取得必要定義，結論維持「基準不完整」，不要補猜 SQL。Supabase 平台的 managed backup 可能含業務資料與 Auth 密碼雜湊，不能當作本次 schema-only 附件上傳。

## 7. RBAC Seed Migration：獨立交付

預期值為 11 種應用角色、40 項權限、99 筆角色權限對應，尚未遠端核對。這些是應用表資料，不是 PostgreSQL 全域登入角色，schema-only 不包含任何資料列。

1. 先從唯讀 Schema 盤點確認實際表名、主鍵、唯一鍵、FK、租戶／系統預設資料區分；不假定表名。
2. 另行核准後，以最小 SELECT 權限僅擷取這三類系統參考資料的欄位白名單。排除 users、profiles、user-role assignments、email、密碼、token、session、測試帳號與租戶敏感資料。
3. 在同一唯讀一致性快照中核對 11/40/99，檢查重複碼、孤兒 FK、缺少 permission code 與權限矩陣。僅數量相同不足以證明內容一致；需核對所有角色、權限碼及對應集合。
4. 使用後續獨立的 `<timestamp>_rbac_reference_seed.sql`，以穩定業務 code 對應 ID；若 UUID 為語意必要則保留。順序 roles → permissions → mappings，尊重真實 FK。衝突時明確失敗或核對內容，不用盲目 DO NOTHING 掩蓋落差、不刪除不明資料。
5. 先在隔離本機驗證計數、矩陣、RLS 與 Auth 同步功能。此 Seed 只作未來全新環境重建候選，不在既有遠端執行；既有遠端 History 基準登記另案處理。

## 8. 交付與風險門檻

預定交付：經審查的 public Schema Migration、自訂 Auth Trigger / Function 補充、物件比較 manifest、原始證據雜湊與工具版本、獨立 RBAC Seed（另案取得安全資料後）。目前 Migration 檔仍為 0 個。

主要風險：Cloud 公開 TCP 不通；現有唯讀帳號與權限未確認；Direct endpoint 尚未核實；鎖與 dump 時間；跨 schema / extension 相依性遺漏；SECURITY DEFINER owner 改變；ACL 角色缺漏；DDL 內硬編碼秘密；Dashboard 輸出截斷或不完整；匯出期間並行 DDL 造成多份證據不一致；Schema 與 Seed 不同快照；11/40/99 尚未證實。

每個風險必須有對應證據才能解除。遠端不執行 `db pull`、`db push`、`db reset`、`migration repair`，不建立／修改角色、資料表、權限或 History，不更改環境網路設定。本次僅新增操作文件及供人工審查的唯讀查詢稿。


## 審查決議與文件索引

本方案有條件通過；本次只交付文件及未執行的查詢稿，完成 PR 後停止。所有先前 catalog 查詢均未執行，CLI link 不構成資料庫讀取或 Schema 完整性證據。

- [盤點與證據清單](supabase-schema-inventory-checklist.md)
- [Migration History 策略](supabase-migration-history-strategy.md)
- [RBAC Seed 方案](supabase-rbac-seed-plan.md)
- [隔離重播驗證](supabase-schema-validation-plan.md)
- [查詢索引](supabase-readonly-catalog-inventory.sql)：每個檔案可獨立執行，只有 SELECT catalog 與唯讀交易設定。

### 執行限制補充

包含自訂 Event Triggers，特別追蹤 public.rls_auto_enable()。Event Trigger 的查閱與未來還原權限可能超出一般帳號；不能擴權解決。其全域 DDL 行為須在隔離環境評估，避免重播時改變其他物件的 RLS。public 篩選不代表完整資料庫備份。

所有 catalog 檔案以註解中的 schema / name 篩選縮小範圍。若結果可能截斷，按 schema、物件名稱區間或 OID 範圍再拆分，記錄分片範圍與總數，勿依賴 Dashboard 隱含列數上限。各查詢獨立交易不共享快照，需人工確認盤點時段無並行 DDL，否則重取相關證據。

### 匯出保護

原始 SQL、CSV、JSON、stderr 與 manifest 均置於 Git 外私人目錄或 repository 的 supabase/private-exports/，目錄 0700、檔案 0600，以安全儲存／加密傳輸並約定刪除期限。不要上傳完整 managed backup。新增 Git ignore 保護本機連線中繼資料、passfile 與原始匯出區；ignore 不能保護已追蹤檔或任意命名的秘密。

先使用組織核准的秘密掃描器（輸出避免顯示秘密），再人工檢查函式、comments、defaults、FDW options、ACL 中的身分資料；零警報不代表零秘密。發現秘密時隔離原始證據，不將值寫入報告或 PR。原始證據不可原地刪改，另產生經審閱的衍生版本與變更紀錄。SHA-256 只能證明檔案一致，不能證明安全或完整。

尚未產生 raw dump、Migration 或 Seed SQL；不為滿足文件建立空白 Migration。
