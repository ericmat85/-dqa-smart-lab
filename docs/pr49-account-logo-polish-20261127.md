# Account overview, request spacing and shared company logo

Account totals now share a single compact summary strip. Total, enabled and disabled counts have aligned tabular numbers and distinct status icons; the strip adapts to narrow screens without adding nested cards. Both the native account manager and the legacy account view use the same component.

Request information dialogs use a smaller top inset. Status and document actions remain centered with explicit gaps, including when a notice appears above them. AI management overview actions now read「設定」and retain their engine destinations. The overview audit table, integration disclosure and maintenance disclosure have been removed; engine-specific settings and controls remain available.

## Shared COLONG IE default

The existing canonical transparent COLONG IE asset is stored through the existing authenticated workspace-image RPC as the shared tenant logo. The company-logo editor shows the actual preview and a default/custom status, and can explicitly select and save the canonical default. All three portals consume the saved shared image. The official default preserves the existing dark-background lettering treatment; ordinary custom uploads retain their normal presentation.

The authorized database operation was executed once after a successful rollback probe. Stored metadata and an authenticated read-back agree: `COLONG-IE-default.png`, revision 1, 496428 bytes, SHA-256 `52e9d575a29843fca76749a10e50dc426d7e3037171fd47cfb4ee8f5f9eb5947`. Only the shared logo configuration and its expected audit event changed. Personal images, business cases, document bindings and existing audit rows were fingerprint-checked and preserved. No schema change or migration replay is required.

## Validation and release

17 distinct browser cases cover desktop/mobile layouts, 320 px, dark mobile, wide desktop, modal gaps, AI navigation and exact-byte logo persistence/read-through across the three systems. Nine Node/API tests pass, including default asset integrity and workspace profile/signature contracts. Build passes; lint has zero errors and 105 existing warnings. Screenshots and machine-readable receipts are retained in `/workspace/work/pr49-account-logo-polish-20261127`.

Delivery remains on PR 49's protected Preview branch. Main, Production frontend, SSO, persistent environment variables and Render configuration stay unchanged. Database migrations through 052 are already installed; do not replay 049–052. The existing stable report-attestation key is checked against the database and used only in the deployment configuration.
