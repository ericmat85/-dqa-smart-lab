# 實驗室資訊與列表版面修正

2026-11-04。僅前端調整；保留既有未提交的 LMS 管理中心工作，未推送、合併或部署。

## 本次修改

- `src/EquipmentPage.jsx`：實驗室唯讀設備狀態與 LMS 一樣預設「使用中」，維持唯讀限制及原有清除／切換篩選操作。
- `src/RequestInfoModal.jsx`：初始焦點指定關閉按鈕，避免說明圖示自動展開；開啟時內容從頂部顯示；保留 Escape、Tab 焦點循環與關閉後焦點還原。
- `src/RequestApp.css`：流程測試區塊增加內距，移除第一個報告區上方多餘間距。
- `src/SignatureInput.css`：共用簽名歷程增加一致內距，縮減記錄與圖片間距，支援深色及窄螢幕。
- `src/LabApp.jsx`、`src/LabWorkspaceExpansion.css`：操作歷程改為緊湊列表；完整簽名點選「查看簽名」後展開，保留資料與下載。
- `src/ReportArchive.css`：資料庫委託編號移除額外按鈕外框及內距，保留連結操作與鍵盤焦點。
- `e2e/request-information-layout.spec.js`：新增深淺色的初始篩選、簽名展開、列高、資訊視窗焦點／捲動／內距及資料庫編號互動驗證。

## 驗證

- `npm run lint`：通過。
- `npm run build`：通過；既有大型 chunk 警告仍存在。
- `npm test`：47 個測試檔案通過，0 失敗。
- Playwright：既有資料庫分類 3 案、實驗室設備／物料與 RWD 6 案、新增資訊視窗 2 案，合計 11 案最終通過。初次執行新增測試的定位與焦點寬度斷言已修正並重跑通過。
- `git diff --check`：通過。

截圖：[淺色](light.png)、[深色](dark.png)。僅假資料。

本次未改動狀態機、簽核與權限判斷、資料格式或正式環境。未重跑全部端對端測試；實際部署環境尚未驗證。
