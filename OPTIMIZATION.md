# 本次優化與還原

## 修改內容

- 共用示範帳號讀取：第一次直接開啟委託或實驗室也能使用預設帳號，不必先開 LMS。既有帳號清單不會被新增的預設帳號覆蓋。
- 新環境提供 requester@example.com、supervisor@example.com、level1@example.com、level2@example.com；實驗室使用 chen@example.com。示範密碼皆為 demo1234。已有帳號資料的環境請使用原有帳號或由管理員建立。
- LMS 本機案件的簽核、簽名及歷程保存於新的 dqa-lms-reviews-v1 儲存鍵。電子委託的正式審查與回寫仍待串接。
- 第一階僅一階主管可審查，第二階僅二階主管可審查；保留不可自行／重複審查限制。
- LMS 簽核儲存失敗顯示提示與重試按鈕。
- 整理未使用變數與 Hook 依賴。

## 還原程式版本

備份在 backups/before-optimization-20261028/project.zip，包含修改前的原始碼、設定與 public 資源；不包含 node_modules、dist 或瀏覽器資料。

先停止開發伺服器，再在專案目錄的 PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\backups\before-optimization-20261028\restore.ps1
npm.cmd run build
```

這會覆蓋還原原有檔案；本次新增的模組、測試與說明會留下，但舊版程式不會引用新模組。若使用預覽／部署版本，需使用還原後重新建置的 dist。

還原不會清除瀏覽器既有資料。新增的 LMS 儲存鍵在舊版不會使用。此備份是程式版本備份，不是瀏覽器資料快照。

## 驗證

```powershell
node --test tests/optimization.test.mjs
npm.cmd run lint
npm.cmd run build
```

測試涵蓋分階權限、簽核與簽名保存、儲存失敗、匯入清單合併、首次入口帳號與既有帳號保留。尚未做瀏覽器端到端驗證。

帳號管理的自訂密碼介面、其他模組的儲存錯誤處理，以及完整跨系統流程留待後續調整。
