# PR #47 更新但不部署：唯讀盤點

查核日期：2026-11-23。最新PR head為b9dac32f5e80123c3cc2629d0094236e8cd63404；其新增CI Python依賴安裝仍不含deploy步驟，Vercel repo設定未變。不把他人遠端更新當成不部署證據。沒有 push、PR metadata 寫入、hosting 設定修改、CI 修改、部署、合併或遠端 migration。

## 結論

**目前沒有足夠證據證明推送 #47 branch 完全不觸發部署，因此不得推送。**

### Vercel

- 已用 repository ID 1438541420 查得 project `prj_TAZHkzDy30IAqfYfiXsEHQJaChiA` / `dqa-smart-lab`、team `team_xtpIQVjjUfSqRS2GPO1BekcS`。
- 唯讀 project/deployment metadata 確認現有 Preview `dpl_GUjMcNrV9PfWGAbWwhb3cUiQHypK` 為 READY，Git ref `preview/i-e4-live-20261112`、SHA `a8537a92eb45634a082e21e4a1b66ea930a7b182`。這只是既有部署證據，不是本次新部署。
- repo `vercel.json` 只設 `git.deploymentEnabled["preview/i-render-backend-*"]=false`，沒有匹配 #47 branch。
- [官方 Git Configuration](https://vercel.com/docs/project-configuration/git-configuration) 說明未指定分支預設 true；因此 repo 目前沒有提供 #47 的不部署保證。project 工具投影未回傳完整 Git/ignore-build/dashboard 設定，不能把缺少欄位當成停用。
- 沒有修改 vercel.json、專案設定、團隊部署或私人保護，也沒有存取站點或建立分享連結。

### GitHub Actions 與其他 webhook

- 唯讀 Actions API 回傳 1 個 active workflow：`Demo checks`，`.github/workflows/checks.yml`，ID 400841805。
- workflow 觸發為對 main/codex/demo-mvp-nov6 的 pull_request 與 workflow_dispatch；內容是 npm lint/test/build、Playwright 和失敗 artifact 上傳，未見部署命令。
- repository hooks 清單 `GET repos/ericmat85/-dqa-smart-lab/hooks` 被 GitHub integration 回覆 **403 Resource not accessible by integration**，不是空清單。無法排除 repository webhook、GitHub App 或組織層整合的部署；未繞過、重試同一拒絕或讀取秘密。
- 查核使用者訊息後沒有新的 webhook 權限證據，未重試拒絕動作。
- [GitHub 官方 skip-workflow 文件](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs) 的 skip 指令只適用指定 Actions 事件，不是所有 webhook/hosting 的全域停用；未使用 skip-ci 當成部署保證。

### Render

- connector 回覆 no workspace selected；清單僅有 `My Workspace` / `tea-dbo88o5g1s2s73efjb4g`。
- 已詢問使用者確認是否為 DQA 工作區，確認前不自行選擇或列服務，故實際 linked branch/autoDeploy/buildFilter/preview 設定尚未核實。
- [Render 官方 Deploys](https://render.com/docs/deploys.md) 說明 linked branch 的 push 預設可能自動部署；支援 `[skip render]` 等 per-commit skip。這只描述 Render 行為，不證明本專案設定，也不能阻止 Vercel 或其他 webhook。

## 尚需的證據

- 已確認 DQA 的 Render workspace 及服務 linked branch、自動部署／預覽設定。
- 能列出 repository/organization/GitHub App deployment 觸發的唯讀權限或可信管理者設定證據。
- 對 #47 branch 有效且可驗證的 Vercel 不部署條件。若需要改 hosting/branch config，須另有明確授權；本次未修改。

目前動作：保留完整本機整合與測試證據，PR #47 遠端未更新。
