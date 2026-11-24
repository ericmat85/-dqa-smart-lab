# 共用搜尋、按鈕與系統管理 UI 驗收

2026-11-25，PR49 延續更新。參考報表分析展開搜尋列與「歷史排程」按鈕，統一三系統的操作尺寸，巡檢系統管理所有分類與內層分頁。

## 共用規則

| 元件 | 規則 |
| --- | --- |
| 一般功能按鈕 | 高度 32px，文字與圖示垂直置中 |
| 搜尋圖示與搜尋欄位 | 高度 36px；預設收合，於頁籤列右側開啟完整下一列 |
| 操作按鈕、功能方塊 | 保留各自尺寸，不套用一般按鈕高度 |
| 搜尋展開列 | 與外框左右貼齊、淺色背景、欄位有細邊框，沒有浮動視窗陰影；手機換行 |
| 搜尋互動 | Esc 收合並回到圖示；收合保留條件；指定欄位不新增互動外框 |
| 主頁籤／表頭 | 沿用 42px／40px 標準 |
| 管理內層頁籤 | 42px、底線式選取、計數置中，手機橫向捲動 |
| 管理內容 | 區段與外框間距 16px、欄位間距 12–16px、按鈕間距 8px；列表貼齊左右框 |

## 管理分類順序

| 分類 | 頁面 |
| --- | --- |
| 人員與組織 | 帳號與權限管理、人員資格管理、組織與租戶設定 |
| 流程與試驗 | 工作流程、試驗與設備參數、品質與稽核設定 |
| 文件與資料 | 文件與報告設定、系統與資料設定 |
| 介面與通知 | 介面設定、通知與提醒設定 |
| 安全與系統服務 | 資訊安全設定、系統監控、AI 引擎管理 |

總覽與頂部分頁採相同排序，桌面標題旁顯示所屬分類，手機以導覽順序辨識分類並維持標題置中。主要設定在前，「資料來源與整合狀態」移至頁尾並預設收合，減少進入頁面時的唯讀資訊干擾。文件設定的報告合成預覽也可收合。資料維護仍集中在「系統與資料設定」，保留原有權限與確認程序。

巡檢含管理總覽、13 個模組、E1–E4 引擎、公司品牌／系統參數／備份／資料維護子頁、試驗／設備／排程／端口分類、回收區／Demo／瀏覽器資料分類，以及帳號角色頁。修正手機總覽卡片文字重疊、深色文件範本區塊底色不一致。

## 截圖

[報表搜尋標準](reports-search.png) · [帳號搜尋列](accounts-search.png) · [手機帳號搜尋](mobile-accounts-search.png) · [財務搜尋列](finance-search.png) · [試驗內層頁籤](trial-tabs.png) · [回收區](recycle.png)

所有截圖使用本機合成資料，非正式帳號。測試阻擋遠端字型請求以使用確定的系統字型，產品字型設定未變更。各模組桌面及手機畫面：

| 頁面 | 桌面 | 手機 |
| --- | --- | --- |
| 管理總覽 | [查看](desktop-overview.png) | [查看](mobile-overview.png) |
| 帳號與權限 | [查看](desktop-accounts.png) | [查看](mobile-accounts.png) |
| 人員資格 | [查看](desktop-qualifications.png) | [查看](mobile-qualifications.png) |
| 組織與租戶 | [查看](desktop-organization.png) | [查看](mobile-organization.png) |
| 工作流程 | [查看](desktop-workflow.png) | [查看](mobile-workflow.png) |
| 試驗與設備 | [查看](desktop-parameters.png) | [查看](mobile-parameters.png) |
| 品質與稽核 | [查看](desktop-quality.png) | [查看](mobile-quality.png) |
| 文件與報告 | [查看](desktop-documents.png) | [查看](mobile-documents.png) |
| 系統與資料 | [查看](desktop-backup.png) | [查看](mobile-backup.png) |
| 介面 | [查看](desktop-interface.png) | [查看](mobile-interface.png) |
| 通知 | [查看](desktop-notifications.png) | [查看](mobile-notifications.png) |
| 資訊安全 | [查看](desktop-security.png) | [查看](mobile-security.png) |
| 系統監控 | [查看](desktop-monitoring.png) | [查看](mobile-monitoring.png) |
| AI 引擎 | [查看](desktop-ai.png) | [查看](mobile-ai.png) |

[深色文件設定](dark-documents.png) · [深色介面設定](dark-interface.png) · [深色系統資料設定](dark-backup.png)

驗證共 184 項瀏覽器案例通過（含修正後重測），另有 2 項不適用於原生模式的 Demo 案例跳過；37 項 Node 檢查通過，原生建置與 Lint 通過（保留既有警告）。詳細結果見 [validation.json](validation.json)。既有封存 PDF、品牌／個人圖片、簽章權限與財務規則保留。本次無資料庫遷移或正式資料寫入；PR 保持開啟，正式站前端不變。

## 深層管理頁面

| 頁面 | 桌面 | 手機 |
| --- | --- | --- |
| ai-E1 | [查看](desktop-ai-E1.png) | [查看](mobile-ai-E1.png) |
| ai-E2 | [查看](desktop-ai-E2.png) | [查看](mobile-ai-E2.png) |
| ai-E3 | [查看](desktop-ai-E3.png) | [查看](mobile-ai-E3.png) |
| ai-E4 | [查看](desktop-ai-E4.png) | [查看](mobile-ai-E4.png) |
| backup-branding | [查看](desktop-backup-branding.png) | [查看](mobile-backup-branding.png) |
| backup-backup | [查看](desktop-backup-backup.png) | [查看](mobile-backup-backup.png) |
| backup-maintenance | [查看](desktop-backup-maintenance.png) | [查看](mobile-backup-maintenance.png) |
