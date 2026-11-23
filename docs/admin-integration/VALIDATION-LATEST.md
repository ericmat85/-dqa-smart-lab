# 最終基線更新：PR47 b9dac32

## 版本與整合

- 2026-11-23 最後交付檢查發現 PR47 head 由 a8537a92eb45634a082e21e4a1b66ea930a7b182 更新至 **c5205f994a8b236b21eb5e99b30060622b99ccb9**；main仍為 df2ee6f15aaa7feef9fb0a7ea5fa794bb4c768b8。
- 已在獨立本機分支 `local/pr47-admin-review-20261123` 整合最新head。保留其AI設定、專案委託及所有其他變更。只在兩個共用錯誤碼清單發生文字衝突，採最新遠端清單並加回2個profile錯誤碼與403映射。
- 最新遠端已使用032_project_requests_and_supervisor_email.sql；本功能改為 **033_workspace_profile.sql**，回滾同號。未覆蓋032；既有001–032與最新遠端完全相同。
- 整合程式碼 commit `a92e061ba95d0dd4d46eb22ce11d72cf0d23f51f`；其後 b6485cd 補本機合成Email fixture，285b79c 修復一般草稿保存中編輯，最後交付文件。舊基線已驗證版本另保留在 `local/pr47-admin-reviewed-a8537-20261123`（5360886389acae0c8f2c9be4546da1fc5d68a9d9）。
- 回歸另發現最新head將專案批次的整頁inert套在一般草稿，桌面／手機保存中編輯均失敗；只將 `setProjectSaving` 限於新專案，一般草稿沿用既有draftSaving防重送與新修改保留。原2個失敗測試重跑2/2通過，見draft-preservation.log。
- CSS、AdminCenterCards、package.json/lock、vercel.json、GitHub workflow與**最新遠端**相同；不撤銷最新遠端自己的UI變更。

- 最後再次核對 PR47 更新為 **b9dac32f5e80123c3cc2629d0094236e8cd63404**，僅新增CI安裝Python與cryptography鎖定依賴，無應用程式／SQL變更；已本機整合，保留原樣。最終patch基線為b9dac32。以下c5205f9目錄是相同應用程式版本的測試證據，不代表已執行遠端CI。

## 新基線驗證

原始日誌：`/workspace/artifacts/pr47-admin-review-20261123/latest-c5205f9/`。以下均為本機合成資料；雲端未驗證。

| 範圍 | 結果 |
|---|---|
| npm run lint | exit 0；保留警告，最終 lint-final.log |
| npm test | 824 passed、0 failed、0 skipped；node.log（一般草稿UI單行修正前；該修正另以瀏覽器驗證） |
| npm run build | exit 0；chunk警告，最終 build-final.log；另開啟VITE_ORIGINAL_BUSINESS與VITE_BUSINESS_AI的Cloud build亦exit 0（cloud-build.log） |
| Python business mock | 99 passed；python-business.log。Python 3.12.14，uv --with-requirements render-backend/requirements.lock，unittest discover -s tests -p 'test_business*.py'。無真模型呼叫 |
| 新隔離PostgreSQL準備 | network=none、無host ports，001–033全部成功，prepare-db.log |
| Profile SQL | 17 passed；workspace_profile-verified.json；兩合成工作區、權限／併發、跨連線持久化 |
| 九階委託 SQL | 40 passed；request_workflow-verified.json |
| 人工作業／報告 SQL | 38 passed；human_workflow-verified.json；非真Storage API |
| 新專案委託 SQL | 25 passed；project_requests-verified.json。初跑24通過、1 error：舊fixture缺Email，補合成.invalid地址後通過；不改業務函式／權限 |

管理版面production-workspaces一次46/46 passed（layout.log，含admin-navigation-ai-pages 8項）。瀏覽器回歸：business.log 為12 passed、2 failed（上列一般草稿鎖定差異），修復後draft-preservation.log 2/2 passed；cloud.log 的真頁面Cloud profile 2/2 passed；profile.log 元件fixture 2/2 passed。API為mock，正式登入與真共享服務未接通。新專案瀏覽器 `playwright.request-workflow.config.mjs --grep 'project 70|project lost'` 在修復後4/4 passed（project-browser.log），桌面／手機70項獨立分項與未知回覆重讀不重送。測試命令沿用 VALIDATION-REVIEW.md 的相同配置，但日誌以本目錄為準。

## 邊界與未執行

- 未跑全部Playwright或完整最新access/login套件；本機瀏覽器與PostgreSQL分開驗證，不宣稱雲端端到端通過。
- OOBE不在此基線，未動其他OOBE分支；只保留同份設定的對接契約。
- 沒有真SMTP、真外部模型、真報告／簽章／Storage API或雲端migration；未改正式QA發行或登入規則。
- 未push、未更新PR metadata、未合併PR、未部署或改hosting/CI。DEPLOYMENT-CHECK.md 的Vercel/GitHub hooks403/Render未確認卡點仍有效。遠端自行新增的c5205f9不是本任務推送。
- 最終patch以b9dac32為基線；舊patch只供歷史參考，不能把舊基線無032衝突的結論套用至最新版本。
