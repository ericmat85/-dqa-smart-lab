# LMS 系統管理中心 V1.0（前端）

入口：`/lms/settings`。本機分支 `feature/lms-admin-center`，承接包含既有 UI 及九階 18 筆 Demo 功能的 `55fc1b9`。初始工作區乾淨，使用獨立 worktree `/workspace/lms-admin-center` 開發，沒有覆蓋其他工作區。未 Push、Merge 或 Deploy，未修改正式環境資料。

## 使用與整合

系統設定首頁保留原本資料概況、外觀、稼動率、來源健檢、提醒及資料說明；增加四群組、12 個管理入口。原側欄只有一個「系統設定」，各模組有麵包屑及返回入口。原 `/lms/settings?filter=activity` 導覽仍可展開稼動率設定。

管理中心標示三種狀態：「已實作」指可使用的前端功能；「Demo 模擬」指本機政策草稿或示例；「規劃中」指尚未接入的正式服務。沒有把前端畫面當成正式後端能力。

| 模組／子路由 | 狀態 | 功能與範圍 |
| --- | --- | --- |
| 帳號與權限 `accounts` | Demo 模擬 | 摘要沿用現有帳號、部門、角色資料；入口前往原帳號／RBAC 介面，沒有第二套編輯器。 |
| 九階流程規則 `workflow` | 已實作 | 九階唯讀：說明、角色、操作、下一階段、退回位置、文件及簽核要求。沒有修改狀態機的控制。 |
| 試驗與設備參數 `parameters` | 已實作 | 共用原試驗目錄、方法參考；讀取原設備容量、樣品上限、可用空間、相容規格、校驗／維護及排程樣品空間、準備／清理時間；原設備、排程及稼動率入口保留。 |
| 文件與報告 `documents` | Demo 模擬 | 沿用通常／一般性能 Excel 範本產生器，可下載；原資料庫、報表設定入口及原簽名元件。保存期限為 Demo 草稿，不刪除文件。 |
| 系統備份 `backup` | Demo 模擬 | 每日／每週一／手動、02:00、Asia/Taipei、30 天預設值；模擬時間與模擬歷程。最近成功備份固定明示「尚無實際備份紀錄」。 |
| 資訊安全 `security` | Demo 模擬 | 原閒置 30 分鐘機制與 RBAC 入口、管理操作紀錄及原實驗室操作歷程；不提供假 MFA／RLS／API 防護開關。 |
| 系統監控 `monitoring` | Demo 模擬 | 真實前端套件版本、執行時間、瀏覽器連線訊號、來源讀取異常；與未接入的 API／資料庫／AI 服務分區。 |
| AI 引擎 `ai` | Demo 模擬 | 四大引擎、模擬啟用、模型／規則展示、明確標示的固定 Token／成本示例、設定操作紀錄；不控制既有引擎或呼叫 API。 |
| 通知提醒 `notifications` | Demo 模擬 | 七種規則與台灣提醒時間草稿；不發送 Email、SMS、推播或執行背景任務。 |
| 品質稽核 `quality` | Demo 模擬 | 不符合分類、稽核項目草稿、CAPA／追溯示例及本機設定紀錄；沒有正式 CAPA 工作流程。 |
| 人員資格 `qualifications` | Demo 模擬 | 兩筆假資格展示（有效／到期），首筆假人員、設備與試驗授權、訓練及日期可編輯；不接入排程或簽核。 |
| 組織租戶 `organization` | Demo 模擬 | 虛構公司、部門、層級、據點與固定 `DEMO-TENANT-LOCAL` 識別；不能切換真實租戶。 |

未實作的正式服務一律標為規劃中：後端認證／MFA／RLS／API 防護、正式備份與還原、背景排程、正式文件版本與保存期限、真實監控／安全事件、通知發送、正式 CAPA、資格授權判定及多租戶隔離。

### 原規範的資訊缺口

原試驗目錄與通常報告沒有獨立核准版號；一般性能 `general-performance-v1` 是辨識設定 ID，不冒充核准版號。設備／排程缺少獨立轉換時間時顯示未提供，不補造參數、不改相容與衝突判定。

## 權限

- 根頁及所有子路由保留現有 LMS 登入與 settings 頁權限。
- 帳號模組需要既有 `canManageAccounts`；參數、文件模組另需對應 equipment、archive 頁權限。直接輸入路由仍會拒絕。
- 新增 Demo 設定寫入、模擬備份及重設僅供既有帳號管理授權者（預設系統管理員／二階主管及原授權角色），且需保留 settings 權限；其他可進設定者為唯讀。
- 寫入服務重新讀取目前帳號、狀態及角色，拒絕停用、失權、偽造或過期的帳號資料。不修改任何角色或權限對應。
- 個人預設簽名沿用既有元件，只作用於本人；不簽核案件、不授予業務權限。
- 不修改主管階層、禁止自審、同人跨階、退回、取消、中斷、接收或結案規則。前端檢查僅供 Demo，正式安全仍需後端驗證。

## 新元件與資料結構

- `AdminCenterCards`：四群組／12 卡片、狀態與權限入口。
- `AdminCenterModule`：路由模組內容、唯讀表格、共用 Demo 編輯對話框、原簽名元件整合。
- `adminCenterData.mjs`：集中模組、九階規則說明、四引擎、七提醒、表單欄位及假資料 Seed。
- `adminCenterStore.mjs`：驗證、權限、讀寫、模擬備份時間與重設；`useAdminSettings` 訂閱同頁／跨分頁變更。
- `requestTestCatalog.mjs`：從原 RequestApp 原樣移出試驗選項、方法與允收參考及兩個產生函式；電子委託及管理中心共用，沒有第二份目錄。

唯一新增設定鍵：`dqa-lms-admin-center-v1`。

```js
{
  version: 1,
  settings: {
    backup: { enabled: false, frequency: 'daily', time: '02:00', retentionDays: 30 },
    documents: { retentionDays: 365 }, // Demo 政策草稿
    ai: { request: true, report: true, schedule: true, assistant: true },
    notifications: { /* 七組布林規則與 HH:mm */ },
    quality: { category, auditItem },
    qualifications: { person, equipment, test, training, expires },
    organization: { company, departments, hierarchy, sites }
  },
  events: [], // 最多200筆本機設定操作
  backups: [] // 最多50筆模擬歷程，simulated:true；沒有案件內容
}
```

沒有修改委託、排程、報告、帳號或資產資料格式。範本下載使用原純產生器；本人簽名使用原預設簽名鍵。重設只替換上述管理中心鍵，不清除任何業務資料、報告或簽名。資料損毀會明示錯誤，不自動覆寫；有權管理者可明確確認後重設本中心。

模擬備份只有按鈕觸發的示例紀錄，無背景排程、資料複製、上傳或還原。每日／週一的下次時間由純前端函式按 Asia/Taipei 計算，明示「模擬排程時間」。保留天數為政策展示，沒有刪除資料。

## 修改檔案

新增：

- `src/AdminCenterCards.jsx`
- `src/AdminCenterModule.jsx`
- `src/AdminCenter.css`
- `src/adminCenterData.mjs`
- `src/adminCenterStore.mjs`
- `src/useAdminSettings.js`
- `src/requestTestCatalog.mjs`
- `tests/adminCenter.test.mjs`
- `e2e/admin-center.spec.js`
- `playwright.admin-center.config.js`
- `playwright.admin-regression.config.js`
- `docs/lms-admin-center/`

修改：

- `src/LabSettings.jsx`：保留原頁並插入管理中心。
- `src/LmsApp.jsx`：新增設定子路由、麵包屑及元件接線，保留原頁面權限。
- `src/RequestApp.jsx`：改匯入原樣抽出的試驗目錄與產生函式。
- `tests/nineStageSeed.test.mjs`：原衝突測試將 UTC 切片改為台灣日期換算；跨午夜仍建立實際重疊日程，未改排程規則。

## 驗證

- 新增7項單元測試通過：12模組／九階／四引擎、權限及失權、命名空間隔離、18案件保留、模擬備份跨日／跨年／週一、欄位驗證、損毀保護與儲存失敗。
- `npm test`：47個測試檔結果全部通過。
- Lint、Production Build 通過；仍有既有大型 bundle 與部分模組重複靜態／動態匯入提示。
- 新增 Production UI 驗證：1920×1080、1366×768、390×844深淺色、12入口、麵包屑、9階唯讀、四引擎、Modal／Escape／焦點、權限拒絕、無API呼叫。
- 新增資料保留驗證：在隔離的Playwright情境中載入18筆案件及6份報告後，逐一儲存Demo設定、跨分頁同步與重設；案件與業務鍵值完全相同，報告資料及二進位內容雜湊相同。
- 完整瀏覽器回歸已完成，結果詳見下方。未執行線上或正式環境驗收。

## 風險與限制

- 新增子路由沿用原單頁應用 rewrite，沒有新增部署或網站存取權限設定。
- 本機儲存仍受瀏覽器額度、清除網站資料與同來源存取限制。管理設定採獨立命名空間，不是正式資料隔離。
- 「最近前端錯誤」僅收集模組開啟期間的瀏覽器事件，非跨使用者或持久的正式監控。
- 人員資格只示範兩筆，部門／分類為Demo文字設定；沒有正式人員／部門主檔、批量CRUD或組織同步。
- 所有後端、安全、備份、通知、AI服務與正式品質流程皆不在本次範圍，未連接也未驗證。

### 瀏覽器實際截圖（Production Build）

- [1920 淺色](center-1920-light.png)／[深色](center-1920-dark.png)
- [1366 淺色](center-1366-light.png)／[深色](center-1366-dark.png)
- [390 手機淺色](center-390-light.png)／[深色](center-390-dark.png)
- [備份設定淺色視窗](backup-dialog-1920-light.png)／[深色視窗](backup-dialog-1920-dark.png)／[手機深色視窗](backup-dialog-390-dark.png)

### 既有測試相容修正

- 九階 E2E 明定原專用設定的180秒預算，包含兩次PDF準備、雙階審核、查閱及下載；不移除任何業務斷言。
- 實驗室儀錶板測試同步已存在的「僅清空 Demo 案件…」「清除並重設九階18筆 Demo」名稱。
- 原委託工作區測試分別取消上述兩種操作，確認資料保留。
- 200%實際Chrome縮放測試使用專案baseURL，避免寫死4173而無法檢查Production預覽。

上述另修改 `e2e/nine-stage-seed.spec.js`、`e2e/lab-dashboard-v2.spec.js`、`e2e/request-workspace.spec.js`、`e2e/request-zoom.spec.js`；全屬測試相容性，沒有變更 Demo 按鈕或任何業務實作。


## 最終驗證結果

- Lint、Production Build 通過。
- `npm test`：47個測試檔結果通過，0失敗；新增7項管理設定單元測試亦逐項通過。
- 完整278項瀏覽器掃描：269項直接通過，9項為既有Demo按鈕名稱、縮放URL及九階測試時間預算相容性；修正後以單worker重跑，9項全部通過。沒有跳過測試或移除業務斷言。
- 另補768平板兩項與文件範本／本人簽名整合一項，合計目前281項瀏覽器案例均已覆蓋通過。
- 最終管理中心Production驗收11項全數通過（45.5秒），包括1920／1366／768／390深淺色、12入口、權限拒絕、跨分頁同步、18案件與6份報告保留、兩種Excel範本下載與解析、本人簽名視窗及格式錯誤顯示、既有帳號／報表入口。
- 九階完整E2E單獨使用原180秒預算後通過：包含簽核、報告審核、查閱退回、封存PDF及再次重設九階各兩筆。
- 完整掃描使用`playwright.admin-regression.config.js`：5套需要原始模組的既有測試使用Vite dev，其餘套件檢查Production預覽；沒有修改現有預設CI設定。
- 沒有執行遠端CI或正式環境驗收；本次沒有Push、Merge或Deploy。

[可檢查的驗證摘要](validation.json)。

### 待驗證與範圍外

本次前端驗收項目已完成，未發現阻擋問題。正式部署環境、後端授權／RLS、真實備份還原、AI／通知服務與多租戶資料隔離均未連接或驗證，依任務限制保留規劃中。Demo設定同欄位的多分頁同時編輯採最後儲存值；正式協作版本控制不在本次前端展示範圍。
