# Browser validation modes and request deadlines

`npm run test:e2e` uses explicit Playwright projects. Each server overrides all
frontend mode flags and refuses to reuse an unrelated server already on its port.
This prevents an inherited environment or an existing Demo server from changing
authenticated tests into Demo tests.

| Mode | Source | Boot flags | CI shards |
| --- | --- | --- | --- |
| demo | Remaining Demo UI specs, including the separate connected workspace | Business, business AI and private preview off | 6 |
| preview | Synthetic preview transport / local engine specs | Private preview on; business off | 2 |
| business | Original authenticated workspace and profile fixture specs | Business on, business AI off | 3 |
| business-ai | Authenticated AI, notifications and signature specs | Business and business AI on | 1 |

The file ownership map is `scripts/ci/browser-modes.mjs`. Its tests check that
explicit entries exist, do not overlap, and that API-dependent specs use their
required mode. Authenticated groups run desktop and mobile Chromium projects.
Extra browser contexts inherit their project URL rather than a fixed port. Local
parallel shards can set a distinct `PLAYWRIGHT_PORT_OFFSET` (0–1000); CI jobs
run on separate machines and use the base ports.

Live business backend flags are disabled in these dev servers; their browser
specs supply synthetic responses. No model call, mail delivery or cloud data
mutation is needed for these checks.

CI uses two workers per job, no retries, and a 20-minute job limit. Local runs can
use four workers. Tests are distributed **within each mode**: six Demo, two preview, three
business and one business-AI shard. Layout-heavy Demo files and the native
desktop/mobile flows are split further to leave setup headroom within the
20-minute cap, rather than mixing all modes in four jobs. A wrong `BROWSER_MODE` fails configuration immediately.

Examples:

```sh
BROWSER_MODE=business npm run test:e2e -- --shard=1/3
BROWSER_MODE=business-ai npm run test:e2e
npm run test:e2e -- --workers=4
```

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to select an installed Chromium. If it
is absent, Playwright uses its installed browser; CI does not assume that
`/usr/bin/chromium` exists. Existing dedicated configs remain available for
focused regression checks.

## Diagnostics and storage quota

Successful review screenshots are omitted when `CI=true`; assertions still run.
Playwright captures failure screenshots and retains failure traces. Set
`CAPTURE_SUCCESS_SCREENSHOTS=1` for complete success screenshots during local
review. This reduces artifact size and capture time without changing app styles.

The browser result JSON is summarized in the GitHub job summary even if a trace
artifact cannot be uploaded. Failure artifacts retain the existing files for
three days. Diagnostic steps are optional; tests remain required. A failed test
is never converted to success because an artifact upload was skipped or failed.
A whole-job cancellation can prevent later diagnostic steps from running; the
step log and cancellation status remain authoritative.

This does not replenish the account storage quota or free execution minutes.
Do not dispatch repeated cloud runs just to test an exhausted artifact quota.

## Waiting and cancellation

The shared business client bounds complete requests, including JSON response
bodies and waiting for authentication renewal:

| Request | Maximum wait |
| --- | --- |
| Read | 60 seconds |
| Write | 90 seconds |
| AI generation | 120 seconds |
| Immutable report upload | 120 seconds |
| Static fonts, templates and sample images | 60 seconds per asset |

A timeout ends the relevant loading state. A dispatched write or model call
remains **outcome unknown** and is never retried automatically. Existing pending
operation identifiers and result-query workflows remain available. Cancellation
before dispatch does not send a request. Cancellation of one reader does not
cancel another reader's shared authentication renewal. A late response cannot
refresh or replay an expired operation.

These deadlines do not change trial duration, schedule calculation, approvals,
provider budgets or the scheduler's five-second minimum presentation. Existing
screen structure, styles and controls are retained.

Routine 15-second business snapshot synchronization remains bounded but runs in
background mode, without occupying the foreground page indicator. Explicit
reads, saves and model requests retain the indicator. Background mode cannot
hide a write. Leaving shared workspace settings aborts its unfinished read;
it cannot retain an orphaned page indicator after navigation.
