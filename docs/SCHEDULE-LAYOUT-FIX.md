# LMS 排程管理桌面版修復

基底：codex/demo-phase2（6b616e3）；修復分支：codex/fix-schedule-layout。

變更僅包含版面 class、表格捲動區與 CSS；未變更狀態、簽核、資料結構或排程業務邏輯。

- ScheduleViews.jsx：全部排程及依人員分組共用的表格外層改為獨立、可鍵盤聚焦的水平捲動 region。
- ScheduleViews.css：限制容器寬度，固定右側狀態／操作欄，長文字換行，保留日期進度欄寬度及一般水平捲動。
- LmsApp.jsx：排程頁加上呈現 class，在右側保留 AI 浮動按鈕的空間；其他管理頁維持原版面。
- e2e/schedule-layout.spec.js：1366×768、1440×900、1920×1080；檢查頁面無水平溢出、表格局部捲動、固定欄位置、編輯可點擊／設備選擇可見、AI 按鈕不遮擋、鍵盤捲動、搜尋、分組與收合側欄。

驗證：123 項 Node 測試通過；完整 E2E 13 項通過；最後 CSS 與截圖另重跑 3 個尺寸通過。lint 0 錯誤，保留原有 4 個 react/purity 警告；build 通過，保留既有大型分塊警告。

瀏覽器環境為 Linux Chromium 的指定 CSS viewport，並非原生 Windows 實機。Windows DPI／縮放與捲軸外觀仍需人工驗收。沒有隱藏整頁 overflow 來掩蓋超寬，也沒有刪除欄位。

此修復 PR 以 codex/demo-phase2 為 base，避免混入未合併的前兩階段。未合併任何 PR 或修改 main。Preview 依既有 Vercel Git 整合產生，不變更存取保護；沒有 Vercel 查詢憑證時不猜測或宣稱已取得 Preview 網址。
