# Workspace administrator acceptance rights

Workspace administrators can use one authenticated identity for requester submission, request-manager approval/readback, both LMS request-review stages, and both report-review stages. This removes account switching during laboratory acceptance. The exception is restricted to the server-verified workspace administrator flag; a role name or ordinary account-management permission does not grant it.

| Operation | Workspace administrator | Other roles |
| --- | --- | --- |
| Create, edit, submit request | Own drafts only | Existing draft/submission permissions and ownership |
| Request-manager approve/return | Any accessible current case, including own request | Assigned supervisor, separate from requester |
| LMS request review | Current first or second stage, including consecutive reviews by the same administrator | Exact review level and existing participant/separation rules |
| Report review | Current second or third stage, including administrator-owned/submitted reports | Exact level and existing separation rules |
| Report readback, return, archive | Current readback stage without supervisor assignment requirement | Assigned request-manager rules |
| Execution or report submission as another operator | Unchanged | Unchanged |

The request workspace displays creation, draft editing, manager signing, and readback together for administrators. Signing always records the real administrator's member ID, name, signature, document/report version, and operation ID. No second session is created, no requester or supervisor credentials are impersonated, and role/membership rows are not rewritten.

Administrators without a configured supervisor may submit their own request. The case keeps its supervisor field empty; the subsequent manager event identifies the administrator who actually signs. Existing supervisor assignments stay intact. Administrators still cannot submit someone else's draft.

## Preserved checks

Each workflow stage remains sequential. Required signatures, return reasons, captured revisions, source/document bindings, preapproval planning and sample numbering, file attestations, tenant boundaries, append-only history, and operation idempotency remain enforced. Physical execution, equipment availability, scheduling, and compound-test continuity rules are unchanged.

Migration `053_workspace_admin_acceptance.sql` makes guarded replacements in four existing functions. Every replacement must match the expected definition exactly once. Existing migrations 001–052 remain unchanged. The release bundle checks the exact migration/function baseline, unchanged public schema, unchanged unrelated functions, unchanged grants/settings/owners, and unchanged existing business/private rows within the migration transaction. It does not rewrite cases or advance an existing workflow.

## Validation

- Isolated PostgreSQL with synthetic fixtures, Unix socket only: 125 rollback-only tests across request workflow (40), human report workflow (38), preflight sequence (25), and administrator acceptance (22).
- Administrator tests cover same-identity consecutive stages, actual signer attribution, unassigned manager approval/readback, no configured supervisor, privilege revocation, cross-tenant denial, ordinary-role separation, stale revisions, missing signatures, planning/numbering requirements, and archive file attestations.
- 12 browser checks cover desktop/mobile administrator submission and consecutive reviews, ordinary-requester denial, and existing assigned-manager, level-specific, and preapproval flows. Browser API fixtures are synthetic; database tests validate actual SQL authorization.
- Full Node suite: 1,033 passing tests; focused permission/report/browser-registration checks repeated after final edits. Build and lint completed separately.

The additive database migration is applied to the existing shared business backend. Frontend delivery remains an authenticated PR49 Preview. The PR stays open; main and the Production frontend are not updated.
