# 驗證紀錄

測試日期：2026/10/31（台灣）。使用 Linux Chromium 自動化與隔離的瀏覽器資料。

## 命令

```sh
npm run lint
npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/lib/chromium/chromium npm run test:e2e
```

## 最終結果

| 指令 | 實際結果 |
| --- | --- |
| `npm run lint` | 完成、exit 0；保留原有 4 項 RequestApp purity 警告，沒有新增警告 |
| `npm test` | 168 通過、0 失敗、0 跳過，約 32 秒 |
| `npm run build` | 成功；保留既有大 bundle 提醒（ExcelJS／字型等），未增加相依套件 |
| 完整 `npm run test:e2e`（以上 Chromium 環境變數） | 68 通過、0 失敗、0 跳過，約 4.1 分鐘 |

完整驗證包含既有案例與本次工作區案例，不以測試數量取代下面列出的實際操作驗證。最後的操作列／截圖與焦點微調後，另以 `--grep "workspace responsive|actual 200|dashboard logo"` 針對 10 個相關情境復驗，全部通過（約 34 秒）。來源同時保存於交付壓縮檔 `logs/`，沒有只提供測試檔案數或自行評分。

## 既有流程與此次驗證

- 委託者／主管登入、密碼錯誤、登出與角色頁隔離。
- 部分草稿儲存、恢復、再編輯、刪除；送簽必填檢查與試驗搜尋帶入。
- 自訂規範／判定基準覆蓋前確認；取消選擇保留原文。
- 未儲存返回、Esc 與 browser Back 的繼續／放棄操作；放棄後 browser Forward 仍正常。
- 儲存配額失敗時保留表單、不宣稱儲存成功；「儲存草稿後離開」失敗時也在確認窗內直接呈現錯誤；損壞本機資料顯示讀取錯誤且不覆寫原文。
- 搜尋、欄位、狀態、需求日期與排序／頁碼的 URL 組合及重整恢復；無結果重設頁碼。
- Dashboard 統計卡與集合列表一致，55 筆混合案件、長名稱與多頁資料。
- 空委託、無待簽核、無待查閱、無搜尋結果各自訊息。
- 主管退件、簽名核准、重新送簽與既有簽核歷程；後續 LMS 審查、排程、試驗、報告退回重送、兩階報告審核、指定主管查閱封存 PDF 的原測試保留。
- 原有單元測試涵蓋禁止自審與同人跨階審查；本次沒有移除服務檢查。
- 純日期與台灣時間、月底 UTC 跨日、無效日期、日期提醒排除終止／取消／結案。
- 非同步報告讀取被瀏覽器拒絕時顯示錯誤及重試按鈕，電子委託資料保持原樣。
- 0 通知不顯示紅徽章，Demo 重設取消不更動案件或帳號。
- 各入口登入頁與主題色、LMS 排程、借用及資料庫等共享元件回歸。

## 尺寸與模式

| 尺寸 | 驗證範圍 |
| --- | --- |
| 1920 × 1080 | 委託者總覽、列表、表單／錯誤；主管總覽、簽核／查閱列表、明細；深淺色截圖 |
| 1366 × 768 | 同上 |
| 1280 × 720 | 同上 |
| 768 × 1024 | 同上；收合導覽 |
| 390 × 844 | 同上；單欄表單、收合導覽、手寫簽名實際 pointer 操作 |
| 683 × 384 CSS px | 額外窄視窗／短高度壓力測試；不單獨當成原生 200% 證據 |
| Chrome 200% | 獨立 persistent context 的 `chrome://settings/appearance` 選擇 200%，驗證 devicePixelRatio=2、1366 寬視窗的 innerWidth=683，實際操作案件列表、收合導航與簽名區送簽按鈕；截圖另存 |

每個指定視窗均檢查 document 無水平溢出。案件表格在自身容器捲動；沒有把所有欄位硬塞進手機。操作列使用文件流，並提供儲存／送出跳轉，避免浮層遮擋簽名與最後欄位。表單區段導覽、明確焦點、單層選擇器與簽名畫布均保留。

## 沒有聲稱已驗證的項目

- 沒有 Windows Edge／Safari 實機人工驗收、螢幕閱讀器或完整 WCAG 稽核。
- 實體觸控筆沒有測試；390 寬 Chromium 使用 pointer 事件實際畫簽名。
- 關閉整個瀏覽器與 OS 強制終止無法保證保留未儲存內容；beforeunload 提示也受瀏覽器政策限制。
- 沒有真實後端、多裝置同步或公司資料的整合驗證。
- 並非每個頁面都有修改前截圖；保留的 baseline 與缺漏已在主交付文件列明。baseline 總覽是原有空資料 Demo，改善後另外以 55 筆混合假資料驗證大量案件，因此不以畫面上數字作為前後資料比對。

## 修改檔案清單

- `docs/REQUEST-WORKSPACE-UX.md`
- `docs/REQUEST-WORKSPACE-VALIDATION.md`
- `docs/request-ux-screenshots/README.md`
- `docs/request-ux-screenshots/after-dashboard-1366.png`
- `docs/request-ux-screenshots/after-detail-dark-390.png`
- `docs/request-ux-screenshots/after-form-1366.png`
- `docs/request-ux-screenshots/after-list-390.png`
- `docs/request-ux-screenshots/after-native-200-form.png`
- `docs/request-ux-screenshots/after-native-200-list.png`
- `docs/request-ux-screenshots/after-native-200-signature.png`
- `docs/request-ux-screenshots/before-dashboard-1366.png`
- `docs/request-ux-screenshots/before-form-1366.png`
- `e2e/demo.spec.js`
- `e2e/login-layout.spec.js`
- `e2e/request-borrow-ui.spec.js`
- `e2e/request-workspace.spec.js`
- `e2e/request-zoom.spec.js`
- `e2e/system-theme.spec.js`
- `src/App.jsx`
- `src/ClearCasesButton.css`
- `src/ClearCasesButton.jsx`
- `src/LabApp.jsx`
- `src/LmsApp.jsx`
- `src/Pagination.jsx`
- `src/ReportArchive.jsx`
- `src/ReportUi.jsx`
- `src/RequestApp.jsx`
- `src/RequestEditorPage.jsx`
- `src/RequestInfoModal.jsx`
- `src/RequestListToolbar.jsx`
- `src/RequestSignatures.jsx`
- `src/RequestWorkspace.css`
- `src/RequestWorkspaceUi.jsx`
- `src/SignatureHistory.jsx`
- `src/SystemHeaderActions.jsx`
- `src/UnifiedLoginForm.css`
- `src/requestWorkspace.mjs`
- `src/useReportSnapshot.js`
- `tests/requestWorkspace.test.mjs`
