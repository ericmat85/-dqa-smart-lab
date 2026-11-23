# Fixed business gateway and preparation errors

Business API URLs keep their existing names. A fixed `api/business/index.js` function replaces the business catchall function; the Vercel rewrite `/api/business/:path+` → `/api/business?path=:path` sends unmatched business paths to that fixed entry. Existing fixed account, notification, signature-settings and request-draft functions remain available. The function count stays at 12.

The required `+` belongs only in the **source** pattern. The destination substitutes `:path` without a repeat modifier. The official `@vercel/routing-utils` compiler (6.6.1, installed separately for compatibility checking) produces a route requiring at least one segment and destination `/api/business?path=$1`. The root gateway cannot match that source, so it does not rewrite itself. Normal query parameters are preserved.

The gateway uses the existing authenticated business handler. Its logical-route allowlist, UUID validation, duplicate/conflicting path rejection, Origin checks, Session, tenant binding, RPC permissions and revision checks remain in force. No arbitrary upstream URL or RPC name can be supplied. Existing platform-style catchall aliases remain accepted by the parser for compatibility; the physical deployment entry is now fixed.

This covers workflow prepare/execute/result/document/signature paths as well as planning, execution, resource and AI routes. A successful preparation only creates the operation journal; it does not execute submission. An unknown execute result still requires receipt lookup and is never automatically resent.

Preparation errors now retain a bounded HTTP status, error code and Trace instead of replacing the evidence with a generic retry message. The form, saved draft and signature remain available. The HTTP tests reproduce an unmapped HTML response, then verify routed preparation, execution and receipt lookup through an actual local HTTP server and the production handler with synthetic upstream responses. Browser checks use the real handler for the rewritten workflow requests and verify both submission and error preservation.

The existing planning HTTP command whitelist also accepts and validates `sample_space_units` as an integer from 1 to 100000, matching migration 023 and the existing scheduling field. Previously the database accepted that field while the HTTP whitelist rejected it. No new form field or database migration is introduced by this fix.

Validation commands:

```sh
node --test tests/workflow-gateway-http.test.mjs tests/business-connection.test.mjs tests/request-draft-entry-http.test.mjs
npx playwright test --config playwright.request-planning-space.config.mjs --grep 'prepare HTML error|rewritten fixed gateway|owner submits|requester can submit|lost acknowledgement|planner U remains editable'
npm run build
```

Real user data was inspected read-only for diagnosis. No real request was submitted, no signing record created and no notification/model request sent by these tests. Deployment remains a separate user-authorized PR step.
