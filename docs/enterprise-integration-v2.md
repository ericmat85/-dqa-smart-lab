# Enterprise UI V2 — Phase 6 跨系統整合驗收

驗收日期：2026-11-02（Asia/Taipei）。分支從 PR #31 合併後的 main 建立。本階段新增可重跑的正式建置驗收與文件，沒有再修改產品介面、權限或業務流程。

## 驗證結果

| 檢查 | 結果 |
| --- | --- |
| Production build | 通過 |
| Lint／diff check | 通過 |
| 單元測試 | 42 個測試檔通過 |
| 既有完整瀏覽器流程 | 132／132 通過 |
| 正式建置整合驗收 | 44／44 通過；筆數同步補測 1／1 通過 |
| 首頁、Logo 與列出的核心模組來源比對 | 29／29 檔案內容雜湊相同 |

## 正式建置驗收範圍

`npm run test:acceptance` 先產生正式包，再透過 Vite preview 的獨立連接埠執行 Playwright。測試不從瀏覽器動態匯入 `/src` 模組。

| 項目 | 組合／內容 | 案例數 |
| --- | --- | --- |
| 四系統登入入口 | 電子委託、LMS、Lab、DQA × 深淺色 × 桌面／手機／英文大字體 | 24 |
| 三個可用工作區 | 電子委託、LMS、Lab × 深淺色 × 桌面／手機／英文大字體 | 18 |
| 已開啟分頁同步 | 從 LMS 設定切換主題、語言、字體與每頁筆數，確認電子委託、Lab 及新開啟的 DQA 反映偏好，帳號內容不變 | 1 |
| 路由守門 | 未登入的 LMS／Lab 返回登入頁；委託者不能進入主管審查；DQA 仍不能登入 | 1 |

正式包畫面檢查包含頁首工具的可讀名稱、Logo 載入與原始圖層不反色、卡片／輸入框／主按鈕色票、HTML 語言、頁面橫向溢出及瀏覽器錯誤。桌面為 1440 × 900，手機為 390 × 844；英文大字體使用 320 × 844，以檢查較窄寬度。

既有完整回歸另外涵蓋帳號遷移與二階帳號管理、列表筆數、委託送簽／退回／補件、角色與案件權限、排程與設備容量、接收／試驗／中斷申請、三方簽名、Excel 上傳與範本、中文 PDF 封存、操作歷程、AI 互動、手機及 Chrome 200% 縮放。

## 正式建置截圖

本階段沒有 UI 前後差異，以下為同一整合版本的 42 張實際瀏覽器截圖。各階段修改前後畫面見後方文件索引。登入及工作區使用獨立測試瀏覽器與既有 Demo 帳號，不讀取或重設使用者瀏覽器資料。工作區具有自身捲動容器時，截圖為其可見首屏。

| 畫面 | 桌面 Light | 桌面 Dark | 手機 Light | 手機 Dark | 英文大字體 Light | 英文大字體 Dark |
| --- | --- | --- | --- | --- | --- | --- |
| 電子委託登入 | [檢視](reviews/enterprise-integration-v2/entry-request-light-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-request-dark-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-request-light-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-request-dark-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-request-light-english-large.png) | [檢視](reviews/enterprise-integration-v2/entry-request-dark-english-large.png) |
| LMS 登入 | [檢視](reviews/enterprise-integration-v2/entry-lms-light-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-lms-dark-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-lms-light-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-lms-dark-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-lms-light-english-large.png) | [檢視](reviews/enterprise-integration-v2/entry-lms-dark-english-large.png) |
| Lab 登入 | [檢視](reviews/enterprise-integration-v2/entry-lab-light-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-lab-dark-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-lab-light-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-lab-dark-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-lab-light-english-large.png) | [檢視](reviews/enterprise-integration-v2/entry-lab-dark-english-large.png) |
| DQA 展示入口 | [檢視](reviews/enterprise-integration-v2/entry-validation-light-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-validation-dark-desktop.png) | [檢視](reviews/enterprise-integration-v2/entry-validation-light-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-validation-dark-mobile.png) | [檢視](reviews/enterprise-integration-v2/entry-validation-light-english-large.png) | [檢視](reviews/enterprise-integration-v2/entry-validation-dark-english-large.png) |
| 電子委託工作區 | [檢視](reviews/enterprise-integration-v2/workspace-request-light-desktop.png) | [檢視](reviews/enterprise-integration-v2/workspace-request-dark-desktop.png) | [檢視](reviews/enterprise-integration-v2/workspace-request-light-mobile.png) | [檢視](reviews/enterprise-integration-v2/workspace-request-dark-mobile.png) | [檢視](reviews/enterprise-integration-v2/workspace-request-light-english-large.png) | [檢視](reviews/enterprise-integration-v2/workspace-request-dark-english-large.png) |
| LMS 工作區 | [檢視](reviews/enterprise-integration-v2/workspace-lms-light-desktop.png) | [檢視](reviews/enterprise-integration-v2/workspace-lms-dark-desktop.png) | [檢視](reviews/enterprise-integration-v2/workspace-lms-light-mobile.png) | [檢視](reviews/enterprise-integration-v2/workspace-lms-dark-mobile.png) | [檢視](reviews/enterprise-integration-v2/workspace-lms-light-english-large.png) | [檢視](reviews/enterprise-integration-v2/workspace-lms-dark-english-large.png) |
| Lab 工作區 | [檢視](reviews/enterprise-integration-v2/workspace-lab-light-desktop.png) | [檢視](reviews/enterprise-integration-v2/workspace-lab-dark-desktop.png) | [檢視](reviews/enterprise-integration-v2/workspace-lab-light-mobile.png) | [檢視](reviews/enterprise-integration-v2/workspace-lab-dark-mobile.png) | [檢視](reviews/enterprise-integration-v2/workspace-lab-light-english-large.png) | [檢視](reviews/enterprise-integration-v2/workspace-lab-dark-english-large.png) |

## 來源比對

[來源雜湊比對 JSON](reviews/enterprise-integration-v2/source-audit.json) 記錄 UI V2 開始前 `a0b8a65` 與 Phase 5 合併後 main 的 commit／blob 雜湊。入口首頁、企業 Logo，以及列出的帳號權限、委託審核、Lab 操作、排程、報告、PDF、簽名與重設核心模組，29 個檔案均未變更。

此比對僅針對 JSON 明列的檔案；UI 元件、樣式及顯示層事件在前幾階段有依規格調整，不能據此宣稱所有原始碼都沒變動。

## 修改檔案與重跑方式

| 檔案 | 用途 |
| --- | --- |
| `playwright.acceptance.config.js` | 正式建置預覽、獨立連接埠與獨立結果目錄，避免與原流程測試互相清除追蹤檔 |
| `acceptance/enterprise-integration.spec.js` | 跨系統正式包矩陣、分頁偏好同步與路由守門 |
| `package.json` | 增加 `test:acceptance` 指令，不新增依賴 |
| `.gitignore` | 排除可重建的正式包驗收結果目錄 |
| `docs/enterprise-integration-v2.md` | 本驗收記錄與各階段索引 |
| `docs/reviews/enterprise-integration-v2/` | 正式包實際截圖及來源比對資料 |

在已安裝相依套件與 Playwright 瀏覽器的環境執行：

```sh
npm run lint
npm test
npm run test:e2e
npm run test:acceptance
```

此工作環境使用系統 Chromium，可在瀏覽器測試指令前加 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`。正式包驗收結果在 `acceptance-results/`，原本流程結果在 `test-results/`；兩套測試可各自保留輸出。

## 各階段文件

- [Phase 1／2：設計基礎與四系統登入](enterprise-login-v2.md)
- [Phase 3：電子委託](enterprise-request-v2.md)
- [Phase 4：LMS](enterprise-lms-v2.md)
- [Phase 5：Lab 與 DQA](enterprise-lab-v2.md)

## 限制與最終人工確認

DQA 仍是未開放登入的展示入口，沒有品質管理內頁。現有 Excel／PDF、簽名及 Demo AI 的既有限制沿用各階段說明；本次沒有擴充正式後端或電子簽章服務。

目前未發現新增功能性缺陷。自動檢查與上述畫面已完成後，仍請在日常使用的螢幕、瀏覽器與縮放下，對照定稿參考圖確認整體密度、字體及色彩。這是最後的視覺確認，不代表尚有未執行的自動測試。

此分支不合併 main、不手動更新正式部署，也不更改預覽站存取保護。
