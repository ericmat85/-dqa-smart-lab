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
