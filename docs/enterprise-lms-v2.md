# Enterprise UI V2 — Phase 4 LMS 驗收

本分支從 PR #29 合併後的 `main` 建立，處理 LMS 儀表板、試驗委託與審查、設備排程、報表與資料庫的 Compact Enterprise 視覺。共用框架同時套用至 LMS 帳號、物料及系統設定，既有功能與選單保留。

## 完成內容

- 232px 深藍側欄、64px 頁首、麵包屑、緊湊標題與細邊框卡片。沿用原企業 Logo、原位置與 170px 側欄尺寸，沒有重新繪製或替換 Logo。
- 抽出共用 `EnterpriseTokens.css`，沿用已核定的淺／深色票；登入頁與電子委託繼續使用相同色票及原本呈現。
- 儀表板統計卡使用白色／深藍底，狀態色集中在小圖示。圓餅圖與清單的 hover／鍵盤放大、點擊篩選，以及稼動率開啟設定的行為保留。
- 表格、搜尋、篩選、分頁、排序欄位與摘要選取改為企業藍，降低空白並保留長文字與操作。設備分類色、試驗狀態及警告仍保有語意色。
- 委託資訊／審查、設備資訊、排程編輯、甘特圖、中止確認與 AI 排程展示支援一致的深淺模式；甘特圖內部畫布、日期軸、文字與格線一併調整。
- 頁首主題控制採純 Sun／Moon 圖示，保留 Tooltip、鍵盤操作與原本儲存機制；通知、帳號及個人設定保留。
- LMS AI 快捷鈕改為 48px 企業藍圓形白色 Bot，不持續閃爍或旋轉。保留開關、垂直拖曳、方向鍵移動、FAQ、串流回覆及附件檔名展示；聊天面板保留原本互動。

未重構帳號權限、九階流程、審核決策、取消／中止規則、排程引擎、設備容量、資料 Schema、Excel/PDF、簽名、AI API 或 Mock AI 處理。中止及 AI 排程彈窗只增加既有主題的訂閱與樣式作用域。

## 修改檔案

| 檔案 | 用途 |
| --- | --- |
| `src/EnterpriseTokens.css` | 共用企業色票，明確限定已完成階段的工作區與設定窗 |
| `src/EnterpriseLogin.css` | 改為引用共用色票；登入頁視覺保持原樣 |
| `src/EnterpriseLms.css` | LMS 專用框架、統計卡、資料表、表單、甘特圖、彈窗、AI 與響應式樣式 |
| `src/LmsApp.jsx` | 使用企業框架，加入麵包屑、儀表板標題及緊湊主題控制 |
| `src/SystemHeaderActions.jsx` | 依系統標記緊湊個人設定窗，電子委託原有標記不變 |
| `src/EnterpriseBotIcon.jsx` | 裝飾用 Bot SVG，按鈕仍使用原本的可讀名稱 |
| `src/IntelligentAssistant.jsx` | 快捷鈕圖示與顯示位置；問答、計時與資料處理保留 |
| `src/AiScheduleButton.jsx`, `src/StopScheduleDialog.jsx` | Portal 彈窗沿用全域主題，不改變分析、取消與中止處理 |
| `src/i18n.mjs` | 新增儀表板副標的英文翻譯 |
| `e2e/lms-visual-refinement.spec.js`, `e2e/lms-review-tabs.spec.js`, `e2e/lms-assistant-interactions.spec.js` | 核定的新色票、統計卡、側欄與圓形 Bot 預期，保留操作驗證 |
| `e2e/assistant-layout.spec.js`, `e2e/control-alignment.spec.js`, `e2e/schedule-layout.spec.js` | 圓形浮鈕、排程操作對齊、Logo 尺寸與桌面布局 |
| `e2e/archive-categories.spec.js`, `e2e/equipment-activity.spec.js`, `e2e/equipment-schedule.spec.js`, `e2e/management-workspace.spec.js`, `e2e/system-theme.spec.js` | 僅更新已被本次設計取代的 LMS 視覺預期，保留權限、匯出與其他系統驗證 |
| `docs/reviews/enterprise-lms-v2/` | 下列實際瀏覽器截圖 |

## 修改前後

桌面 1440 × 900，使用獨立瀏覽器中的既有 Demo 資料，沒有讀取或重設使用者瀏覽器的案件。LMS 內容區使用自身捲動容器，截圖為當時可見畫面。

| 頁面 | 修改前 Light | 修改後 Light | 修改前 Dark | 修改後 Dark |
| --- | --- | --- | --- | --- |
| 儀表板 | [檢視](reviews/enterprise-lms-v2/before-dashboard-light.png) | [檢視](reviews/enterprise-lms-v2/after-dashboard-light.png) | [檢視](reviews/enterprise-lms-v2/before-dashboard-dark.png) | [檢視](reviews/enterprise-lms-v2/after-dashboard-dark.png) |
| 試驗委託 | [檢視](reviews/enterprise-lms-v2/before-requests-light.png) | [檢視](reviews/enterprise-lms-v2/after-requests-light.png) | [檢視](reviews/enterprise-lms-v2/before-requests-dark.png) | [檢視](reviews/enterprise-lms-v2/after-requests-dark.png) |
| 排程管理 | [檢視](reviews/enterprise-lms-v2/before-schedule-light.png) | [檢視](reviews/enterprise-lms-v2/after-schedule-light.png) | [檢視](reviews/enterprise-lms-v2/before-schedule-dark.png) | [檢視](reviews/enterprise-lms-v2/after-schedule-dark.png) |
| 設備管理 | [檢視](reviews/enterprise-lms-v2/before-equipment-light.png) | [檢視](reviews/enterprise-lms-v2/after-equipment-light.png) | [檢視](reviews/enterprise-lms-v2/before-equipment-dark.png) | [檢視](reviews/enterprise-lms-v2/after-equipment-dark.png) |
| 報表分析 | [檢視](reviews/enterprise-lms-v2/before-reports-light.png) | [檢視](reviews/enterprise-lms-v2/after-reports-light.png) | [檢視](reviews/enterprise-lms-v2/before-reports-dark.png) | [檢視](reviews/enterprise-lms-v2/after-reports-dark.png) |
| 資料庫 | [檢視](reviews/enterprise-lms-v2/before-archive-light.png) | [檢視](reviews/enterprise-lms-v2/after-archive-light.png) | [檢視](reviews/enterprise-lms-v2/before-archive-dark.png) | [檢視](reviews/enterprise-lms-v2/after-archive-dark.png) |
| 系統設定 | [檢視](reviews/enterprise-lms-v2/before-settings-light.png) | [檢視](reviews/enterprise-lms-v2/after-settings-light.png) | [檢視](reviews/enterprise-lms-v2/before-settings-dark.png) | [檢視](reviews/enterprise-lms-v2/after-settings-dark.png) |

## 彈窗、AI 與手機

這組額外截圖在獨立瀏覽器以 `DEMO-UI-*` 排程及既有 Demo 台帳驗收。未儲存排程、未送出審核或執行中止，也不會自動加入使用者資料。空白甘特圖呈現目前日期範圍的真實空狀態。

| 畫面 | Light | Dark |
| --- | --- | --- |
| 委託資訊／審查 | [檢視](reviews/enterprise-lms-v2/request-modal-light.png) | [檢視](reviews/enterprise-lms-v2/request-modal-dark.png) |
| 設備資訊 | [檢視](reviews/enterprise-lms-v2/equipment-modal-light.png) | [檢視](reviews/enterprise-lms-v2/equipment-modal-dark.png) |
| 排程編輯 | [檢視](reviews/enterprise-lms-v2/schedule-editor-light.png) | [檢視](reviews/enterprise-lms-v2/schedule-editor-dark.png) |
| 甘特圖 | [檢視](reviews/enterprise-lms-v2/gantt-light.png) | [檢視](reviews/enterprise-lms-v2/gantt-dark.png) |
| 中止確認 | [檢視](reviews/enterprise-lms-v2/stop-dialog-light.png) | [檢視](reviews/enterprise-lms-v2/stop-dialog-dark.png) |
| AI 排程展示 | [檢視](reviews/enterprise-lms-v2/ai-schedule-light.png) | [檢視](reviews/enterprise-lms-v2/ai-schedule-dark.png) |
| AI 助理 | [檢視](reviews/enterprise-lms-v2/assistant-light.png) | [檢視](reviews/enterprise-lms-v2/assistant-dark.png) |
| 手機儀表板 | [檢視](reviews/enterprise-lms-v2/mobile-dashboard-light.png) | [檢視](reviews/enterprise-lms-v2/mobile-dashboard-dark.png) |
| 手機委託列表 | [檢視](reviews/enterprise-lms-v2/mobile-requests-light.png) | [檢視](reviews/enterprise-lms-v2/mobile-requests-dark.png) |
| 手機排程 | [檢視](reviews/enterprise-lms-v2/mobile-schedule-light.png) | [檢視](reviews/enterprise-lms-v2/mobile-schedule-dark.png) |
| 手機報表 | [檢視](reviews/enterprise-lms-v2/mobile-reports-light.png) | [檢視](reviews/enterprise-lms-v2/mobile-reports-dark.png) |

[英文大字體儀表板](reviews/enterprise-lms-v2/english-large-dashboard.png)

## 驗證

- Build、Lint、`git diff --check`：通過。
- 單元測試：42 個測試檔通過。
- 完整瀏覽器回歸：130／130 通過。
- 手動確認：中止確認深色卡片為 `#10263D`、輸入框為 `#142C44`；淺色均為白色。手機淺／深模式與英文大字體在 320／768／1920px 未出現頁面橫向溢出。
- 桌面排程表於 960／1280／1366／1440／1920px 保留所有欄位與可用的編輯操作，原有手機及 200% 縮放驗證繼續執行。

## 人工驗收與後續

請檢視儀表板密度、統計卡色彩、審查與排程表格、甘特圖深色對比，以及 AI 浮鈕與操作區的間距；也請用日常瀏覽器縮放確認表單與簽名可用。

目前無已知功能性問題，視覺驗收待確認。此階段不合併 main、不手動更新正式部署，不變更預覽站存取保護。下一階段為 Phase 5：Lab 與 DQA；DQA 尚未開放的功能不會自行補上未實作流程。
