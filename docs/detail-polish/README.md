# 系統設定與資訊視窗精修

- 系統設定的資料概況改為四張獨立白底卡片，藍色圖示、輕邊框；桌面四欄、手機兩欄。
- 移除設定頁下方「返回工作入口」整個框格與按鈕。側欄回到首頁保留。
- 試驗資訊只調整底色：主區白底、欄位淺灰、藍色標題強調，深色模式使用相應深藍底色。欄位、兩欄／手機單欄結構、框架、間距與操作不變。
- 設備資訊頁籤與視窗標題／主內容左緣對齊；標題圖示、文字、啟用頁籤、進度條、備註、時間軸與鍵盤焦點的紫色改為藍色，保留既有功能。

## 驗證

Lint、Production Build 通過。六項設定頁回歸（偏好儲存、語言、重查與資料不變）及六項資訊視窗 Production E2E 通過。1920×1080、1366×768、390×844，深淺色皆驗證；涵蓋設備頁籤切換、鍵盤操作、關閉與水平溢出。手機試驗資訊維持原有單欄布局。

以下均為本機實際瀏覽器畫面、Demo 資料，截圖停用過場動畫。

| 畫面 | 1920 淺色／深色 | 1366 淺色／深色 | 手機淺色／深色 |
| --- | --- | --- | --- |
| 系統設定 | [淺色](settings-refined-1920-light.png) · [深色](settings-refined-1920-dark.png) | [淺色](settings-refined-1366-light.png) · [深色](settings-refined-1366-dark.png) | [淺色](settings-refined-390-light.png) · [深色](settings-refined-390-dark.png) |
| 試驗資訊 | [淺色](trial-info-1920-light.png) · [深色](trial-info-1920-dark.png) | [淺色](trial-info-1366-light.png) · [深色](trial-info-1366-dark.png) | [淺色](trial-info-390-light.png) · [深色](trial-info-390-dark.png) |
| 設備資訊 | [淺色](equipment-info-1920-light.png) · [深色](equipment-info-1920-dark.png) | [淺色](equipment-info-1366-light.png) · [深色](equipment-info-1366-dark.png) | [淺色](equipment-info-390-light.png) · [深色](equipment-info-390-dark.png) |

本次僅視覺精修與指定區塊移除，未改動資料模型、驗證、權限、簽核或 API；更新既有 PR #39，未合併 main。
