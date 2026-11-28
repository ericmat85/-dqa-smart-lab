# 實驗室繁中字型（本機交付）

僅在 `/lab` 掛載且既有語言為 `zh-Hant` 時，使用自託管 Noto Sans TC（思源黑體對應的台灣繁體字形）網頁字型。保留現有字級、字重、間距、版面及業務程式。body 的暫時範圍標記涵蓋 React portal 對話框，離開實驗室即清除；不寫入共用偏好。LMS、電子委託、英文及 PDF 產生程式與既有 OTF 不變。

## 基準

- origin: `ericmat85/-dqa-smart-lab`
- main: `eb71006ce80259e1cb7889556d395cef5aa13f41`
- 本機分支：`local/lab-tc-font-20261124`
- 實作、執行驗證基準：PR #49 `ea59fc6430ffcb0c9e81b61057f158e3ff1c6889`
- 作業期間 PR #49 更新至 `3dce31e178cf5867806d154c6e0821ef204ff378`。未覆蓋該更新；本補丁另以暫存 Git index 驗證可套用至新 head 及上述 main。此為套用相容性檢查，不代表在兩個額外基準上執行完整回歸。
- 本次沒有推送、合併、部署、登入遠端 Preview 或操作資料庫。

## 字型來源與授權

- 固定來源：`@fontsource-variable/noto-sans-tc@5.3.1`，npm 原始 tarball `https://registry.npmjs.org/@fontsource-variable/noto-sans-tc/-/noto-sans-tc-5.3.1.tgz`。
- 上游資料：<https://github.com/google/fonts/blob/main/ofl/notosanstc/METADATA.pb>、<https://github.com/google/fonts/blob/main/ofl/notosanstc/upstream_info.md>。
- 保留原始 `OFL.txt`、`metadata.json`，每個 WOFF2 SHA-256 記於 `public/fonts/lab-noto-sans-tc/manifest.json`。
- 108 個 Unicode 分片，總計約 4.3 MB；依實際文字下載需要的分片，並非每頁下載全部。variable weight 100–900；不新增 npm 依賴、不改鎖定檔。
- 字型二進位未修改；CSS 使用私有 family alias `DQA Lab Noto Sans TC`，不覆寫其他入口原有字型註冊。CDP 回報內部 PostScript 名稱 `NotoSansTC-Thin` 是可變字型的內部命名，實際字重仍由原 CSS 決定。
- 新字型請求全為同源 `/fonts/lab-noto-sans-tc/`；沒有新增 Google Fonts 或其他第三方字型請求。基準既有外部字型引用保持原樣。

## 驗證及限制

詳見 VALIDATION.md。瀏覽器用假帳號及本機資料，字型專項測試阻擋所有非 localhost 請求。未把本機結果宣稱為雲端、正式站或實體手機驗收。
