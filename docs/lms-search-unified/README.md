# LMS 搜尋欄與預設收合

- 移除報表分類頁籤下、搜尋欄前的分類說明段落；保留原報表搜尋式樣與篩選／匯出功能。
- LMS 試驗委託、排程管理、設備管理、物料管理、資料庫、帳號管理、歷史委託及歷史排程統一共用搜尋元件：18px 放大鏡、36px 輸入欄、12px 字體與清除篩選按鈕。
- 保留各頁搜尋欄位、角色／狀態篩選及歷史分類；清除按鈕重設搜尋與該區原有篩選預設。
- 系統設定「介面外觀」預設收合，展開後仍可修改字體與語言，偏好儲存機制不變。

## 驗證

Lint、Production Build 通過。七項報表回歸、六項系統設定回歸，以及四項搜尋統一 Production E2E 通過（共17項，分批執行）。搜尋測試覆蓋八個 LMS 頁面、1366／390、深淺色、尺寸、相同圖示、搜尋與清除；另驗證報表說明移除、外觀預設收合與展開後可儲存。

以下為本機實際瀏覽器截圖，使用 Demo 資料。

| 畫面 | 桌面淺色／深色 | 手機淺色／深色 |
| --- | --- | --- |
| 試驗委託 | [淺色](search-requests-1366-light.png) · [深色](search-requests-1366-dark.png) | [淺色](search-requests-390-light.png) · [深色](search-requests-390-dark.png) |
| 資料庫 | [淺色](search-archive-1366-light.png) · [深色](search-archive-1366-dark.png) | [淺色](search-archive-390-light.png) · [深色](search-archive-390-dark.png) |
| 帳號管理 | [淺色](search-accounts-1366-light.png) · [深色](search-accounts-1366-dark.png) | [淺色](search-accounts-390-light.png) · [深色](search-accounts-390-dark.png) |
| 歷史委託 | [淺色](search-requests-history-1366-light.png) · [深色](search-requests-history-1366-dark.png) | [淺色](search-requests-history-390-light.png) · [深色](search-requests-history-390-dark.png) |
| 報表分析 | [淺色](reports-clean-1366-light.png) · [深色](reports-clean-1366-dark.png) | [淺色](reports-clean-390-light.png) · [深色](reports-clean-390-dark.png) |
| 外觀預設收合 | [淺色](appearance-collapsed-1366-light.png) · [深色](appearance-collapsed-1366-dark.png) | [淺色](appearance-collapsed-390-light.png) · [深色](appearance-collapsed-390-dark.png) |

更新既有 PR #39，未合併 main。
