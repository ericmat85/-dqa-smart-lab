# 登入面板瘦身與直角調整

依使用者提供的電子委託登入截圖，縮窄共用右側登入面板並移除左上、左下圓角。套用電子委託、LMS、Lab 與 DQA 展示入口，深淺色一致。

- 桌面面板依視窗寬度取 34%，最窄 360px、最寬 520px；721–1000px 視窗使用 350px 面板。
- 1920px 視窗實測：面板由約 784px 調整為 520px，左上及左下圓角均為 0px。
- 手機維持單欄全寬，移除圓角及原先向上覆疊 10px 的樣式，品牌區與登入區平直接合。
- 僅修改 `src/EnterpriseLogin.css`；登入驗證、帳號、角色及欄位功能沿用既有實作。

## 同尺寸畫面比較

1920 × 1080，瀏覽器實際截圖。調整前畫面在相同版本套用 main 原有登入 CSS，以隔離這次樣式差異。

| 主題 | 調整前 | 調整後 |
| --- | --- | --- |
| 淺色 | [檢視](reviews/slim-login-panel/before-light.png) | [檢視](reviews/slim-login-panel/after-light.png) |
| 深色 | [檢視](reviews/slim-login-panel/before-dark.png) | [檢視](reviews/slim-login-panel/after-dark.png) |

## 驗證

- `npm run lint`、`git diff --check`：通過。
- 正式建置及跨系統驗收：44／44 通過，涵蓋深淺色、手機及英文大字體。
- 既有登入版型、登入欄位及系統主題回歸：20／20 通過。
- 1920px 深淺色實測面板寬度為 520px，左上及左下圓角為 0px。
