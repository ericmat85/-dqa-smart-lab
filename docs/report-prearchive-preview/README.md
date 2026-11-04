# 委託者主管結案前預覽

在「確認查閱並封存」旁新增「預覽 PDF」，限既有 canConfirmReport 授權的案件主管與待查閱階段。可展開／收合委託單及已簽核報告的唯讀版面，使用相同簽核版本與既有報告讀取權限檢查。

此功能是瀏覽器版面預覽，不生成 PDF、不儲存 PDF、不提供下載，也不改變案件狀態。正式 PDF 的分頁與複雜 Excel 物件可能不同，畫面已清楚標示。原本確認後才轉換合併、封存、下載的流程不變。

修改：
- src/ReportUi.jsx、src/ReportUi.css：預覽入口及內容區。
- src/ReportWorkbookView.jsx、src/reportWorkbookView.mjs：沿用唯讀報告檢視、支援委託單，並為雙檢視器建立獨立 ARIA ID。
- src/requestDocumentWorkbook.mjs、src/casePdf.mjs：抽出原有委託單工作簿版面，預覽與結案共用；預覽不載入 PDF 轉換流程。
- e2e/report-prearchive-preview.spec.js、playwright.admin-regression.config.js：桌面淺色、手機深色測試，檢查內容、無下載、報告原始位元及案件資料前後不變。

驗證：Lint、建置通過；報告唯讀與工作流程單元測試通過；新增 2 項瀏覽器測試通過。保留既有大型 chunk 警告。未推送、合併、部署。

[桌面淺色](light.png) · [手機深色](mobile-dark.png)

## 主管查閱樣式補正

- 「退回報告補正」「確認退回報告」採紅底白字，懸停加深；深色主題排除一般次要按鈕覆蓋規則，確認封存仍為藍色。
- 委託單資訊主框內的試驗報告移除重複圓角外框，統一左右內距。PDF 預覽外框改為上分隔線，各文件只保留單一圓角檢視框，內部表格捲動框線一致。
- 退回原因區以緊湊分隔線整理；不更動退回、封存、權限及預覽資料流程。
- Lint、Production Build、4 項相關深淺色瀏覽器測試通過，涵蓋紅色按鈕、框線、資訊視窗與不生成／下載 PDF 的資料不變驗證。
