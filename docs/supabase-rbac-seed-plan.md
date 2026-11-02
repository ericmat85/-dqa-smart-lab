# RBAC Seed 獨立規劃

尚未讀取資料，無 Seed SQL。11 種角色、40 權限、99 筆映射是待驗證預期值，不是現況結論。

## 先決資料模型證據

先取得實際 Tenant、Role、Permission、Role-Permission 關係、欄位型別、主鍵、FK、unique、nullable、defaults、RLS。確認 role code 是否 tenant-scoped、permission 是否全域、mapping 是否含 tenant；確認 unique key 是否包含 tenant_id、是否允許系統 tenant，以及軟刪除／partial unique index 的效果。未確認前不假定表名或 ON CONFLICT key。

確認 11/40/99 指全域、系統 tenant 或每個 tenant；不能把某個真實租戶資料當系統種子。資料取得另行授權，以同一唯讀快照做欄位白名單匯出，不含帳號、profiles、user-role assignments、email、密碼、session、token 或客戶識別資料。

## Seed 設計

先按真實依賴建立系統 Tenant（僅在確認它是可版本化參考資料且獲授權時），再 Role / Permission，最後映射；順序以實際 FK 決定。Tenant 若屬營運資料則由環境設定提供，不在 seed 植入真實 tenant ID。

依實際 unique constraints 選穩定業務 key，或在必要時保留經審查的 UUID。避免跨 tenant key collision。遇到既有 code 但內容不同則明確失敗，不用盲目 DO NOTHING 或 upsert 覆蓋。重複執行行為須明確規定；版本 migration 不要求任意重跑成功，但 fixture 可設計為先檢查相同再跳過。

## 驗收

核對同一 scope 的 11/40/99、所有 codes 與完整 mapping 集合，檢查重複、孤兒、跨 tenant FK、未授權擴權、unique constraints 與 RLS 互動。使用合成使用者與合成 tenant 在隔離本機測正負案例，不使用正式 Auth 帳號或密碼。Seed 只作全新環境初始化；不對既有遠端重放或改寫其資料。
