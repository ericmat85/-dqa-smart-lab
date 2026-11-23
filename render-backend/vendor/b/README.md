# DQA P5-01 offline core

No Auth, DB, Storage, AI, frontend integration or committed business operations.
Only GET /health/live is registered. OpenAPI includes x-offline-contracts for review;
there is no fake-login or business-mutation route. Production evaluator defaults deny.
All pure transition results have side_effects_authorized=false; the commit gate always
raises RULE_NOT_APPROVED. No real adapters are included.

Python 3.11–3.13, uv dependency management. Reproducible environment:

```sh
uv sync --locked --project backend
cd backend
uv run --locked pytest
uv run --locked python -O -m pytest -W 'ignore:assertions not in test modules or plugins will be ignored because assert statements are not executed:pytest.PytestConfigWarning'
```

Dependency download may use public package services only. Tests deny socket connect,
connect_ex and DNS resolution, use ASGI in-process TestClient and synthetic contexts.
Test evaluators/fakes are never configured in the app. No runtime fake Auth exists.
UUID fields use strict Python UUID objects; JSON contracts accept standard UUID strings.
Roles/permissions are logical port vocabulary, not a production 11/40/99 mapping.

Report content revision references and optimistic state version are separate. Immutable
reference/hash/signature-history contracts do not implement durable artifact storage;
complete immutable bytes persistence remains P5-03, not claimed by this package.


## R1 compatibility and test boundary

The dev lock includes httpx2==2.0.0, the preferred Starlette 1.10 TestClient
transport, alongside the required httpx==0.28.1. Runtime framework versions remain
FastAPI 0.141.1 / Pydantic 2.13.4. `filterwarnings = ["error"]` is retained.
Only the exact pytest optimization self-warning is filtered in the -O command;
application, Starlette and other dependency warnings still fail validation.

Run pytest from `backend/` so its pyproject and Python path are selected.
AnyIO needs a local socketpair for TestClient; an execution sandbox that forbids
socketpair can hang. Use the supported environment execution context with the
test collection/session socket-connect and DNS guards still enabled. This does
not authorize a real network listener or external service connection.

The pure result is not committable: `require_committable_business_operation`
always raises RULE_NOT_APPROVED. Equipment release, actual-hour accounting,
backdating, early completion, rebooking/receipt and other unapproved actions
remain blocked even when the pure confirmed-stage logic passes tests.
