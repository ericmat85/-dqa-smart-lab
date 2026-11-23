# Digital signature service port (prepared locally)

The existing **System Management → Documents and Reports → Signature Method → Digital Signature** panel now contains the service port form. There is no new settings category. Images/handwritten signatures remain the active method.

This change prepares configuration, capability checking and a PDF verification adapter. **It does not sign PDFs, provision certificates, hold private keys, enable DIGITAL, or approve cases.** A service claiming `sign_pdf: true` cannot unlock signing. Verification results are reports from the configured service, not independent cryptographic verification by this application.

## Configuration and permissions

- Migration `022_digital_signature_port.sql` stores public references in the existing tenant-scoped `dqa_business.settings` table under `digital_signature_port`. No secrets or document bytes belong in that record.
- Only the current active workspace administrator can read/write/check the port or list verification targets. Writes/checks bind the current member and expected configuration revision; stale edits fail with `REVISION_CONFLICT`. Existing audit triggers record configuration changes. Re-saving identical configuration does not advance its database revision.
- The nine configuration fields are `name`, `connection_type`, `base_url`, `auth_mode`, `credential_ref`, `certificate_ref`, `timeout_seconds`, `timestamp_mode`, `allow_checks`. `credential_ref` is an environment variable **name**, never a credential value. `certificate_ref` is an optional external identifier, not a certificate, PFX or private key.
- `HTTPS_GATEWAY` supports an approved public HTTPS service. `INTRANET_GATEWAY` supports an approved HTTPS gateway reachable from the backend; a cloud backend cannot reach laboratory LAN equipment without separately provisioned network routing. Raw TCP, unauthenticated document submission, CSC, smart cards and vendor-specific protocols are not implemented by this adapter.
- Credentials stored in backend runtime secrets must use the `DQA_SIGNATURE_PORT_*` namespace. The browser never receives those values.

## Runtime gates (default closed)

These backend environment variables are deployment instructions for a future approved release; **this task has not changed Render, Vercel, the PR, or the cloud database**.

| Variable | Purpose |
| --- | --- |
| `SIGNATURE_PORT_ALLOWED_ENDPOINTS` | Comma-separated exact canonical HTTPS base endpoints, including port and path, for public services. Example: `https://signer.example.com/dqa`. |
| `SIGNATURE_PORT_INTRANET_ENDPOINTS` | Separate exact endpoint list for approved LAN gateways. |
| `SIGNATURE_PORT_ALLOW_PRIVATE_GATEWAY` | Only literal `true` allows RFC1918/ULA addresses for the approved LAN gateway type. |
| `DQA_SIGNATURE_PORT_TOKEN` | Default bearer credential, managed as a backend secret. |
| `SIGNATURE_PORT_ALLOWED_CREDENTIAL_REFS` | Optional additional allowed environment variable names in the `DQA_SIGNATURE_PORT_*` namespace. |
| `SIGNATURE_PORT_ALLOW_VERIFICATION` | Only literal `true` permits sending an authorized PDF to the service. Connection checking is a separate operation. |

The configured `allow_checks` must also be true. URLs cannot contain HTTP credentials, query parameters, fragments or encoded paths. The server matches the complete approved base endpoint, validates all DNS results, pins a validated address for the HTTPS connection, verifies TLS, rejects redirects and blocks loopback, metadata, link-local and other non-routable addresses. Private networks require both the separate gateway allowlist and explicit routing flag. Timeout is 2–20 seconds, response JSON is limited to 128 KiB.

## Existing business HTTP entry

All operations reuse `/api/business/signature-settings` and the authenticated server session. No new publicly callable signing endpoint is created.

| Operation | Request |
| --- | --- |
| Read port | `GET ?section=port` |
| List readable PDF versions | `GET ?section=targets` |
| Save port | `POST {action: "save_port", member_id, expected_revision, config}` |
| Check connectivity | `POST {action: "check_port", member_id, expected_revision}` |
| Verify report | `POST {action: "verify_report", member_id, expected_revision, artifact_version_id, expected_sha256}` |

PDF verification accepts an immutable artifact version UUID and expected SHA-256, never an arbitrary browser URL or browser-provided PDF. The server checks tenant/report access, MIME type and the 3 MiB limit, reads authorized storage, compares stored size and SHA-256, and rechecks current membership/permissions and configuration revision before outbound submission. It neither overwrites reports nor creates workflow approvals. Unknown save outcomes are read back, not automatically written again. An ambiguous provider verification failure is not automatically resent.

## Gateway contract: `DQA_SIGNATURE_GATEWAY_V1`

This is a prepared DQA adapter contract, **not a claim that a third-party signing service is already connected or compatible**. A future provider must implement this contract, or a backend adapter must translate to that provider's official API.

Capability check: `GET {base_url}/v1/capabilities` with optional bearer authentication. Only HTTP 200 `application/json` is accepted:

```json
{
  "protocol": "DQA_SIGNATURE_GATEWAY_V1",
  "api_version": "1",
  "capabilities": {"verify_pdf": true, "sign_pdf": false}
}
```

Verification: `POST {base_url}/v1/verify` with bearer authentication:

```json
{
  "protocol": "DQA_SIGNATURE_GATEWAY_V1",
  "document": {
    "sha256": "<64 lowercase hex characters for exact PDF bytes>",
    "mime_type": "application/pdf",
    "pdf_base64": "<authorized PDF bytes, encoded as base64>"
  },
  "validation": {
    "require_trust_chain": true,
    "require_revocation_check": true,
    "require_timestamp": true
  }
}
```

HTTP 200 JSON response must echo the protocol and exact document hash. Zero signatures requires `signature_count: 0` and `signatures: []`. At most 32 signatures are accepted:

```json
{
  "protocol": "DQA_SIGNATURE_GATEWAY_V1",
  "document_sha256": "<same 64 lowercase hex characters>",
  "signature_count": 1,
  "signatures": [{
    "integrity": "VALID",
    "certificate_trust": "TRUSTED",
    "revocation": "GOOD",
    "timestamp": "VALID",
    "certificate_sha256": "<64 lowercase hex certificate fingerprint>"
  }]
}
```

Accepted evidence enums:

- Integrity: `VALID`, `INVALID`, `UNKNOWN`.
- Certificate trust: `TRUSTED`, `UNTRUSTED`, `UNKNOWN`. A trusted result requires a fingerprint; otherwise the fingerprint can be null.
- Revocation: `GOOD`, `REVOKED`, `UNKNOWN`.
- Timestamp: `VALID`, `INVALID`, `ABSENT`, `UNKNOWN`.

Digest mismatch, missing evidence, non-JSON response, excess signatures, redirect, TLS or transport failure is not success. The UI displays `UNSIGNED`, `INVALID`, `INDETERMINATE`, or `VALID_REPORTED` as **service-reported** results. A service-reported valid result requires all signature integrity/trust/revocation checks and any required timestamps. It never enables signing or supplies legal/trust assurances independent of that provider.

## Local validation and preview

Migration 022 was applied only to an isolated PostgreSQL database cloned from the existing local migration-021 test database; synthetic SQL cases roll back. API/connector tests inject transport and never call a signing provider, email service or paid model.

```sh
node --test tests/digital-signature-port*.test.mjs tests/signature-settings-http.test.mjs tests/notification-entry-http.test.mjs
node scripts/build-signature-port-preview.mjs /absolute/output-directory
SIGNATURE_PORT_PREVIEW_FILE=/absolute/output-directory/digital-signature-port-preview.html npx playwright test --config playwright.signature-settings.config.mjs
npm run build
```

The portable HTML bundles the real settings components with an explicitly isolated development fixture. It has no network permission or production credentials; saving changes only its dedicated preview browser storage. A connection check deliberately reports that the endpoint is unapproved. This is a downloadable interaction preview, not a deployed release. The production build never imports `dev/digital-signature-port-preview.jsx`.

Before a future deployment, review/apply migration 022 using the existing migration procedure, deploy the matching backend/frontend, configure the intended provider adapter and runtime approvals, then validate against actual signed/unsigned/tampered/revoked PDFs. Actual signing needs a separate implementation for signer authentication/consent, key custody, certificate trust, immutable signed output and timestamping. It must not be activated by editing a readiness flag.
