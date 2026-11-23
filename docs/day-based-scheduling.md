# Whole-day scheduling policy

The user requested that even a one-hour test be scheduled in days. For new or resaved shared database plans, each batch occupies at least one full calendar day. A short serial batch cannot share the rest of that day with another batch. Capacity/U still determines how many samples form a batch, and selected parallel equipment still runs concurrently.

- One1-hour batch: one whole day.
- Two1-hour serial batches: two operating days; weekday trials skip weekends.
- Continuous25-hour exposure: two calendar days.
- Continuous250-hour exposure: eleven calendar days; nominal test duration remains250hours.

Nominal hours, quantity and execution segments remain separate from scheduling days and reservation boundaries. `hours_per_batch` and `execution_ends_at` describe the planned test work; `ends_at` is the exclusive midnight after the last scheduled day. `scheduling_days` counts applicable operating/calendar days and `calendar_days` includes intervening weekends. These are planning facts, not measured execution results.

Equipment and executor conflict checks use whole-day ranges. Preparation starts round down to the applicable day's midnight, and reservation ends round up after accounting for nominal work and cleanup, with no extra day when an endpoint is already exactly midnight. Cleanup that fits within an already reserved day consumes that day rather than an extra day. Existing operating-day and daily-hour feasibility constraints remain. Formal booking persists the authoritative `reserve_from`/`reserve_until` fields; its existing start/completion time gates use the whole-day planned window.

Preview, E2 candidates, strict draft saving and booking share the backend calculator in the pending migration025. E2 receives explicit day-unit metadata and cannot replace verified candidate dates. The frontend shared-form helper follows the same batching rules. The existing Demo engine keeps its established hourly execution simulation. Report/read projections retain nominal test hours alongside the scheduling metadata, so a one-day reservation is not reported as24hours of test exposure.

No existing signed document or already booked schedule is rewritten. Deployment requires migration025 and the matching frontend/server on existing PR47. The prior real E2 verification establishes provider connectivity under the earlier calculation rules. No new provider inference was issued for this day-policy update, and no claim is made that a signed-in remote browser flow has been validated.
