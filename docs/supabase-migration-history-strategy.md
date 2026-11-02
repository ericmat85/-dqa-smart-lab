# Migration History 策略

本次未查詢遠端 History，未執行任何 History 寫入。沒有 Migration SQL。

## 全新環境初始化

後續取得並審查 raw dump 後，產生獨立的可重播 Schema Migration；以本機 Supabase 管理物件為先決條件，僅納入應用自訂物件及明確處理的 Auth 同步補充。RBAC Seed 是後續獨立檔。先在一次性隔離本機重播驗證，再決定正式版本。raw dump 是稽核證據，不能直接當 Migration。

## 既有遠端 History 對齊

既有遠端已存在物件，不能對它重播 CREATE 或 Seed。基準檔進 Git 不代表遠端已套用，也不能宣稱 History 已對齊。將來需另案取得唯讀 History 與同時段 Schema 定義，建立版本對照及差異報告，確認遠端等價於哪一版本。

任何 History 登記／修復都屬遠端寫入，需獨立變更方案、實際差異證據、回復規劃與明確授權。本次不提供可直接執行的 repair / INSERT 指令，不使用 db pull/db push/db reset/migration repair，不藉 CLI 自動初始化 History。

## 正式啟用門檻

- Schema、Auth 與 Event Trigger 證據完整，沒有未處理漂移。
- 所有衍生 SQL、ownership／ACL 調整均經審查。
- 隔離全新環境重播通過，RBAC Seed 與 Auth 同步通過驗收。
- 新環境初始化與既有環境對齊採不同操作手冊；既有環境不得由初始 Migration 直接推送。
- 後續部署權限與 History 寫入另行授權；本 PR 合併不構成授權。
