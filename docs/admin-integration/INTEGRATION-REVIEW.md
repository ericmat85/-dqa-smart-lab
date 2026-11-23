# PR #47 本機整合檢查

## 遠端基線（2026-11-23 唯讀核實）

- origin: https://github.com/ericmat85/-dqa-smart-lab.git
- main / PR base: df2ee6f15aaa7feef9fb0a7ea5fa794bb4c768b8
- PR #47: open、未合併；head branch preview/i-e4-live-20261112
- PR head: a8537a92eb45634a082e21e4a1b66ea930a7b182
- 原交付: e5bbfab15ccb0d02e577af55839033a5de047965
- 獨立整合分支: local/pr47-admin-review-20261123
- worktree: /workspace/work/pr47-admin-review-20261123

以最新 head 建立新 worktree，cherry-pick 原交付成功，無衝突。最初整合 commit 625921b9cfe10c2a9a0b159af8df5d666c6e023a 與 e5bbfab tree 完全相同（868ad9ebfdff55ac0111b8d0d300c61a8783eb96），無其他遠端新增變更遺失。

## 額外找到並修正的相容性問題

1. 第一版移除了 Demo 組織名稱的原本本機編輯入口。改為只有 Cloud 隱藏舊入口；Demo 保留原編輯、儲存及摘要。Cloud 仍只有 workspace_profile_v1 作為共用資料，沒有從 Demo store 讀取或寫入共用設定。
2. 六份既有管理／手機／版面測試仍硬編碼 13 張卡；基線已經有 14 模組（安全與維運 5 張）。只更新數量斷言，不刪模組、不放寬大小／角色／資料不變斷言；舊返回按鈕選擇器改為基線已存在的「管理總覽」頁籤，仍驗證回到原頁。
3. 管理總覽原本仍讀 Demo 名稱。Cloud 總覽現讀同一 profile API 的顯示名稱與時區，讀取失敗不回退為 Demo 名稱；Demo 保留舊標題來源與版式。載入身分變更有回應隔離；保存中禁用日期／時區選擇。
4. 增加真實原管理頁路由的 Cloud 模式瀏覽器測試（mock API）：確認舊 Demo 編輯器隱藏，共用實驗室保存／重讀及文件預覽讀相同資料，不寫帳號服務。

5. 原委託 E2E mock 未支援基線已使用的 `/data/requests?id=...` GET/PATCH。未修改基線的對照重播在桌面／手機重現相同 4 項草稿／衝突失敗；只更新測試 mock 路由以對齊現有 API，不改原委託或業務流程。

## Migration 與 UI 邊界

最新遠端 migration 到 031；本機新增 032_workspace_profile.sql，沒有重號，沒有新舊函式同名衝突。032 只新增兩個 profile RPC，沿用原 settings 表、權限函式及稽核觸發器；所有既有 001–031 SQL 不變。未讀寫遠端 migration journal，也未整合其他 OOBE 分支。其他未合併分支不在此核實範圍，未來仍需核對序號。

CSS、AdminCenterCards.jsx、vercel.json、.github workflows、package.json／lock 均與 #47 head 一致。新增內容只在既有管理頁的小區；原選單、卡片、角色入口和流程不重新排列。套件版本、日期與時區僅展示；不改排程時間、簽核人數、自審限制或報告發行。

## 推送狀態

**未推送、未更新 PR metadata、未部署、未合併、未執行遠端 migration。** 不部署證據不足，詳 DEPLOYMENT-CHECK.md。Render 工作區確認仍待回覆；GitHub hooks read 回覆 403。不可把本機測試通過視為允許帶部署副作用的推送。
