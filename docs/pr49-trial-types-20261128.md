# Trial editor and classifications

The add-entry button is now **試驗編輯器**. The primary selector is **試驗類型**, with exactly these seven classifications:

1. 放置型 — exposure under specified conditions.
2. 作動放置型 — powered or otherwise energized exposure.
3. 複合型連續試驗 — a continuous sequence of placement, powered placement or manual operations.
4. 複合型不連續試驗 — independent stages that can be separated by days.
5. 操作試驗 — manual execution, observation and records.
6. 委外試驗 — a third-party laboratory.
7. 其他 — a category requiring a written method description.

Classification is stored independently of the existing **試驗方法** profile. Changing it does not replace the method, assign new equipment, change a fixed duration, rewrite an existing request or introduce gaps into an existing continuous reservation. Compound stage dates and outsourcing are still configured through their existing request/planning flows; this change does not implement a new discontinuous scheduling algorithm.

Both local and database catalogs retain the classification across reloads. Older entries infer a category from their existing method without a backfill. Migration 055 uses a tenant/trial keyed private table and the existing authorized catalog snapshot. The ordinary resource operation saves the category in the same transaction as its revision/event; receipt replay cannot apply it twice. Old clients that omit the field preserve the existing selection. Invalid categories and direct writes are rejected. Existing catalog permissions, immutable method checks and fixed-duration validation remain.

Migration 055 follows installed 054. Apply only once through the checked transaction bundle; existing business rows, unrelated functions, public-schema fingerprint and existing function grants are verified unchanged. Verification uses rollback-only synthetic SQL fixtures, transport fixtures, desktop/mobile browser flows, and the regular Node/build/lint checks. No live model call is needed for classification editing.
