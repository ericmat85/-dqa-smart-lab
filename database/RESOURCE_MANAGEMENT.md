# 設備、物料台帳與實際使用率

Migration 034 是既有資料庫的增量更新；不可重新套用 001–033。套用前後需比對 migration 雜湊、既有 public 定義及業務資料指紋。它增加 nullable 刪除欄位與查詢／設定函式，不刪除既有資料，也不新增假帳號或範例台帳。

## 刪除

LMS 的設備／物料操作列提供資訊、刪除圖示，保留 aria-label 與 title。刪除需填寫原因，沿用 `prepare_resource_operation` → `execute_resource_operation`，包含權限檢查、版本比對、鎖定、操作回執及稽核。

設備需有 `equipment.manage`；物料需有 `materials.manage`。使用中、暫停／借用中的設備、未結束設備預約或生效中的借用會阻擋刪除；使用中或仍有生效借用的物料亦會阻擋。刪除將設定 `deleted_at`、`deleted_by` 與停用狀態，由 SELECT RLS 從可操作台帳隱藏。歷史外鍵、庫存數量與不可變更的異動紀錄保留；歷史畫面透過受權限限制的 `resource_refs` 取得原編號與名稱。已刪除的資料不可再用一般編輯／狀態命令恢復。

## 物料異動

同一視窗切換狀態變更、入庫、領用出庫。入出庫仍需獨立的 `materials.adjust` 權限，出庫同步扣除可用量與總量，保留庫存異動紀錄；狀態變更不調整數量。借用／狀態限制沿用原後端規則。清單的「單位」直接讀取 `materials.unit`；已有庫存紀錄時仍禁止更換基本單位。

## 實際使用率

預設為過去 30 × 24 小時，至查詢當下截止。只計算 REAL 排程已記錄 `started_at` 的試驗，結束取目前時間、實際完成時間、中止時間與設備釋放時間之最早值，並裁切至統計期間。暫停但設備仍被占用的時間仍計入。未開始、虛擬試驗、保養、校驗及借用不列入試驗使用率。重疊時段使用 PostgreSQL multirange 合併，因此每台設備最高 100%。

`equipment_usage_snapshot` 提供實際秒數、期間秒數、百分比與統計起訖。無法讀取服務時前端顯示「—」，不以 Demo 數字或零取代。

既有「系統管理 → 試驗與設備參數」提供 7／14／30／60／90 天選單。`equipment_activity_v1` 儲存在 `dqa_business.settings`，以 `equipment.manage` 與 `expected_revision` 控制修改。既有儀錶板／排程的預估稼動率起日與天數也存入同份共用設定，原計算方式保持不變。設定的讀寫入口為 `/api/business/resources/settings`，不接受呼叫端指定租戶。未知儲存結果須先重新讀取，不能自動重送。

## 本機驗證

僅使用無網路、無對外埠的合成 PostgreSQL：

```sh
python database/tools/prepare_profile_local.py --directory /tmp/dqa-resource-validation
python database/tests/verify_resources.py --state /tmp/dqa-resource-validation/LOCAL_DATABASE.json --result /tmp/resources.json
python database/tests/verify_resource_retirement_usage.py --state /tmp/dqa-resource-validation/LOCAL_DATABASE.json --result /tmp/resource-usage.json
```

瀏覽器驗證以 `BROWSER_MODE=business` 執行 `resource-management.spec.mjs` 與 `human-flow.spec.mjs` 的相關案例；所有 API／檔案皆使用合成測試資料，不寄信、不呼叫付費模型，也不異動正式案件。
