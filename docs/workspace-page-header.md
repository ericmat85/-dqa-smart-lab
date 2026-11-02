# 統一頁首、頁面標題與新增委託步驟列

依使用者提供的新增試驗委託單參考圖，將 LMS、電子委託及實驗室的麵包屑導引移到上方 Header 左側，通知與帳號工具保留在右側。Header 統一為 48px，頁面標題位於下方內容區，採圖示搭配 22px 標題；既有主要操作保留於標題區。DQA 仍僅有展示登入入口，沒有新增內頁。

## 新增委託單

- 頁面標題調整為「新增試驗委託單」，上方提供儲存草稿、重設及下一步。
- 步驟定位改為圓形編號與水平連線，選中區段以藍色圓點表示；支援點選、鍵盤定位及既有捲動區段追蹤。
- 「下一步」定位到下一個現有表單區段，最後前往原本的送簽操作，不跳過欄位驗證、簽名或主管指定。
- 儲存草稿操作移至上方，保留單一按鈕，沿用原有儲存函式。正式送簽按鈕仍在表單底部。
- 重設僅還原本次編輯起點的表單與草稿簽名；未儲存修改先顯示確認，不刪除已存案件或更改簽核狀態。
- 五區段沿用現有資料分類：「基本資料、試驗項目、樣品與條件、備註與判定、確認送簽」。參考圖的「附件與備註」未直接套名，避免讓既有備註／判定區看似新增了未實作的附件功能。
- 手機標題與操作自動換行，步驟列可水平捲動，頁面本身不橫向溢出。

## 修改檔案

| 檔案 | 用途 |
| --- | --- |
| `src/WorkspacePageHeader.css` | 共用頁首、標題與步驟列樣式 |
| `src/LmsApp.jsx`／`src/RequestApp.jsx`／`src/LabApp.jsx` | 將原有導引移至 Header；電子委託加入本次重設處理 |
| `src/RequestEditorPage.jsx` | 上方操作、圓形步驟定位，保留原有區段與右側資訊 |
| `src/i18n.mjs` | 新按鈕與重設提示的英文翻譯 |
| `e2e/workspace-page-header.spec.js` | 導引位置、步驟定位、欄位保留與重設保護 |
| 既有 LMS 與偏好測試 | 將舊頁首系統標題選擇器改為麵包屑；字體檢查定位到當前頁面的標題 |

## 畫面

桌面視窗為 1440 × 900，手機為 390 × 900，皆使用獨立測試瀏覽器與 Demo 帳號。完整表單截圖高度超過視窗，因所有原有區段仍保留。

| 畫面 | Light | Dark |
| --- | --- | --- |
| LMS 頁首 | [檢視](reviews/workspace-page-header/header-lms-light.png) | [檢視](reviews/workspace-page-header/header-lms-dark.png) |
| 電子委託頁首 | [檢視](reviews/workspace-page-header/header-request-light.png) | [檢視](reviews/workspace-page-header/header-request-dark.png) |
| 實驗室頁首 | [檢視](reviews/workspace-page-header/header-lab-light.png) | [檢視](reviews/workspace-page-header/header-lab-dark.png) |
| 委託單桌面 | [檢視](reviews/workspace-page-header/editor-light-1440.png) | [檢視](reviews/workspace-page-header/editor-dark-1440.png) |
| 委託單手機 | [檢視](reviews/workspace-page-header/editor-light-390.png) | [檢視](reviews/workspace-page-header/editor-dark-390.png) |

頁首調整前畫面見 [前一輪側欄驗收](unified-sidebar.md)，表單原區段定位外觀見 [Phase 3 電子委託](enterprise-request-v2.md)。

## 驗證

- lint、正式建置及 diff check 通過。
- 最終正式包整合驗收 44／44 通過。
- 最終頁首與表單互動檢查 10／10 通過；LMS 登入、重新整理、切頁與登出補測 1／1 通過。
- 擴大回歸首輪 56 項通過、1 項因測試在設定頁尋找儀表板標題而逾時。將字體檢查改為當前設定頁標題後，偏好與圖表測試 5／5 補測通過；沒有未解決的測試失敗。

範圍包含頁首導引、桌面與手機、深淺色、步驟點選與下一步、欄位保留、重設確認、草稿儲存、未儲存離開保護、主管權限、簽名、語言字體及每頁筆數偏好、Chrome 200% 縮放。

本次未變更帳號、業務資料、後端介面或九階案件流程。預覽供使用者驗收，不合併 main。
