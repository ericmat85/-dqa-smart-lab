# A 接收／展示資料庫導入介面
本次只交付資料與 pure staging Adapter；未操作 A 的 IndexedDB/localStorage。不同工作區不假設共用 /workspace。
1. 接收 competition_ai4_demo_dataset_v1.json、raw/*.json、catalog-snapshot.json、photo_asset_requirements_v1.json、request-report-crosswalk.* 與 SHA256 Manifest。先核驗精確位元組、ID 唯一與 Catalog hash。A 的現行 Catalog 若與此 snapshot 不同，停止受影響導入，不自動補建類型。
2. a_import_adapter.prepare_import(dataset) 是純函式：回傳 schemaVersion d-ai4-staging/1.0，requestRows/requestDetails/testResults/reportDraftRows/reportSections/photoRequirements，writesPerformed=false。data/a_staging_import_v1.json 已保存其結果，A 可不用執行 Python而讀取 JSON。它不是 Public DTO、IndexedDB 升級或資料庫 migration。
3. requestRows 投影既有可辨識欄位 id/history/testItems/requester/ownerId/project/product/productCode/quantity/specification/judgementCriteria/status；judgementCriteria 僅把隔離結構化規則轉成標明 SYNTHETIC 的顯示字串。完整原值/樣品/設備/日期/工程師/方法仍在 requestDetails；不可只保存顯示字串而丟棄原始規則。所有id使用SYNTH命名空間；衝突時拒絕，不覆寫既有案件。
4. 此 D 本地產品來源 src/requestStorage.mjs 接受 id:string/history:array 的 request rows，key dqa-lms-reviews-v1；這只是唯讀觀察，非本輪寫入授權。A 必須依自身目前版本的既有授權 Import/Seed 入口處理。SYNTH requester/owner/engineer IDs 不代表現有帳號，不自動取得角色或簽核權。
5. reportDraftRows 是待渲染資料，不能直接當 src/reportStore.mjs 的正式報告。現有 IndexedDB dqa_lab_demo_reports v2 stores reports/reportIndex，以requestId為key；reportWorkflow/reportMetadata依賴Excel bytes/check/stage/revision/signatures等。D 不偽造這些欄位、不調用 saveReport/replaceReportSet、不宣稱reportIndex已接合。A 需另行授權的 staging store 或 isolated renderer adapter；不可硬塞 level2/view/archived 或偽簽名以展示。
6. 以 requestId join requestDetails/testResults/reportDraftRows；以 reportId join reportSections/photoRequirements。sections.page 排序，table measurementIds/chart.sourceMeasurementIds均回查同一rawMeasurements；圖表不得另建不同數值。coreDraftData是E3實際輸出，不能覆寫原始量測、PASS/FAIL或Excel原判。
7. A 製作SETUP/DURING_TEST合成圖片並映射assetId，未完成時顯示「待製作合成圖片」，不可冒稱照片已存在。需實際驗證字體、中文、圖片尺寸、長表格及頁面溢出；D僅提供2..5頁內容分組，非PDF頁數驗收。
8. 九階清單只作展示導覽標籤，不是已執行狀態歷史。所有Request草稿、報告待人工審核、空簽章。A應讓已授權Demo使用者透過原九階流程與原權限操作；禁止AI自動核准/簽核/排程/結案。D未驗證A UI全流程。
9. 本輪禁止Git/Push/部署，故無遠端交接或A導入回執。A須實際取得檔案、核驗Manifest並回報接收，再依自身授權整合；此交付不是正式B-D Handoff。
