# 管理員流程自動驗收

```sh
npm ci
npx playwright install chromium
npm run test:admin-flow
```

這個指令沿用 CI 的 business 模式，在本機以合成 API 資料跑桌面及小視窗案例，不使用真實帳號、不呼叫模型，也不寫入雲端驗收案件。

- `workspace-admin-acceptance`：同一位工作區管理員送簽、主管核准及兩階 LMS 核准，並驗證一般委託者不能自行核准。
- `request-workflow`：送簽文件與簽名核對、退回補正、版本衝突及防止重複送出。
- `preapproval-workflow`：排程、手填樣品編號、準備檢核及第一階核准限制。
- `human-flow`：預約、接收與下載報告單、完成試驗、上傳報告、報告簽核及 PDF 封存。
- `original-business`：登入、草稿儲存及連線恢復。

這些檔案共 126 個案例；並非每個案例都由同一個管理員完成。原生資料庫的跨階管理員權限與一般角色限制，另由 `database/tests/verify_workspace_admin_acceptance.py` 在隔離資料庫內回滾驗證。

可加上 `-- --project=business-desktop` 只跑桌面，或 `-- --list` 列出案例。原有完整 CI 繼續執行所有版面、導覽及其他功能測試；此指令不跳過或取代它們。GitHub 失敗註記會列出測試名稱與檔案，原始 API 回應及錯誤內容不會寫入註記。

管理員自動排程卡點與同一管理員委外完整驗收，見 [管理員排程與委外驗收](admin-scheduling-outsourced-acceptance.md)。
