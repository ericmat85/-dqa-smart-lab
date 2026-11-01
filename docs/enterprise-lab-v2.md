# Enterprise UI V2 — Phase 5 Lab 與 DQA 驗收

從 PR #30 合併後的 main 建立獨立分支，將企業設計基礎延伸至 Lab 內頁；DQA 保留既有展示登入頁，不新增未實作的品質管理流程。

## 完成內容

- Lab 採 232px 深藍側欄、64px 頁首、麵包屑與緊湊頁面標題。既有企業 Logo 與位置保留，手機沿用可縮放的原圖。
- 四張統計卡使用白色／深藍底，小圖示表達狀態；統計仍讀取實際 Lab 委託，不新增篩選或改變計算規則。
- 委託、操作歷程與資料庫採緊湊表格、細邊框與企業藍操作。長表格在自身區塊內捲動，保留所有欄位、操作及既有分頁。
- 手機選單可開關、以 Escape 收合並將焦點還給控制鈕；選擇頁面後自動收合。原有接收、申請取消、設備狀態、提交報告及返回入口保留。
- 接收確認、取消申請、報告上傳、設備／委託資訊、操作歷程與個人設定支援深淺色。簽名控制配合主題，畫布維持白底以保留原始墨跡與資料。
- 頁首使用 Sun／Moon 純圖示主題控制，沿用全系統主題儲存；通知與帳號選單保留。
- DQA 新增清楚的中英文「展示入口、尚未開放登入」提示。帳號、密碼與登入按鈕維持停用，直接前往 `/validation/dashboard` 仍只能看到展示入口，不建立登入工作階段。

既有帳號權限、九階流程、接收／取消／中斷規則、LMS 審核、排程引擎、Excel/PDF、報告審查、電子簽名、API Contract 與資料 Schema 未重構。Lab 原本沒有獨立 AI 對話功能，本階段不新增假對話或假 AI 審核結果；原本的報告 Demo 規則與 LMS 助理維持原樣。

## 修改檔案

| 檔案 | 用途 |
| --- | --- |
| `src/EnterpriseLab.css` | Lab 專用框架、統計卡、表格、彈窗、個人設定與手機樣式 |
| `src/EnterpriseTokens.css` | 將既有色票作用域延伸至 Lab 與其設定窗 |
| `src/LabApp.jsx` | 緊湊主題控制、麵包屑、手機選單、統計圖示與空狀態；原操作函式保留 |
| `src/LmsApp.jsx`, `src/EnterpriseLogin.css` | DQA 展示入口的狀態說明與樣式；LMS 工作區不變 |
| `src/SignaturePad.jsx` | 為既有清除按鈕增加樣式類別，只在 Lab 主題下套用；不改變繪圖或資料 |
| `src/i18n.mjs` | 新增頁面副標、空狀態及 DQA 提示的英文 |
| `e2e/lab-enterprise.spec.js` | 手機選單鍵盤／收合／帳號保留，以及 DQA 停用登入與雙語提示 |
| `e2e/archive-categories.spec.js`, `e2e/system-tabs.spec.js`, `e2e/system-theme.spec.js` | 更新 Lab 企業藍預期，保留主題、權限與下載操作驗證 |
| `docs/reviews/enterprise-lab-v2/` | 下列實際瀏覽器截圖 |

## 修改前後

桌面 1440 × 900，使用獨立瀏覽器的空白 Lab 清單與 DQA 展示入口；沒有讀取或重設使用者瀏覽器資料。

| 頁面 | 修改前 Light | 修改後 Light | 修改前 Dark | 修改後 Dark |
| --- | --- | --- | --- | --- |
| Lab 委託與接收 | [檢視](reviews/enterprise-lab-v2/before-requests-light.png) | [檢視](reviews/enterprise-lab-v2/after-requests-light.png) | [檢視](reviews/enterprise-lab-v2/before-requests-dark.png) | [檢視](reviews/enterprise-lab-v2/after-requests-dark.png) |
| 操作歷程 | [檢視](reviews/enterprise-lab-v2/before-audit-light.png) | [檢視](reviews/enterprise-lab-v2/after-audit-light.png) | [檢視](reviews/enterprise-lab-v2/before-audit-dark.png) | [檢視](reviews/enterprise-lab-v2/after-audit-dark.png) |
| 資料庫 | [檢視](reviews/enterprise-lab-v2/before-archive-light.png) | [檢視](reviews/enterprise-lab-v2/after-archive-light.png) | [檢視](reviews/enterprise-lab-v2/before-archive-dark.png) | [檢視](reviews/enterprise-lab-v2/after-archive-dark.png) |
| DQA 展示入口 | [檢視](reviews/enterprise-lab-v2/before-dqa-light.png) | [檢視](reviews/enterprise-lab-v2/after-dqa-light.png) | [檢視](reviews/enterprise-lab-v2/before-dqa-dark.png) | [檢視](reviews/enterprise-lab-v2/after-dqa-dark.png) |

## Demo 案件、彈窗與手機

額外畫面在獨立自動化瀏覽器透過既有完整流程 Demo 建立完成／試驗中案件，另加 `DEMO-UI-PENDING` 待接收樣本。簽名為明確標示的 Demo 圖樣。這些資料只存在驗收瀏覽器，不會自動加入使用者案件；截圖過程未送出取消申請或報告。

| 畫面 | Light | Dark |
| --- | --- | --- |
| 含 Demo 案件清單 | [檢視](reviews/enterprise-lab-v2/populated-requests-light.png) | [檢視](reviews/enterprise-lab-v2/populated-requests-dark.png) |
| 接收確認 | [檢視](reviews/enterprise-lab-v2/confirm-light.png) | [檢視](reviews/enterprise-lab-v2/confirm-dark.png) |
| 取消申請 | [檢視](reviews/enterprise-lab-v2/cancel-light.png) | [檢視](reviews/enterprise-lab-v2/cancel-dark.png) |
| 報告上傳與簽名 | [檢視](reviews/enterprise-lab-v2/report-upload-light.png) | [檢視](reviews/enterprise-lab-v2/report-upload-dark.png) |
| 設備資訊 | [檢視](reviews/enterprise-lab-v2/equipment-light.png) | [檢視](reviews/enterprise-lab-v2/equipment-dark.png) |
| 委託資訊 | [檢視](reviews/enterprise-lab-v2/request-detail-light.png) | [檢視](reviews/enterprise-lab-v2/request-detail-dark.png) |
| 含 Demo 操作歷程 | [檢視](reviews/enterprise-lab-v2/populated-audit-light.png) | [檢視](reviews/enterprise-lab-v2/populated-audit-dark.png) |
| 手機委託清單 | [檢視](reviews/enterprise-lab-v2/mobile-requests-light.png) | [檢視](reviews/enterprise-lab-v2/mobile-requests-dark.png) |
| 手機展開選單 | [檢視](reviews/enterprise-lab-v2/mobile-menu-light.png) | [檢視](reviews/enterprise-lab-v2/mobile-menu-dark.png) |
| 手機操作歷程 | [檢視](reviews/enterprise-lab-v2/mobile-audit-light.png) | [檢視](reviews/enterprise-lab-v2/mobile-audit-dark.png) |
| 手機資料庫 | [檢視](reviews/enterprise-lab-v2/mobile-archive-light.png) | [檢視](reviews/enterprise-lab-v2/mobile-archive-dark.png) |
| 手機 DQA 入口 | [檢視](reviews/enterprise-lab-v2/mobile-dqa-light.png) | [檢視](reviews/enterprise-lab-v2/mobile-dqa-dark.png) |

[英文大字體 Lab](reviews/enterprise-lab-v2/english-large-lab.png) · [英文大字體 DQA](reviews/enterprise-lab-v2/english-large-dqa.png)

## 驗證結果

- Build、Lint、`git diff --check`：通過。
- 單元測試：42 個測試檔通過。
- 完整瀏覽器回歸：132／132 通過。
- 手動檢查：取消原因輸入框淺色為 `#FFFFFF`、文字 `#0F172A`；深色為 `#142C44`、文字 `#F1F5F9`。手機選單與各頁可操作；英文大字體在 320／768／1920px 的 Lab 清單、歷程、資料庫及 DQA 沒有頁面橫向溢出。

## 限制與人工驗收

DQA 仍只有展示入口，沒有品質管理內頁或可用登入。此為原系統狀態，不以本次 UI 調整虛構新功能。簽名畫布保持白底，原生檔案與日期控制依瀏覽器呈現。

目前沒有已知新增功能性問題。請檢查 Lab 實際操作密度、深色報告／簽名控制、手機選單與表格捲動，以及 DQA 未開放提示。

本分支不合併 main、不手動更新正式部署，也不變更預覽站存取保護。下一階段為 Phase 6：跨系統整合驗收。
