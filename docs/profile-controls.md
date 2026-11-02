# 個人選單按鈕互動外框

依使用者要求，移除右上角大頭照／名稱按鈕、個人設定與上傳照片的 hover、焦點及按下狀態邊框、outline 與外圈陰影。共用於電子委託、LMS 及 Lab；沒有修改 background、背景變數、文字顏色或操作事件。

`SystemThemeAccents.css` 將這三個按鈕移出原本的互動強調框規則，並針對既有企業樣式覆寫外框。既有主題回歸測試同步採用新的透明邊框預期，上傳照片原有藍色底色持續驗證。

三個系統既有操作回歸 3／3 通過；lint、正式建置及 diff check 通過。另以瀏覽器在同一狀態切換修改前後樣式，確認深淺色的 hover、focus、active 底色一致，外框及陰影消失。

[淺色畫面](reviews/profile-controls/light.png)／[深色畫面](reviews/profile-controls/dark.png)。預覽驗收，不合併 main。
