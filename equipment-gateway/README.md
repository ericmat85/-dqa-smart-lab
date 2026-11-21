# 現場設備唯讀閘道

此元件獨立於 Render 的 AI Gateway，部署於能存取實驗室設備的現場電腦。網站的「系統管理 → 試驗與設備參數 → 設備端口設定」可先保存及匯出端口草稿；草稿位於目前瀏覽器，沒有自動採集、雲端保存或設備控制功能。

支援 Modbus TCP、Modbus RTU（8 data bits，RS-232／具自動方向控制的 RS-485 轉接器）及 HTTP／HTTPS JSON GET。Modbus 僅接受功能碼 03、04；不能寫入暫存器、啟停試驗或修改設備設定。HTTP 只允許現場政策核准的精確 GET 路徑，必須由設備管理者確認該路徑不會改動設備。

## 端口預作

1. 建立端口，選擇已存在的設備與通訊協定。
2. 未有手冊的 IP、串列端口、暫存器位址、JSON Pointer 可留白；畫面顯示「待補通訊資料」，不測試、不猜測。
3. 取得手冊後核對 Unit ID、零起算暫存器位址、資料型別、32-bit 字序、倍率／偏移或 JSON Pointer。若手冊採 40001 編號，應先確認原廠規則，再自行換成零起算位址，程式不自動扣除 40001。
4. 匯出 JSON 供現場人員核對。檔案不含任何權杖，匯出不會套用到設備或閘道，也不會掃描內網。

## 安裝與啟動

Python 3.11+；TCP／HTTP 只使用標準函式庫。RTU 需在現場安裝 `python -m pip install -r equipment-gateway/serial.requirements.txt`，缺少驅動時 API 與 UI 明確顯示無法測試，仍可預作草稿。

複製 `policy.example.json` 至版本庫以外的安全目錄。`targets` 預設為空，**不允許任何設備通訊**。加入經核准的目標，例如以下示意值，需以實際網路／手冊資料替換：

```json
{
  "allowedOrigins": ["https://your-lab-site.example"],
  "targets": [
    {"id":"chamber","protocol":"modbus-tcp","host":"192.168.10.20","port":502},
    {"id":"serial-meter","protocol":"modbus-rtu","serialPort":"COM3","baudRates":[9600],"parities":["N"],"stopBits":[1]},
    {"id":"environment-json","protocol":"http-json","host":"192.168.10.30","port":443,"scheme":"https","paths":["/telemetry"],"bearerEnv":"LAB_SENSOR_TOKEN"}
  ]
}
```

IP 必須是明確的 IPv4／IPv6 literal，不解析任意主機名稱、不追隨重新導向；拒絕 multicast、unspecified、link-local 及預設的 loopback 目標。RTU 端口為**現場閘道的串列埠**，不是手機或 Vercel 的埠。JSON Pointer 採 RFC 6901，例如 `/sensors/0/temperature`；只接收有限數值。

以安全方式在現場程序環境設定 `DQA_EQUIPMENT_ADMIN_TOKEN`（至少 32 個 ASCII 字元）及可選、不同值的 `DQA_EQUIPMENT_READ_TOKEN`。不要把權杖貼到對話、JSON、原始碼或版本庫。API 的 reader／admin 憑證均只能讀取，前端 Demo 的角色權限不是現場閘道的安全邊界。設備 Bearer 憑證只從現場環境的 `bearerEnv` 讀取，僅允許 HTTPS 目標。

```bash
python -B equipment-gateway/server.py --policy /secure/equipment-policy.json --database /secure/equipment-audit.sqlite
```

預設只聽 `127.0.0.1:8765`。遠端使用需經受信任 HTTPS 反向代理，或使用 `--host 0.0.0.0 --tls-cert /secure/gateway.crt --tls-key /secure/gateway.key`。手機／電腦需經實驗室網路或 VPN 連到此 HTTPS 閘道；不要公開工控設備的原始端口。CORS 只允許政策的精確網站 Origin，不允許 `*`、Cookie 認證或前端自報管理者。

在網站填入 HTTPS 閘道根網址與權杖，按「驗證閘道」。權杖僅存在本頁記憶體；切換頁籤／離開頁面後清除。驗證成功只代表閘道可用。填完實際資料後按各端口的「讀取測試」，成功時顯示本次讀值、時間與 Trace；沒有背景輪詢，也不會把 TCP 握手成功當作資料讀取成功。

## API 與限制

- `GET /v1/capabilities`：需精確 Origin 與 Bearer，回覆協定驅動可用性。
- `POST /v1/read`：JSON `{ "port": <匯出檔中的單一完整端口> }`。需至少 revision 1 與完整資料；目標必須匹配現場 allowlist。
- 不提供寫入、任意 socket、任意 URL 代理或遠端修改政策的 API。
- 每個目標同時最多一次讀取，全域最多四次；不自動重試。SQLite 只保存讀取稽核，不保存權杖或原始回應。
- Modbus 以 transaction／Unit ID／功能碼／長度／CRC 驗證；HTTP 限制 JSON 64 KiB、拒絕重新導向，HTTPS 不跳過憑證驗證。
- API 回覆只是單次測試證據，不是持續可用性、校驗結果、排程可行性或正式試驗結果。
- 啟動政策不會自動載入網站草稿；需人工核對許可目標。更改政策後需由現場管理者重新啟動閘道。
- `--allow-loopback-targets` 僅供本機模擬器測試使用；不能據此宣稱真實設備驗收通過。

## 驗證

```bash
python -B -m unittest discover -s equipment-gateway -p 'test_*.py'
```

現有正式硬體驗收仍需原廠通訊手冊、實際 IP／串列埠、現場網路、TLS、憑證及已核准的讀取欄位。本階段不會變更既有 Render、AI 預算或 Production。
