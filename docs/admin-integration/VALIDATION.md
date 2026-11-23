# 本機驗證紀錄

基線 a8537a92eb45634a082e21e4a1b66ea930a7b182；所有資料為合成。未寄信、未呼叫外部模型，未連雲端資料庫、實際 Preview 或正式站。

| 驗證 | 最終結果 | 界限 |
|---|---|---|
|npm run lint|exit 0|有既有警告；新增 WorkspaceProfileSettings 的同步載入狀態 effect 也有 react/set-state-in-effect 警告，非零錯誤|
|npm run build|exit 0|保留既有大型 chunk 警告|
|npm test|791/791 通過，0 失敗、0 跳過|最終完整 Node/API 測試，包含新增 4 項|
|node --test tests/workspace-profile*.test.mjs|4/4 通過|純函式及本機 HTTP，upstream MockTransport；串流 JSON、session tenant、注入、跨來源、版本衝突|
|e2e/admin-navigation-ai-pages.spec.js|8/8 通過|桌面／手機、明暗、原卡片／導航、四引擎、簽名、角色；所有非本機網路阻擋|
|e2e/workspace-profile.spec.js|2/2 通過|瀏覽器元件 fixture + mock API，取消／重入／重新登入、共用抬頭、非管理者唯讀、讀取失敗、未知寫入不重送|
|database/tests/verify_workspace_profile.py|17/17 通過|真 PostgreSQL 17，兩合成租戶，16 個 rollback 測試及 1 個 COMMIT 後斷連重讀測試；後者清除合成設定但保留稽核|
|database/tests/verify_request_workflow.py|40/40 通過|本機 SQL，九階前段、禁止自審／同人跨階、授權與文件版本|
|database/tests/verify_human_workflow.py|38/38 通過|本機 SQL，排程／接收／完成／報告／簽署／查閱與封存，測試交易全回滾；不是 Storage API 實測|
|全新容器重播 prepare_profile_local.py|001–032 成功，17/17 profile 測試再通過|第二個 network=none 隔離容器，無 host ports|
|git diff --check|通過|無 whitespace 錯誤|

## 曾遇到的失敗與處理

- 導覽測試初跑 4/8 失敗：硬編碼卡片 13，實際基線已是 14。核對 git show 基線後修正為 14；不移除功能或放寬角色檢查。重跑 8/8 通過。
- 原本 prepare_local 只建 001–003，後續 migration 012 缺 storage.buckets，014 缺 service_role。僅在隔離測試容器補平台替身後 004–032 全部成功；新增 prepare_profile_local.py 讓同樣條件可重播。
- 舊平台 fixture 未驗證 synthetic Auth email，委託回歸最初 24/40 失敗、報告 38/38 失敗。補合成使用者與 memberships.login_email 一致的已驗證資料後委託全過。報告另缺新版 Auth banned_until 欄位；補測試欄位後 38/38 全過。未改任何業務函式或削弱驗證。
- Supabase CLI migration new 嘗試失敗，未用 CLI 操作任何資料庫；採 repo 原 SQL migration 方式交付。資料層使用官方函式授權建議檢查 search_path、ACL、既有身份與管理員判斷；沒有跑遠端 advisor。

## 未跑／未宣稱

- OOBE 不在基線，只有對接契約，未執行其他分支 OOBE 測試。
- 真實登入服務／跨瀏覽器共用 API 與正式資料庫未連線。瀏覽器重新登入是 mock 切換，DB 跨連線持久化則在隔離 PostgreSQL 實測；兩者不冒充正式端到端。
- 未跑完整全部 Playwright、全部後端 Python 套件、真 SMTP、外部 AI、真 Storage／簽章／報告 API、合規認證或 production QA 發行。
- 日期與時區不改舊畫面／排程；品牌未持久化為正式範本，未提供 logo 上傳。雲端是否存在 032 尚未驗證，本次未套用雲端 migration。

## 重跑指令

```sh
UV_CACHE_DIR=/workspace/.uv-cache uv run --python 3.12.14 --no-project python database/tools/prepare_profile_local.py --directory /tmp/new-isolated-profile-runtime
UV_CACHE_DIR=/workspace/.uv-cache uv run --python 3.12.14 --no-project python database/tests/verify_workspace_profile.py --state /tmp/new-isolated-profile-runtime/LOCAL_DATABASE.json --result /tmp/profile-results.json
UV_CACHE_DIR=/workspace/.uv-cache uv run --python 3.12.14 --no-project python database/tests/verify_request_workflow.py --state /tmp/new-isolated-profile-runtime/LOCAL_DATABASE.json --result /tmp/workflow-results.json
UV_CACHE_DIR=/workspace/.uv-cache uv run --python 3.12.14 --no-project python database/tests/verify_human_workflow.py --state /tmp/new-isolated-profile-runtime/LOCAL_DATABASE.json --result /tmp/human-results.json
npm run lint
npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/admin-navigation-ai-pages.spec.js e2e/workspace-profile.spec.js
```

Python 固定 3.12.14，只用標準庫，無 requirements/CI 修改。e2e fixture 是獨立元件驗證頁，不代表產品頁面或正式登入 UI；本機合成報告截圖已人工查看。
