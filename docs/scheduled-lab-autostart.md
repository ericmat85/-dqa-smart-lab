# Received trials, report templates and the server clock

Formal database mode no longer exposes a manual Start button or the browser Demo accelerator.
The assigned executor signs Receive once. Successful receipt opens the case-specific Excel
download; the request row also offers a repeat download after receipt, while running and after
completion. Existing trial matching covers the twenty types and explicit historical aliases.
The download binds the actual reservation, sample code, equipment, executor and dates. Results,
judgements and signatures remain blank. Missing, ambiguous, stale or unassigned sources stop
the download instead of falling back to another trial template.

The projection retains the legacy schedule ID separately from its database reservation UUID.
This fixes the former mismatch between the received work item and its underlying schedule.
Released allocations remain visible as historical schedule metadata for completed-case reports;
their released state still determines active occupancy in the authoritative database.

## Automatic start

Migration 026 adds `dqa_business.start_due_lab_trials(tenant)` exclusively for the service role.
It selects acknowledged BOOKED schedules with `starts_at <= server time < ends_at`. The
request must still await lab receipt and neither row may be recycled. The executor must remain
enabled, verified and authorized. All reserved devices must be idle with no other running or
paused trial. Workspace, case, schedule and device locks coordinate with booking, account,
resource maintenance and recycle operations. The scheduled dates and end-of-day reservation
are never shortened.

The transaction updates the schedule/request to RUNNING, marks devices IN_USE and records
an immutable SERVER_SCHEDULE_CLOCK event with the actual start timestamp. It does not
impersonate an executor, create a human signature or supply measurements. Existing request
status triggers queue opted-in notifications. The clock neither completes trials nor releases
reservations. Completion still requires the existing elapsed-time, executor, result and signature
checks. Expired bookings require supervisor rescheduling. Receipt during a still-valid reserved
day is allowed; a receipt after the reserved window expires remains blocked.

## Release wiring

Apply migration 026 through the normal guarded migration review after baseline 025. Then
enable `BUSINESS_LAB_AUTOSTART_ENABLED=1` on the existing Render backend. The clock uses
the existing server-only BUSINESS_MAIL_SERVICE_KEY, BUSINESS_MAIL_SUPABASE_URL and
BUSINESS_MAIL_TENANT values, independently of SMTP readiness or the mail-enabled flag.
Do not expose the key to browser code. The ASGI lifespan starts/stops a separate clock thread;
it polls every 30 seconds and can connect only to the fixed Supabase project on HTTPS.
No model invocation, SMTP send or public job-trigger endpoint is added. The web app's existing
15-second snapshot refresh displays committed state. Availability depends on the backend being
running; an outage does not fabricate a start outside the original reservation window.

The RPC is atomic and idempotent across repeated ticks, concurrent processes and lost HTTP
acknowledgements. Each tick checks up to 1,000 due bookings, matching the current snapshot
limit. Multiple instances serialize per tenant. A closed human-workflow policy disables starts.

Keep the local Demo accelerator in the separate browser demonstration build. It does not
write database cases and must not be enabled in formal mode.

Release requires migration026 and the matching backend with explicit clock enablement on existing PR47. Rehearsal support also requires migration027.
