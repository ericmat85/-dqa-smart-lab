# D final single-window handoff — 2026-11-09 Asia/Taipei
Verified available D sources/data/evidence only. No source rewrite, no new engine, no tests rerun, no Git/remote deployment. Overall packaging complete for available materials; gaps explicitly listed in GAPS-AND-LIMITATIONS.md.

## Layout
runtime/: one byte-identical necessary Core closure, eight modules; standard-library dependencies only.
dynamic/: COMPLETE latest dynamic_adapter.py/build_cases.py/run_offline.py/tests, numeric policies,88vectors/actual outputs,110test results and142call-count/per-engine evidence.
dataset/: original15one-request/one-test/report data,15rawmeasurement files,staging projection,catalog snapshot,field guide,report crosswalk,30photo requests,actual ruleCore execution evidence,127test results,validator,authoring/import interface code and original history.
SOURCE-INDEX.json: original file paths/hash/bytes and archived copy map; fixed Core commit/zip source and original manifest hashes.
PACKAGE-MANIFEST.json: all current ZIP payload hashes, excludes only itself. Original source manifests preserved under manifest.original.json.

## Offline reception
Verify external ZIP SHA256/bytes first. Inspect ZIP CRC and reject absolute/parent/backslash paths, symlinks, duplicates before manual safe extraction. In a new isolated review copy run: python -B run_portable.py --check-only This verifies every member hash/bytes, rejects extras and missing files and syntax-parses Python source without importing Core or executing tests.
Optional future authorized tests ONLY: python -B run_portable.py --suite dynamic --execute-offline ; or --suite dataset --execute-offline . Launcher keeps original files unchanged and overrides dynamic build_cases.SOURCE in memory to the packaged dataset. It adds shared runtime to sys.path. Requires Python3.12-compatible standard library; no pip/install/network. Tests regenerate evidence IN THAT REVIEW COPY, so original supplied PACKAGE-MANIFEST no longer matches after execution; do not confuse rerun with original retained proof. Do not execute in the authoritative original package directory. No tests were run by this packaging task.

## Scope
All raw/spec/equipment/actors are SYNTHETIC only; no customer material/calibration certificates/signatures/API keys/images. No original user decisions or nine-stage permissions changed. Core is rules-only, not live AI. Review E3 as review/advisory, not complete report generation. Review E4 as exact-source lexical matching. See A_IMPORT_INTERFACE.md before any A integration; staging JSON is not the app's productionIndexedDB/reportSchema.
Git/Push/PR/Merge/Tag/deployment NOT performed. G2 NOT_PASSED;P08 POLICY_BLOCKED;RULE_NOT_APPROVED MAINTAINED.
