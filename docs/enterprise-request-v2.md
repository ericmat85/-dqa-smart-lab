# Enterprise UI V2 — Phase 3 電子委託系統驗收

本階段調整電子委託工作區、委託列表、草稿管理、新增／編輯表單，以及相關彈窗的深淺色。分支以 Phase 1／2 的 `codex/enterprise-login-v2` 為基底，方便分階段檢視差異。入口首頁及其他系統內頁維持既有介面。

## 完成內容

- 64px 頁首、232px 深藍側欄、麵包屑與企業藍操作；企業 Logo 沿用原圖與桌面尺寸，通知及帳號選單保留。
- 委託列表提供六張白底／深藍底狀態摘要，狀態色限於小圖示與 Badge。點擊摘要使用既有集合或狀態篩選，可再次點擊解除。
- 搜尋、欄位、狀態、日期與排序集中於工具列；保留所有資料欄位、原有操作與分頁。筆數說明顯示實際的每頁偏好，不再固定寫 20 筆。
- 「草稿管理」為既有列表的草稿篩選入口，URL 可重新整理，仍只顯示目前帳號有權查看的案件。未儲存離開的放棄／儲存提示繼續沿用，完成後保留目標草稿篩選。
- 表單以五段導覽呈現六組既有資料：基本資料（含試驗目的）、試驗項目、樣品與條件、備註與判定、確認送簽。試驗規範保留原可編輯內容，改為緊湊表格；簽名與指定主管保留。
- 右側資訊欄顯示實際案件編號、狀態、建立／更新時間與儲存狀態；填寫檢核只提示欄位是否填寫，送簽時仍由原本驗證決定能否送出。
- 試驗選取、借用、離開確認、個人設定等彈窗支援深淺色。電子委託頁首使用 Sun／Moon 純圖示、Tooltip 與既有主題儲存機制。

現有系統仍採單選試驗項目；本階段未改成多選，未增加資料欄位、獨立附件功能或未實作的 AI 審核結果。規範、樣品資訊、簽名上傳與既有主管流程均保留。

## 修改檔案

| 檔案 | 用途 |
| --- | --- |
| `src/EnterpriseRequest.css` | 電子委託專用 Compact Enterprise 樣式、深淺模式、表格、彈窗與響應式排版 |
| `src/EnterpriseLogin.css` | 將既有企業色票作用域延伸至明確標記的電子委託工作區；登入畫面設計不變 |
| `src/RequestEnterpriseUi.jsx` | 麵包屑、狀態摘要與表單資訊／填寫檢核欄 |
| `src/RequestApp.jsx` | 組合新介面、草稿快捷篩選、實際分頁筆數、表單呈現順序及可編輯試驗表格 |
| `src/RequestEditorPage.jsx` | 五段導覽及表單／右側資訊雙欄，保留錯誤焦點與離開保護 |
| `src/RequestFormDialog.jsx` | 為電子委託彈窗標記企業主題作用域 |
| `src/RequestWorkspaceUi.jsx` | 工作總覽卡片的功能圖示 |
| `src/SystemHeaderActions.jsx` | 可選的緊湊主題圖示及電子委託個人設定樣式標記；其他系統沿用原本呈現 |
| `src/i18n.mjs` | 新增介面英文文案及動態筆數說明 |
| `e2e/enterprise-request.spec.js` | 草稿入口、資料權限、筆數偏好、原始資料不變及未儲存離開流程 |
| `e2e/request-workspace.spec.js`, `e2e/request-zoom.spec.js` | 保留既有表單與縮放驗證，更新導覽入口名稱 |
| `e2e/archive-categories.spec.js`, `e2e/system-tabs.spec.js`, `e2e/system-theme.spec.js` | 電子委託藍色視覺與純圖示主題控制的預期 |
| `docs/reviews/enterprise-request-v2/` | 以下實際瀏覽器截圖 |

## 修改前後

以下為同樣未建立案件的獨立瀏覽器狀態，桌面 1440 × 900、完整頁面擷取。沒有讀取或重設使用者瀏覽器中的案件。

| 頁面 | 修改前 Light | 修改後 Light | 修改前 Dark | 修改後 Dark |
| --- | --- | --- | --- | --- |
| 工作總覽 | [檢視](reviews/enterprise-request-v2/before-overview-light.png) | [檢視](reviews/enterprise-request-v2/after-overview-light.png) | [檢視](reviews/enterprise-request-v2/before-overview-dark.png) | [檢視](reviews/enterprise-request-v2/after-overview-dark.png) |
| 委託列表 | [檢視](reviews/enterprise-request-v2/before-list-light.png) | [檢視](reviews/enterprise-request-v2/after-list-light.png) | [檢視](reviews/enterprise-request-v2/before-list-dark.png) | [檢視](reviews/enterprise-request-v2/after-list-dark.png) |
| 新增委託單 | [檢視](reviews/enterprise-request-v2/before-editor-light.png) | [檢視](reviews/enterprise-request-v2/after-editor-light.png) | [檢視](reviews/enterprise-request-v2/before-editor-dark.png) | [檢視](reviews/enterprise-request-v2/after-editor-dark.png) |
| 草稿管理 | [檢視](reviews/enterprise-request-v2/before-drafts-light.png) | [檢視](reviews/enterprise-request-v2/after-drafts-light.png) | [檢視](reviews/enterprise-request-v2/before-drafts-dark.png) | [檢視](reviews/enterprise-request-v2/after-drafts-dark.png) |

## 含 Demo 案件、彈窗與手機畫面

以下另外在獨立瀏覽器載入明確標示 `DEMO-UI-*` 的驗收資料，示範各狀態、草稿與規範內容；不是正式案件，也不會自動加入使用者資料。手機寬度為 390px。

| 畫面 | Light | Dark |
| --- | --- | --- |
| 有案件的列表 | [檢視](reviews/enterprise-request-v2/populated-list-light.png) | [檢視](reviews/enterprise-request-v2/populated-list-dark.png) |
| 草稿編輯首屏 | [檢視](reviews/enterprise-request-v2/editor-viewport-light.png) | [檢視](reviews/enterprise-request-v2/editor-viewport-dark.png) |
| 草稿編輯完整頁面 | [檢視](reviews/enterprise-request-v2/populated-editor-light.png) | [檢視](reviews/enterprise-request-v2/populated-editor-dark.png) |
| 試驗項目選取彈窗 | [檢視](reviews/enterprise-request-v2/test-picker-light.png) | [檢視](reviews/enterprise-request-v2/test-picker-dark.png) |
| 手機委託列表 | [檢視](reviews/enterprise-request-v2/mobile-requests-light.png) | [檢視](reviews/enterprise-request-v2/mobile-requests-dark.png) |
| 手機新增委託單 | [檢視](reviews/enterprise-request-v2/mobile-new-light.png) | [檢視](reviews/enterprise-request-v2/mobile-new-dark.png) |

[英文大字體表單](reviews/enterprise-request-v2/english-large-editor.png)

## 驗證結果

- Build、Lint、`git diff --check`：通過。
- 單元測試：42 個測試檔通過。
- 完整瀏覽器回歸：130／130 通過。
- 最終補測：草稿快捷入口、已完成／已結案區分、放棄與儲存後離開流程，1／1 通過。
- 補充檢查：中文手機、英文大字體於 320／768／1920px 無頁面橫向溢出；寬資料表在區塊內捲動。既有資料、帳號權限、九階流程、簽名、排程引擎、Excel/PDF 及 API Contract 未重構。

## 人工驗收

請比較桌面資訊密度、側欄／頁首比例、淺色與深色對比、草稿編輯與規範表格。另請用日常使用的瀏覽器縮放，確認表單、簽名區與操作按鈕易於使用。

目前無已知功能性問題；視覺驗收待確認。此分支不合併 main，不手動更新正式部署，也不變更預覽站的存取保護。
