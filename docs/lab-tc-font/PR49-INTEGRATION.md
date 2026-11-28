# PR #49 字型整合（2026-11-25，Asia/Taipei）

依使用者「先把字體套用到 PR49」更新現有 PR，未合併 main、未操作資料庫或呼叫部署工具。

- 精確整合基準：`3dce31e178cf5867806d154c6e0821ef204ff378`。
- 原始字型提交：`f12b67853bc87b984da0947ae91371c9f2beb5c5`，無衝突 cherry-pick；保留 PR49 既有搜尋列與管理版面變更。
- main 保持 `eb71006ce80259e1cb7889556d395cef5aa13f41`。
- 變更仍限定 lab 繁中字型、字型資產、專項測試及說明，沒有改 workflow、部署設定、PDF 字型或業務邏輯。

本輪整合驗證：

- `npm run build`：通過，既有大 chunk 警告保留。
- `npm run lint`：exit 0，92 個既有警告；相較前一基準新增的警告來自 PR49 既有變更，未修改無關程式。
- `BROWSER_MODE=demo PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/lab-tc-font.spec.mjs e2e/lab-dashboard-v2.spec.js`：13/13 通過（1.1 分鐘）；涵蓋字型實際渲染、表單 shadow DOM、portal、其他入口隔離、深淺色版面與取消核准流程。
- 原先 17 項 labOperations／nineStageSeed 本機結果保留於 VALIDATION.md，本輪未重跑；業務邏輯沒有變更。

部署邊界：沿用 vercel.json 既有 `preview/i-render-backend-*` 的 `deploymentEnabled: false`。提交訊息加入 `[skip render]`，使用 [Render 官方文件](https://render.com/docs/deploys#skipping-an-auto-deploy) 的逐提交略過方式，不改服務設定、不略過 GitHub CI。Render connector 尚未選工作區，未擅自選擇或修改；未宣稱已盤點所有外部 webhook。PR 更新不是新版 Preview 部署驗收，既有 Preview 仍可能是較早版本。

先前 README／VALIDATION 為原始本機交付紀錄；此文件記錄最新 PR 整合，優先用此處基準解讀本輪結果。遠端 CI 以 PR checks 當下結果為準。
