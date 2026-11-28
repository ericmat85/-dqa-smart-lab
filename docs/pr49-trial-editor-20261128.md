# Trial catalogue editor

The shared trial page now shows **＋新增試驗項目**. Its equipment-management shortcut and per-row template-binding buttons are removed. Existing document/template binding workflows remain in the document settings area.

The edit dialog offers unnumbered trial classifications and a **試驗條件** selector for temperature, electrical properties, vibration, tensile force, humidity, frequency, pressure and other conditions. A trial can contain up to12 conditions with compatible units and optional numeric lower/upper bounds. Reversed bounds and duplicate condition/unit pairs are rejected. Existing internal method profiles and fixed durations are retained; this change does not infer or replace validated scheduling rules from a selected condition name.

**適用設備** is a multi-select of real workspace equipment identities. The database rejects identities from another workspace or removed equipment. These are saved as trial parameters, separate from the supplementary equipment description.

**試驗規範／試驗手法** supports ordered text and image blocks with captions and text following images. Up to4 PNG/JPG/WebP uploads of2MB each are resized and re-encoded as bounded PNG images before saving. Unsafe URLs/SVG and invalid payloads are rejected. The plain textual specification remains available to existing forms and AI context; image bytes are loaded only when opening a description/editor, keeping the shared bootstrap small. Trial revision and current actor are checked before applying a loaded description. A failed or uncertain write retains the existing result-recovery flow.

**刪除試驗項目** is a red button immediately to the right of Cancel, aligned with Save. The existing catalogue-management permission, expected revision, idempotent operation receipt and audit event govern deletion. Deletion disables future selection and preserves the underlying trial, historical request/signature references, descriptions and template records. A stale editor cannot restore a deleted trial by saving it. Existing trials are not backfilled or reclassified by migration058.

Validation uses local rollback-only PostgreSQL, synthetic browser fixtures and Node transport tests. It covers bounds/units, ownership, inline image round-trip, reload, role and revision checks, deletion/replay, existing resources/preflight, and template delivery integrity/recovery after removing its obsolete catalogue entry point. No real workflow, model inference, email or Production frontend deployment is part of this delivery.
