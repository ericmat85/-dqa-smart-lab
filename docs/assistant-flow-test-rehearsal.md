# Assistant-operated flow-test rehearsals

Users open the existing AI assistant and enter `/accelerate`, `/flow-test`, or an explicit
Chinese accelerator command. The command opens controls without calling a language model.
It never executes a database write by itself. The former standalone Demo button is removed.

## Scope and identity

The database-backed accelerator is a separate execution rehearsal, linked to an existing
received case. It is not an accelerated production trial. The administrator selects the case,
enters a reason and types `FLOW TEST <case number>`. The server records a new immutable
source snapshot and a permanently marked `FLOW_TEST` run. No new production request is
created. There is at most one run per case; changing a source case never silently replaces
the frozen snapshot. Participants see both the original revision and the rehearsal revision.

Only a workspace administrator may create the marked copy. An administrator or the current
assigned, authorized lab executor may advance it. All reads and writes check current tenant
membership, request visibility, active case state, role permissions and schedule assignment.
The browser cannot submit an arbitrary percentage, clock, tenant, role or source document.

## Time calculation

`W = scheduled ends_at - scheduled starts_at` is the authoritative calendar window. Nominal
test hours remain a separate source field. `p` is a server-selected checkpoint: 0%, 50%, 100%.

`virtual elapsed = W × p / 100`

`virtual timestamp = original scheduled start + virtual elapsed`

Every operation also records its actual server timestamp. Actual operation time is never
backdated to the virtual timestamp. A two-minute equivalent is shown as a reference only:

| Original test | Scheduled window | At 50% | Two-minute equivalent |
| --- | --- | --- | --- |
| 1 nominal hour, one scheduled day | 86,400 seconds | 12 calendar hours | 720× |
| 250 nominal hours, eleven scheduled days | 950,400 seconds | 5.5 calendar days | 7,920× |

This preserves the agreed whole-day scheduling policy. Weekend gaps and other calendar
gaps remain part of W; this is a rehearsal of the reserved calendar window, not proof of
delivered test hours. The UI uses explicit checkpoints, not an automatic two-minute timer.
The actual effective ratio can be calculated only after at least one real second elapsed;
subsecond operations do not display a fabricated infinite multiplier.

## Production isolation

Rehearsal functions write only three new private tables: runs, operation receipts and append-only
events. They do not change requests, schedules, equipment, reservations, measurements,
approvals, signatures, reports, stock or AI ledgers. Production completion and report upload
remain gated by the real workflow. Rehearsal 100% cannot unlock a production report upload.
The pending real schedule clock from migration 026 continues to operate independently.

A downloadable HTML record includes the frozen source hash, original schedule/hours,
virtual checkpoints and actual server times. It is prominently marked
`流程測試｜非正式試驗結果`, contains no generated measurement, PASS judgement or signature,
and cannot be submitted as a production Excel report. It has no external dependencies or
scripts; untrusted labels and reasons are HTML escaped. Original trial report templates and
signed production artifacts are not rewritten or watermarked by this feature.

The existing browser Demo remains confined to its separate demonstration environment. Its
accelerator is now reached from the same assistant command, including the isolated tour.
It continues to mutate only isolated browser data; it does not use the formal rehearsal RPC.

## HTTP and operation guarantees

Authenticated application routes use the caller's JWT and server-selected tenant:

- `POST /flow-tests/preview`: readonly source and existing-run preview.
- `POST /flow-tests/execute`: explicit CREATE or ADVANCE, with an operation UUID and captured revision.
- `GET /flow-tests/run/<request UUID>`: authorized current run.
- `GET /flow-tests/result/<operation UUID>`: actor-owned durable receipt.
- `GET /flow-tests/report/<request UUID>`: private marked HTML download.

The server locks membership, case and run state, checks a source hash before creation, enforces
compare-and-swap revisions and records a canonical command fingerprint. Replaying the exact
same operation returns its receipt without a second advance. Reusing an operation with a
different command is rejected. Unknown outcomes remain pending and are reconciled by GET
when controls are reopened. NOT_FOUND is not treated as permission to resend a write that
may still be in flight. There is no model-generated or background automatic mutation.

Deployment requires migration027 after026, with the matching application on existing PR47.
No additional external service, secret, AI call or paid product is required. Development validation uses local synthetic data. Deployment does not create or advance a rehearsal; administrators must explicitly mark each copy in the UI.
