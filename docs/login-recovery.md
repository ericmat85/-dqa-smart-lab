# Account entry, password recovery and loading

The existing login layouts are retained. `/config` asks a service-only database function whether a verified, enabled workspace administrator already exists. The login activation button starts disabled and remains disabled on a failed status read. `/activate` repeats the check before dispatching Auth signup. Invitation callbacks use `/claim` and are not blocked by the self-activation gate.

Forgot-password actions on the connected login pages open `/account/forgot-password`. The BFF accepts only an operation UUID and email, fixes the callback to its own origin, and asks the database for a one-use dispatch grant. The recipient must be a verified Auth identity linked to an enabled, non-deleted member, role and workspace. Eligible, ineligible and suppressed requests receive the same public acknowledgement. Email delivery uses the existing Supabase SMTP configuration; an accepted provider request does not prove inbox delivery.

The private recovery journal contains email and client hashes, never passwords or Auth tokens. Dispatch limits are one per email per 60 seconds, three per email per hour, ten requests per client per hour, and ten provider attempts per hour globally. Replay, provider timeout and lost completion never automatically resend mail. Ledger prepare and finish functions are service-only; the browser has no direct table access.

Recovery callbacks remove URL fragments before claiming the verified session. Passwords need at least 12 characters and matching confirmation. A successful recovery revokes the caller's other durable sessions, updates the Auth password, revokes the current durable session, requests global Auth logout and clears the app cookie. Other users' sessions are untouched. No password or callback token is written to browser storage. The Preview callback allowlist must include the exact `/account/reset-password` URL and the existing `/account/activate` URL.

The SVG favicon uses a flask. Pending bootstrap and business requests share a reference-counted loading state: a circular in-page indicator and circular favicon frames run while work remains, and the flask returns on success or error. Concurrent requests cannot prematurely stop loading. Reduced-motion preferences remove animation. Browser-native navigation indicators remain controlled by the browser.

Validation uses synthetic transport responses and rolled-back database operations. No real reset email is required by automated tests. Live SMTP inbox delivery is confirmed only by the recipient using the feature.
