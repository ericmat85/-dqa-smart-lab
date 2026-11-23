# Shared schedule planning drafts

This is the next connection after manual request review. It preserves the existing
schedule form, desktop/mobile layout and original native demonstration workflow.
Connected requests approved by both LMS reviewers appear immediately as pending
scheduling. The connected save action stores a shared planning draft, not a booking.

## Scope and authority

The `schedules.plan` capability requires LMS/schedule page access and source reads of
requests, equipment and trial catalog. Existing roles/memberships are not changed.
The role editor adds those read prerequisites when that capability is selected.
Read-only users cannot save. The executor directory contains only enabled, confirmed,
unbanned members with an enabled role that grants lab/requests access; directory
reads return identifiers, labels and revisions, not emails or Auth identifiers.

Each draft is bound to one approved request revision and submitted document version.
Quantity and specimen U come from that request and cannot be changed in scheduling.
The database rechecks equipment names against the existing trial profile, IDLE status,
space U, executor and resource revisions, explicit source hours, start/end dates,
preparation/cleanup windows and existing equipment/person reservations.

The existing user-defined humidity rule is 250 continuous hours including weekends.
Vibration is one specimen at a time, 20 hours each on weekdays; three specimens on
one machine starting Friday end Tuesday. Other supported profiles use explicit hours
from the signed request; missing, conflicting or invalid hour facts are rejected.
A changed trial specification version requires review. No physical dimensions,
conditions, signatures, executor or trial data are invented to pass validation.

Equipment category and U checks do not certify temperature/humidity/frequency limits,
fixtures, physical fit or personnel qualifications. The plan records
`physical_feasibility=NOT_ASSESSED` and `operating_conditions=HUMAN_REVIEW_REQUIRED`.
Serial equipment is conservatively checked for existing reservations across its
whole planned window, including weekends between active segments.

## Concurrency and security

Prepare/execute/result use an actor-bound, payload-bound operation ID and two-minute
lease. The UI persists that ID before a single execution. Unknown acknowledgements
lock additional saves and expose result lookup after reload; they are never retried.
A saved operation replays its receipt without another draft revision or audit write.

Request, draft, equipment and executor revisions are captured when the editor opens.
An asynchronous refresh cannot rebind an open form to a later source version.
Workspace/case/planning locks and resource row locks protect each validation/save.
The new table has forced RLS, authenticated SELECT only and metadata audit/revision
triggers. Writes are limited to explicit authenticated RPCs; no service role or client
specified tenant/actor/status is accepted. Recycled requests hide their drafts.

## Boundaries

Drafts can overlap other drafts: they do not acquire reservations or guarantee future
availability. Draft dates are clearly labelled as unbooked, stay pending in the list,
and do not create progress/completion events. Saving never writes `schedules`,
`schedule_equipment`, request status, equipment status or trial execution records.
The final booking command must revalidate all facts and require its own bounded
release. AI recommendations, pause/stop and trial execution are disabled for this
connected draft-only phase; the original native demo behavior remains available.

Migration 011 is additive to immutable 001–010. It adds a draft table, private operation
ledger and five functions; existing workflow gate functions and releases stay intact.
The snapshot omits detailed execution segments to keep shared list reads compact.

Validation uses real isolated PostgreSQL rollback transactions, API fixtures and
independent desktop/mobile browser contexts. Any cloud fixture is also rolled back;
this is not a claim that real supervisors have approved a request. Actual workflow
acceptance still requires activated, assigned, distinct reviewer accounts.

G2_GATE=NOT_PASSED
P08_STATUS=POLICY_BLOCKED
RULE_NOT_APPROVED=MAINTAINED
