# Manual request submission and human review

This release implements the requested shared-data acceptance and manual request workflow
in the existing desktop/mobile UI. The authorized scope is owner draft/submission,
assigned request-manager approval/return, LMS level-one and level-two human review,
and immutable submitted document/signature history. It stops at awaiting scheduling.
AI approval, scheduling writes, laboratory execution and report publication stay gated.

## Identity and workflow

`requests.submit`, `requests.review_manager` and `requests.review_lms` are explicit role
capabilities. The role editor includes source reads needed for those choices. Existing
roles, memberships, permissions, emails and review levels are not automatically changed.
The owner must have an activated, enabled, different supervisor configured in account
management. A supervisor may also serve at one LMS level; a requester cannot approve
his/her own case, and one person cannot approve both LMS levels, including across
correction rounds or after a role change. LMS review requires its exact current level,
LMS system access, requests page access and the human review capability.

State transitions are:

`DRAFT/RETURNED → AWAITING_REQUEST_MANAGER → AWAITING_LMS_REVIEW (0 → 1) → AWAITING_SCHEDULING (2)`.

An assigned current reviewer can return with a reason. Returned content can be edited
only by its owner and resubmitted as a new immutable version. Each submission requires
product/customer, quantity, trial, specification, acceptance criteria, requested date,
positive sample space U, purpose, an activated supervisor and an explicit signature.
There is no fabricated assignment, signature, specimen space or auto-approval fallback.

## Version and signature evidence

`request_document_versions` freezes all submitted form content and participant identifiers
and labels. SHA256 is calculated over PostgreSQL's canonical JSONB text. The preview
retrieves that exact canonical text and verifies its digest before showing the version.
The UI preserves previous versions when a correction is resubmitted.

Each manual decision creates an append-only `approval_events` entry bound to that version
and the actual session actor. `request_signatures` stores the validated PNG/JPEG bytes and
SHA256, referencing the approval event and document version. Snapshot reads contain only
image metadata; image bytes are fetched separately under request/tenant RLS and checked
against their digest. Records retain `NOT_VERIFIED`: a stored signature image and an
application account do not constitute external certificate or legal signature verification.

## Gate boundary

Migration 010 creates a private per-tenant policy, closed by default. The limited release
for this task can enable only `MANUAL_REQUEST_ONLY` for the existing workspace. This is
the user's requested manual-business-flow scope, not a pass of the AI/laboratory policy
gates. No client or UI can edit the release policy or transition permits.

The workflow/approval gate triggers remain in place. An approved manual RPC creates a
transaction-bound, actor-bound permit for one precise request/event/transition, then
removes it in the same transaction. A caller-set GUC, direct status change, forged event,
AI action, scheduler or report operation cannot use this exception. This release does
not disable triggers, remove RLS, grant direct table writes or use an application service
role. Migration 001–009 files stay immutable; only additive 010 is applied.

## Concurrency and failure handling

Commands prepare a two-minute payload-bound operation ID, which the browser must persist
before execution. Execute is sent once. Lost acknowledgements lock further writes and
permit result lookup, never automatic submission/review retries. An unexecuted expired
plan can be atomically expired so a late execute is rejected. A saved receipt replays
without adding another decision/signature. The database rechecks the actor's capability,
request state and revision. Review screens retain the revision captured when opened,
so a background refresh cannot silently rebind an existing signature to changed content.

Workspace-access and case-maintenance locks prevent review from racing membership changes
or case recycling. Frozen versions/signatures are hidden with their recycled request and
become readable again if that request is explicitly restored.

## Validation and data cleanup

Local validation uses rollback-only synthetic PostgreSQL fixtures and independent desktop/
mobile browser contexts against API fixtures. Cloud resource acceptance runs the existing
RPCs/RLS in a transaction ending in ROLLBACK: create/edit/service history, material issue,
over-issue rejection, idempotence and read-only denial. Actual user login in private SSO
and actual human approvals require the user's browser and activated supervisor accounts.

The current imported legacy dataset was compared with the original export. All 50 review
rows lack formal owner/supervisor account bindings, positive specimen U and version-bound
signature records. These rows and their 34 schedules/12 operation records were moved to
the existing recoverable recycle bin through an exact fingerprinted plan. Raw import rows,
source envelope/export, 20 equipment records, 20 trial definitions, accounts and system
audit history remain intact. The quality report, backup checksum, run ID and receipts are
kept outside Git; no user business export is committed.

G2_GATE=NOT_PASSED
P08_STATUS=POLICY_BLOCKED
RULE_NOT_APPROVED=MAINTAINED
