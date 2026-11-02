# Schema 盤點與證據清單

狀態：所有遠端項目均未驗證。預期 11 roles / 40 permissions / 99 mappings 為使用者提供值。

## 已確認

工作分支 backend/supabase-schema-baseline；本機無 Migration。先前 CLI link 成功。現有 Cloud 的公開 PostgreSQL TCP 路徑不適用；詳見[方案](supabase-schema-baseline-plan.md)。本次沒有遠端操作。

## 待取證（全部未執行）

| 項目 | 所需證據與驗收 |
| --- | --- |
| 連線／工具 | Dashboard Connect endpoint、server/client major、TLS CA、既有唯讀角色有效權限；不存密碼 URI |
| 範圍 | schema、extensions、managed vs custom 物件與 owner 清單 |
| 表／欄位／constraints | type、default、identity、generated、collation、PK／Unique／FK、validation、deferrability |
| Types | enum 值順序、domain base/check/default/not-null、composite attributes、range/multirange 與 extension ownership |
| Partition／Inheritance | 父子關係、partition key/bound、跨 schema parent、普通 inheritance 與 constraints 傳遞 |
| Functions | signature、完整定義、language、owner、SECURITY DEFINER、proconfig/search_path、ACL、PUBLIC/繼承角色的有效 EXECUTE |
| Auth 同步 | auth 自訂 trigger、enabled 狀態、函式 owner、EXECUTE grants、search_path 解析與相依性；不匯出 auth.users 資料 |
| Event Triggers | event、tags、enabled、owner、handler；public.rls_auto_enable() 所有 event trigger 對應，零筆也需留下證據 |
| RLS／Policies | enable/force、command、roles、permissive、USING/WITH CHECK，以及 grant 與 policy 交互效果 |
| ACL／Owner | relation/column/schema/function/type/sequence/database ACL、default privileges、grant option、grantor、owner |
| 全域角色 | 既有角色與 membership 的安全 metadata、繼承與 SET ROLE 路徑；不匯出 pg_authid 或 role 密碼 |
| Publications | publication 設定、tables、schema membership、row filters／column lists（依 server major）；subscriber／replication secrets 不納入 |
| Indexes／views／sequences | expression/partial/unique/invalid index、view options、sequence ownership/config，無當前值資料 |
| 依賴 | pg_depend/pg_shdepend、跨 schema FK、extension managed objects；動態 SQL 另人工追蹤 |
| History | 另行授權後唯讀查詢現有 History；不存在、不足權限與空表是不同狀態 |
| RBAC | 真實 tenant、role、permission、FK／unique、11/40/99 與完整矩陣證據 |

## 完整性限制

pg_dump 不備份 cluster 全域角色、membership 或密碼；物件 ACL 不等於所有有效權限。NULL ACL 是預設 ACL，不能解讀為沒有權限。default privileges 依建立者、schema 與物件類型生效，不追溯既有物件。owner 具有隱含能力，SECURITY DEFINER 依 owner 執行，不能為重播便利盲目去除 ownership。

public dump 不自動納入跨 schema dependencies；catalog 可見性與函式權限仍可能受限。盤點稿涵蓋常見 metadata，不是 PostgreSQL 所有物件的序列化器。任何權限錯誤、UI 截斷、未知類型或缺失均阻擋完整性簽核。

## 人工證據紀錄

每次保存查詢檔 SHA-256、UTC 起訖時間、server version、篩選條件、輸出筆數、退出狀態、截斷檢查、審閱人及去敏紀錄。分片必須有 coverage manifest。不得在證據 manifest 記錄 Token、密碼或完整 URI。
