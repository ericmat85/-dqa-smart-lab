# 電子委託新增／編輯 Compact UI

以使用者提供的 Compact Enterprise Form 圖為視覺參考，僅調整 `/request/new` 及使用同一編輯器的既有草稿／補件編輯畫面。原有產品類型為文字欄位、試驗目的為九個雙語選項，均依實際系統保留，不依參考圖改成選單或替換選項。

## 調整

- 卡片內距 16px、卡片間距 12px、圓角 8px；欄位垂直間距 14px、水平 16px。
- 一般輸入與選單 40px、標籤 13px；文字框至少 80px，內容自然換行。桌面基本資料維持三欄，窄視窗逐步改為兩欄／單欄。
- 桌面右欄 280px（筆電）／300px（寬螢幕），資訊及檢核卡片自然高度，不與表單強制等高。
- 五階段導覽改為編輯器底部獨立的 52px 列，手機 56px。表單有自己的捲動區，導覽與內容沒有交疊範圍，並與編輯器左右對齊。這次不以額外 padding 掩蓋浮動遮擋。
- 原點選區段、下一步、鍵盤聚焦與捲動追蹤保留；追蹤改以表單捲動容器的位置計算，避免切換至較短區段時跳回前一步。
- 新增與編輯共用樣式；沿用既有主題色及主題切換機制，沒有修改 Header、Sidebar、Logo 或其他頁面。

## 修改檔案

| 檔案 | 用途 |
| --- | --- |
| `src/RequestEditorCompact.css` | 僅限編輯器的密度、欄寬、響應及獨立導覽列 |
| `src/RequestEditorPage.jsx` | 新增表單捲動容器、底部導覽位置及其量測／視覺追蹤 |
| `e2e/compact-request-editor.spec.js` | 指定尺寸、深淺色、新增／草稿編輯與遮擋驗證 |
| `e2e/workspace-page-header.spec.js` | 更新舊浮動導覽定位預期，保留既有區段與操作檢查 |
| `playwright.acceptance.config.js` | 將新編輯器檢查納入正式包驗收 |
| `docs/compact-request-editor.md`、`docs/reviews/compact-request-editor/` | 本說明與實際截圖 |

## 功能界線與限制

未修改任何資料欄位、資料模型、權限、驗證、草稿／送簽、九階狀態流程、API、後端或 AI。Demo 填入、儲存／送出等既有操作及工具列保持原功能。

目前原始碼沒有用於隱藏這些 Demo 控制的環境旗標，只有原本的瀏覽器 Demo 實作。本次沒有新增環境判斷，也沒有依網址、主題或 `import.meta.env.PROD` 將 Preview 誤判為正式版。正式環境的 Demo 隱藏政策尚無可驗證設定，需在另行導入正式環境設定時處理；本次不擴大到環境或功能改造。

## 分支

獨立分支 `codex/compact-request-editor`，由既有尚未合併的 `codex/slim-login-panel` 建立。新 PR 以該分支為 base，差異只包含本次編輯器優化；依賴 PR #33 的既有 UI。未合併 main、未手動部署 Production、未變更網站存取權限。

## 最終實際截圖

所有畫面使用隔離的示範帳號及測試資料，未讀取或變更使用者案件。

| 尺寸 | 新增淺色 | 新增深色 | 編輯草稿淺色 | 編輯草稿深色 |
| --- | --- | --- | --- | --- |
| 1920×1080 | [檢視](reviews/compact-request-editor/new-1920-light.png) | [檢視](reviews/compact-request-editor/new-1920-dark.png) | [檢視](reviews/compact-request-editor/edit-1920-light.png) | [檢視](reviews/compact-request-editor/edit-1920-dark.png) |
| 1366×768 | [檢視](reviews/compact-request-editor/new-1366-light.png) | [檢視](reviews/compact-request-editor/new-1366-dark.png) | [檢視](reviews/compact-request-editor/edit-1366-light.png) | [檢視](reviews/compact-request-editor/edit-1366-dark.png) |

[390×844 手機深色、末段送簽操作](reviews/compact-request-editor/mobile-dark.png)。

## 驗證紀錄

- `npm test`：43 個測試檔通過，無失敗。
- `npm run test:acceptance`：正式建置及 52／52 驗收通過，涵蓋既有 47 項與新增 5 項。
- 最後調整筆電頂部按鈕換行與容器內捲動後，再次 Production Build 並執行編輯器正式包 5／5 通過，以上截圖均來自最後建置。
- 新案例逐一檢查五階段定位及目前編號、三欄與欄位尺寸、資訊欄寬度、必填錯誤、檢核更新、草稿儲存／重開／再次儲存、建立時間保留與手機送簽按鈕可見。直接比對導覽與捲動區 bounding box，確認沒有相交。
- 首輪驗證修正了新捲動容器的步驟追蹤邊界及 ResizeObserver 重複通知；目前新增檢查與正式包驗收皆通過。
