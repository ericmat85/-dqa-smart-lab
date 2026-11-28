# Workspace appearance settings

Migration 036 adds `workspace_appearance(uuid)` and
`save_workspace_appearance(uuid,jsonb,bigint)` to the existing application schema.
It creates no table, seeds no configuration and alters no existing function.
The existing settings audit/revision triggers apply when a user explicitly saves.

Read defaults: `tabBarColor: #142D48`, `tableHeaderColor: #D2DCE8`. Configuration
contains exactly two six-digit hex strings. A valid tenant member may read; only
a current tenant administrator may write. No arbitrary CSS or executable value
is stored. Tenant identity comes from the session, never a request-body tenant.
Both functions fix `search_path=pg_catalog` and deny anonymous execution.

Updates serialize per tenant with an advisory transaction lock, recheck admin
permission, and compare the expected revision before modifying only the
`workspace_appearance_v1` settings row. Unchanged normalized colors do not churn
revisions. Existing business data and other settings are not modified.

For a new isolated synthetic validation environment:

```
python database/tools/prepare_appearance_local.py --directory /tmp/appearance-test
python database/tests/verify_workspace_appearance.py --state /tmp/appearance-test/LOCAL_DATABASE.json --result /tmp/appearance-test/result.json
```

These tools reject remote connection strings. Never replay initial migrations
on an existing database. For an existing environment, apply only the reviewed
036 increment with its migration hash and existing-data/function/public-schema
preservation checks. A transaction rollback probe must succeed first. On an
unknown application outcome, read the migration journal before retrying.

The rollback file revokes the new endpoints and retains saved colors/audit.
The prior application does not read this module, so reverting the frontend/API
release restores prior UI behavior without deleting business records.
