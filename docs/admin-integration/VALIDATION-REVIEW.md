# PR47 整合回歸：本機證據與限制

2026-11-23，測試程式碼 HEAD `35f40f91c7413db0d3f38e00adf3e38508bc5b25`；其後只補交付文件。基線 `a8537a92eb45634a082e21e4a1b66ea930a7b182`。原始日誌與合成截圖位於 `/workspace/artifacts/pr47-admin-review-20261123/`。所有網路替身、合成租戶、合成報告只在本機；不代表雲端端到端驗收。

## 完成的驗證

| 命令／範圍 | 結果與日誌 |
|---|---|
| `npm run lint` | exit 0，lint-final.log；保留既有及 profile effect 警告 |
| `npm run build` | exit 0，build-final.log；大型 chunk 警告 |
| `VITE_ORIGINAL_BUSINESS=true VITE_BUSINESS_AI=true npm run build -- --outDir <artifact>/cloud-build` | exit 0，cloud-build.log |
| `npm test` | 791 passed、0 failed、0 skipped；最終同程式碼重跑 node-exact-head.log，exit 0（78.5秒），先前 node-final.log亦791通過 |
| `verify_workspace_profile.py` | 真本機 PostgreSQL 17：17 passed，profile-db.json/log；兩租戶隔離、非管理員、版本衝突、預設回退，含16 rollback及1 COMMIT後跨連線讀取再清除 |
| `verify_request_workflow.py` | 真本機 PostgreSQL：40 passed，workflow-db.json/log；既有九階、禁止自審／同人跨階 |
| `verify_human_workflow.py` | 真本機 PostgreSQL：38 passed，human-db.json/log；含報告簽署與封存 SQL，非真 Storage API |
| `npx playwright test --config playwright.admin-regression.config.js --project production-workspaces --workers 1` | 第一批的 admin-center 9、admin-compact-polish 4、admin-navigation-ai-pages 8：共21 passed，production-layout.log；後段舊選擇器失敗另列 |
| 上述 production config 指定 settings-organization-tabs、settings-compact、mobile-reports-settings、workspace-edge-layout 四檔 | 25/25 passed，layout-fixed.log；320–1920、明暗、唯讀角色及原導航。與前列21項合計46個不同情境通過 |
| `npx playwright test --config playwright.original-business.config.mjs` | 修正既有 mock 後13 passed、1載入逾時，business-fixed.log；同一手機 imported legacy 測試單獨重跑1/1 passed，legacy-retry.log。不是聲稱一次14/14全綠 |
| `npx playwright test --config playwright.workspace-access.config.mjs --grep 'cloud organization\|expired recovery email'` | 3 passed、1桌面載入逾時，cloud-profile.log；新 Cloud 設定桌面／手機2/2 passed，保存／重新載入與預覽共用來源。桌面 expired recovery 單獨重跑1/1 passed，recovery-retry.log |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/workspace-profile.spec.js --workers 1` | 2/2 passed，profile-verified.log，exit 0；元件 fixture 的取消／重入、mock重新登入、非管理員、未知保存不重送 |

Python 使用 repo 3.12.14 與標準庫。SQL命令為 `UV_CACHE_DIR=/workspace/.uv-cache uv run --python 3.12.14 --no-project python database/tests/<verify_*.py> --state /workspace/work/admin-integration-replay/LOCAL_DATABASE.json --result <artifact>/<name>.json`；容器 network=none、無 host ports。001–031未改，032無現行PR重號，未讀寫遠端 migration journal。

## 失敗、對照與重跑紀錄

- 初期並行瀏覽器共用輸出目錄造成 trace ENOENT／載入延遲，已中止；改獨立輸出目錄及較少並行，不把中止當通過。
- access-browser-serial.log：45 passed、1 failed、32 did not run（當時78項）；expired recovery 手機逾時。後續 targeted 測試在兩裝置通過，但完整 access/login 全套未重跑。
- business-browser-serial.log：9 passed、5 failed。未修改的精確基線對照 baseline-business.log：2 passed、4 failed，證明4項草稿／revision conflict失敗來自既有 mock 不支援 `/data/requests?id=...`。修正 mock，未改產品委託流程；另一次 portal載入逾時在基線與後續整合重跑通過。
- production-layout.log：21 passed、4 failed、1 interrupted、20 did not run；失敗來自舊「返回系統管理」選擇器。基線已有「管理總覽」tab，更新測試後剩餘25項全通過。
- layout-browser-final.log：2 passed、1 failed、45 did not run，中止的開發伺服器測試；改用 repo 既有 production-workspaces 配置完成上述46項。
- business-fixed 與 cloud-profile 兩次載入逾時的 error-context 都只顯示「頁面載入中」，未改產品或放寬等待，單項重跑通過。環境存在間歇載入不穩定，保留原失敗日誌。
- profile-final.log：2 failed，原因漏指定現有 Chromium 路徑，Playwright 快取瀏覽器不存在；沒有執行產品斷言。後以 repo 支援的環境變數指定 `/usr/bin/chromium` 重跑，見 profile-verified.log。

## 未執行／不可據此宣稱

- 全部 Playwright、完整 access/login 最新80項與全部後端 Python 套件未完整重跑；初期中止結果保留，不宣稱全部測試通過。
- 沒有真認證／登出再登入連到共享雲端DB；瀏覽器以 mock，持久化則以獨立本機 PostgreSQL 驗證，兩者分開。
- 沒有真SMTP、外部模型、真報告／簽章／Storage API、雲端 migration、正式QA發行或合規認證測試。
- OOBE不在此基線，僅契約；未操作另一OOBE分支。
- PR仍未推送；Vercel可能自動部署，GitHub hooks讀取403，Render工作區未確認。詳 DEPLOYMENT-CHECK.md。
