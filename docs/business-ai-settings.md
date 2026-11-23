# E1–E4 model settings

Settings live in the existing AI engine management pages. Each engine has a workspace-scoped enable switch, credential action, per-call ceiling, cumulative-ledger ceiling, and output token limit. Only a current database workspace administrator with LMS/settings access can read or save them. Browser-supplied roles, actors and workspace IDs are rejected. Configuration reads, writes and readback never invoke a model.

## Credentials

The API returns configured/not configured, source (`INHERIT`, `OVERRIDE`, `NONE`) and at most the last four characters. It never returns the full existing credential. `KEEP` preserves the current source; `REPLACE` encrypts a new engine-specific key; `REMOVE` blocks credential use for that engine without altering the environment or other engines; `INHERIT` returns to the existing backend key source. Blank input is not treated as removal.

Overrides are AES-256-GCM encrypted in the existing private persistent ledger database. Encryption is domain-separated from gateway authentication, with workspace/engine authenticated data. The server gateway secret must remain stable for stored overrides; rotating it requires re-encryption/migration, or re-provisioning overrides. No plaintext key is stored in settings, audit, browser storage, result packets or responses. Only masked data is available to the browser. Provider access is not claimed verified by saving a syntactically valid key.

## Models and cost

The selector lists the99 IDs from the current runtime-key metadata snapshot, plus new IDs returned by the current key. Three documented profiles are eligible: `gpt-6-luna` (input0.10/output0.50 USD per million tokens), `gpt-6-sol` (2.00/10.00) and `gpt-6.1-terra` (1.00/5.00). SOL/TERRA explicitly request reasoning effort `none`; LUNA retains its original parameters. Official model-page evidence, SHA-256 and the2026-11-24 catalog version are pinned in `business_model_catalog.json`. The catalog hash is bound in the business AI policy. This is documented-protocol and MockTransport verification, not a claim of paid inference tests. Other models remain visible but disabled with reasons: specialty output, deprecated documentation, unverified parameters/prices or insufficient per-call ceiling. The server independently rejects disabled/inaccessible profiles even if a client forges the option. Adding a model requires server-side pricing, output-contract and provider-evidence configuration first. The endpoint, prices, original ledger identity, balance and expiry are not editable in this UI.

E1/E3/E4 share the existing E4 ledger; E2 has its existing independent ledger. The editable cumulative ceiling is an engine-specific **gate on that ledger's total historical spent plus held amount**, not a new per-engine/monthly allowance. Therefore other engines' spending in the same group consumes that available amount. Zero stops new calls. Configured ceilings cannot exceed the original server-authorized hard cap or reset historical spending/unknown holds. Policy expiry still applies even if the underlying ledger has a later expiry.

Credential-specific availability is checked with `GET /v1/models`, cached by credential fingerprint (5minutes success,15seconds failure); no inference/retry occurs. Credential/model preflight happens before acquiring the ledger write lock. Status/health never probes these keys, avoiding serial metadata timeouts. The generation request and settlement use the selected model's Decimal prices while preserving the original service/ledger identity. BFF verification checks approved response-model IDs and exact token-price cost with integer arithmetic.

Settings are checked before reserving funds and again in the same transaction that authorizes provider dispatch. Concurrent settings edits invalidate stale, not-yet-dispatched requests and release their reservation. Already dispatched requests still settle or retain an unknown hold through the existing accounting path. No automatic inference retries or model calls are introduced.

## Storage and API

The gateway creates two idempotent tables in each existing private ledger: `business_ai_settings` and `business_ai_settings_audit`. It does not initialize a new ledger or alter budget rows, identities, schema user_version or expires. Failed settings-store initialization does not crash health/recovery routes; scoped generation/settings fail closed.

`GET /api/business/ai/settings/E1` (likewise E2–E4) returns a masked configuration plus limits and usage. `POST` accepts operation_id, expected_revision, enabled, model, per_call_usd, total_cap_usd, max_output_tokens, key_action, and api_key only for REPLACE. Monetary values are decimal strings. Saves use optimistic concurrency and operation fingerprints bound to workspace, engine, actor and content. The audit contains actor/time/revision/operation metadata and no raw keys or configuration input. Lost receipts require readback, never automatic resubmission.

The BFF signs gateway calls and supplies the workspace hash from its authenticated session. **Business generation now requires that workspace** so old unscoped callers cannot bypass the switch or credential/fee controls. Deploy the matching gateway and BFF together when publishing; historical immutable previews with old BFFs will be denied unscoped generation. Result lookup remains available after disabling an engine or removing its key.

## Program FAQ

The existing20 common questions now use program rules in LMS, laboratory and electronic requests, whether or not real-model mode is enabled. Both the floating assistant and shared assistant helper intercept exact Chinese/English FAQ text. Operational questions use fixed instructions. The five count/stock questions read an authenticated, scoped `/snapshot` and calculate counts without a model. They state the current account's visible scope and return unavailable/unauthorized rather than inventing zero when data cannot be read. Late cross-account results and cancellation are rejected. Native sync/completion/progress answers describe database persistence, human completion confirmation, whole-day scheduling and virtual-only acceleration. General conversation and appended/unrecognized questions retain the ordinary AI route.

## Validation and release

All verification uses synthetic database/API fixtures and MockTransport. No paid inference, invitation email, production configuration or business-record mutation is required. An independent portable preview uses the actual React settings component with a synthetic in-memory client; preview saves affect that page only.

This work and the previous minimum-five-second scheduling animation are local, uncommitted changes pending an explicit PR47 publication request. Existing release scripts are completed and must not be rerun. On the next explicitly requested coordinated release, update Render `BUSINESS_AI_POLICY_SHA256` to the revised business policy's hash. Do not change the E2/E4 original provider policy hashes, initialize new ledgers, replenish balances, change plans or bypass private SSO.

## 引擎專屬控制項

控制項與共用模型設定一同保存至既有後端設定儲存區；版本衝突與重送防護適用。舊客戶端未傳控制項時保留已儲存的值。

| 引擎 | 控制項 |
| --- | --- |
| E1 智能審查 | 審查重點、說明程度、建議事項上限（3–8） |
| E2 自動排程 | 候選方案比較重點（綜合／較早完成／較少設備）、理由說明程度 |
| E3 報告生成 | 草稿閱讀對象（工程／主管／客戶）、敘述程度 |
| E4 智能助理 | 回答詳細程度、用詞風格、引用來源數量上限（3–30） |

這些設定只調整建議與呈現。E1 仍需核對所有必要來源；E2 只能比較既有規則核定的候選方案；E3 不可補造量測、判定或簽名；E4 僅引用授權來源。程式常見問題仍繞過模型。流程權限、人工確認、資料範圍、排程工時與資源預約保持原設定。控制項定義的 SHA256 與模型目錄一同綁入業務 AI 政策。
