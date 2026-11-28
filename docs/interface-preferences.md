# Interface preferences

Interface-only preferences live in `dqa-ui-preferences-v1`: `language`
(`zh-TW` or `en`), `fontSize` (`small`, `normal`, `large`), and `pageSize`
(10, 20, 50, 100). `saveUiPreferences` merges patches, validates values and
announces same-tab changes. The shared pagination components subscribe to this
store. Export code continues to receive the complete filtered dataset.

`PreferenceRoot` subscribes without remounting the app and applies document
language and `--ui-font-scale`. The Vite PostCSS plugin scales pixel font sizes
and font shorthands; the JSX adapter also covers numeric inline font sizes.
The shorthand visitor is idempotent so PostCSS cannot repeatedly wrap a value.

The automatic JSX runtime adapter translates rendered strings and accessible
labels using `i18n.mjs`. Add new interface phrases to `ENGLISH_UI`; dynamic count
messages have explicit formatting rules. Unknown strings, account names and
business identifiers fall back to their original text. Input values, callbacks,
keys and stored records are never translated. Options without an explicit value
receive their original label as a value before their visible label is translated.
Keep both custom runtimes excluded from dependency prebundling so dictionary
changes use the current module during development. The `dqa-live-localization`
post-config hook removes these adapters from the React plugin’s explicit
prebundle include list as well; exclusion alone does not override that list.

Equipment utilization remains in `dqa-management-preferences-v1`, independent
of interface preferences. `ReportPreferences` saves only the fields for its
report or activity scope, merging with the latest stored values. Dashboard
utilization navigation opens `settings` with the `activity` section identifier.

`ScheduleStatusChart` shares hover/focus state between SVG ring segments and
legend rows. Click, Enter or Space navigates using the original status key.
Zero-count statuses remain available in the legend; empty data has a zero total.

The built-in administrator retains ID `U001`; only its original demo email is
migrated from `huangxm@example.com` to `level0@example.com`. Custom administrator
accounts keep their own addresses. Level 2 account-management access is granted
through the same `canManageAccounts` check used for navigation and the editor.

## Shared workspace colors

`系統管理 → 介面設定 → 頁籤與列表配色` adjusts the primary tab-strip
background and table-header background independently. Defaults are neutral mist
blue-gray (`#142D48` / `#D2DCE8`), with stone, indigo and warm-gray presets.
Hex input accepts exactly six digits. Foreground, search-field and divider colors
are derived automatically; normal text and search placeholders retain a minimum
4.5:1 contrast in light and dark themes. Nested tabs keep their original design.

The editor previews a draft locally. Only **儲存設定** changes the workspace;
**取消** discards the draft, while **還原預設** stages defaults for explicit saving.
Existing font, language and page-size preferences remain browser-local and keep
their prior automatic-save behavior.

In database mode, `PreferenceRoot` mounts `WorkspaceAppearanceProvider`, which
reads `/api/business/access?section=appearance` after authentication without
blocking business screens. Colors use `workspace_appearance_v1` in the existing
tenant settings table, through migration 036's two scoped RPC functions. Valid
workspace members can read; only current tenant administrators can write. The
server derives the tenant from the session and rejects arbitrary CSS, extra
fields and invalid revisions. The existing settings revision/audit triggers
remain in use. Missing settings return defaults without seeding a row.

Saving uses the revision captured when editing began. Concurrent updates return
409 and preserve the draft until explicit readback; an unknown write outcome
blocks resubmission until successful readback. Failed initial reads never enable
saving defaults. Identity changes cancel reads, discard prior-identity colors
and ignore stale callbacks. Browser focus refreshes the shared settings; other
systems and new sessions read the same database source. Demo mode uses a
separate browser-local appearance key and never calls a real write endpoint.

Validation: `node --test tests/workspace-appearance*.test.mjs`,
`database/tests/verify_workspace_appearance.py` with an isolated local state,
and `e2e/workspace-appearance.spec.mjs` in business mode. Browser fixtures are
synthetic; SQL checks cover two-tenant read/write boundaries and persistence.
Migration 036 adds functions only; it leaves existing business rows and saved
preferences unchanged. Its rollback revokes the new endpoints while retaining
preference/audit records. Never replay the initial migrations onto an existing
workspace.
