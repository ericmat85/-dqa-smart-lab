# Shared catalog, equipment and material commands

This release preserves the original desktop and mobile layouts and enables explicit,
server-authorized database writes in the existing management pages.

## Supported operations

- Trial catalog: create and edit names, specifications, versions, equipment references,
  acceptance text and duration. Original names remain aliases after a rename. Existing
  scheduling profiles cannot be changed. The 250-hour humidity and 20-hour per-sample
  vibration rules remain fixed. Other demonstration references remain demonstration
  references; editing them does not approve a laboratory standard or workflow gate.
- Equipment: create/edit the existing register, mandatory positive integer space U,
  daily hours and maintenance/calibration dates. Start maintenance/calibration and
  complete it back to idle with a recorded reason and real timestamps. Active trials,
  equipment borrows and unreleased reservations cannot be released by this screen.
- Materials: create/edit the existing register, opening balances, explicit stock receipt,
  issue and count correction with reasons. Balances and append-only transactions commit
  atomically. Available stock cannot become negative or exceed total stock. An active
  borrow blocks manual quantity/status/unit changes. Borrow approval/return remains in
  the original, unopened business workflow; these commands do not implement that workflow.

## Authorization and durability

Migration 009 adds four optional role capabilities: `catalog.manage`, `equipment.manage`,
`materials.manage`, and `materials.adjust`. Existing grants and identities are unchanged.
Workspace administrators already have these capabilities through the existing admin
rule. The role editor includes the corresponding read capability when selecting a new
resource capability. The database rechecks membership and capability for every command.
Caller tenant/actor/status identities cannot come from editable display labels.

The BFF uses the validated browser session's user JWT and tenant, never a service-role
key. Direct client table writes remain denied. RLS also protects event history. Command
execution shares the workspace-access lock with membership/role changes and serializes
resource updates. Every editor submits the revision captured when it opened, so a newer
snapshot cannot silently overwrite concurrent changes.

Each mutation first prepares a two-minute, payload-bound operation ID. The browser must
persist that ID in session storage before it executes once. A lost execution response
locks further mutations and offers a result lookup; execution is never automatically
retried. The result endpoint can atomically expire an unexecuted plan, after which a
late execute is rejected. A saved operation returns its existing receipt, never applies
stock deltas twice. No business payload, password, cookie or token is stored with the ID.

`resource_events` and existing `material_transactions` retain durable history. The shared
snapshot includes the most recent 200 authorized resource events and an explicit limit
flag; `/api/business/data/resourceevents` supports paged authorized history reads. Imported
historical equipment notes/history are preserved and merged under canonical database
values. New display labels do not create accounts or change canonical owner/site IDs.

## API

- `POST /api/business/resources/prepare`: `{operation_id, command}`
- `POST /api/business/resources/execute`: the same immutable operation and command
- `GET /api/business/resources/result/:operation_id`: caller-owned result or expiry

Command: `{kind, action, id, expected_revision, data}`. `kind` is `trial`, `equipment`
or `material`; actions are limited to the supported save/status/stock combinations.
The prepare step stores only the command fingerprint, actor and lease, with no business
mutation. Execute validates all whitelisted fields and performs the mutation, event,
stock transaction and receipt in one transaction.

## Deployment and limits

Apply only migration 009 through `database/tools/build_resource_bundle.py` against the
verified 001–008 baseline. It adds metadata columns, private command/profile tables,
public event history and scoped functions; it does not update existing business rows,
import states, member/role grants or the public schema. Existing migrations are immutable.
Deploy the same source commit to a private Vercel Preview with existing business connection
settings and `VITE_ORIGINAL_BUSINESS=true` in both build/runtime environment. Existing
Production and Render services are unchanged.

Validation uses isolated, network-disabled PostgreSQL with rollback-only synthetic
commands, BFF tests and desktop/mobile browser API fixtures. Cloud checks inspect schema,
row fingerprints, SQL authorization and private Preview status without creating business
test data, sending mail or calling a paid model. Private SSO requires the user's own login;
authenticated cloud browser acceptance is reported separately from SQL readback.

Existing imported cases remain read-only archives. Official signing, report approval,
actual laboratory operations and scheduling writes remain gated. UI preferences, custom
uploads and saved signatures are not newly migrated by this release.

G2_GATE=NOT_PASSED
P08_STATUS=POLICY_BLOCKED
RULE_NOT_APPROVED=MAINTAINED
