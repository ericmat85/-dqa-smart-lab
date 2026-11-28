# Demo filling through assistant commands

The three application workspaces no longer show standalone Demo form-fill buttons. The remaining request-manager fill button and orphaned laboratory example-creation button are removed. Existing form actions are reached through explicit AI assistant commands; typing a command does not submit or approve a request.

| Command | Where to use it | Result |
| --- | --- | --- |
| `/demo fill` | Blank new request, request-manager case detail, active LMS LV1 review, or laboratory requests | Dispatches the appropriate fill/report action for that workspace |
| `/demo start` | Blank new-request editor | Existing virtual request example and test signature; no save or submission |
| `/demo fill in manager` | Request system, open pending supervisor review | Virtual supervisor signature/comment example; user must approve or return manually |
| `/demo fill in LV1` | LMS, open virtual LV1 review | Existing manual review fields and test signature; no planning, numbering, save, or approval |
| `/create a demo report` | Laboratory test requests | Existing native virtual-report generator; in the isolated walkthrough, prepares the currently open completed case's synthetic report |
| `/demo create trial` | Isolated laboratory demo, open unlinked completed item's report dialog | Preserves the old linked-example action; unavailable in the database workspace |

`/demo fill in supervisor` is an alias for the manager command. The assistant's command guide lists the commands in Chinese and English. The guided walkthrough now points to assistant commands instead of removed buttons. The laboratory assistant remains above the report-form backdrop and uses the shared desktop/mobile viewport layout, so commands are reachable while the form is open.

Native supervisor filling rechecks current actor, current case status, authorization, captured revision, busy state, and virtual purpose. Workspace administrators retain their combined acceptance rights. Real requests and unauthorized users do not receive synthetic supervisor signatures. Existing unsent comments/signatures require overwrite confirmation; cancelling preserves them.

Native report generation keeps its source/version, executor, virtual-purpose, file-integrity, and server-rule checks. Report signatures remain manual in the database workflow. Isolated walkthrough report filling uses the existing workbook builder and validator; it checks that the form, source, actor, and cancellation state are still current before applying the result. No request is automatically saved, reviewed, booked, completed, or submitted by a fill command.

The commands are finite application actions dispatched locally by the assistant interface. They do not evaluate supplied JavaScript or call a paid model to fill a form. Data cleanup/restart commands, normal manual signatures, report upload, and workflow permission rules remain unchanged. No database migration is required; migration 053 stays installed without replay.
