"""Packaging-only portable entry, no source edits or implicit test execution."""
from pathlib import Path
import argparse,hashlib,json,sys,ast,runpy
ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--check-only',action='store_true');p.add_argument('--suite',choices=['dynamic','dataset']);p.add_argument('--execute-offline',action='store_true');a=p.parse_args()
m=json.loads((ROOT/'PACKAGE-MANIFEST.json').read_text());expected={x['path'] for x in m['files']}|{'PACKAGE-MANIFEST.json'}
actual={x.relative_to(ROOT).as_posix() for x in ROOT.rglob('*') if x.is_file() or x.is_symlink()}
if expected!=actual:raise SystemExit('MISSING_OR_EXTRA_FILES')
for f in m['files']:
 q=ROOT/f['path']
 if q.is_symlink() or not q.is_file() or q.stat().st_size!=f['bytes'] or hashlib.sha256(q.read_bytes()).hexdigest()!=f['sha256']:raise SystemExit('HASH_OR_TYPE_MISMATCH')
 if q.suffix=='.py':ast.parse(q.read_text(),filename=f['path'])
print('PACKAGE_BYTES_HASH_AND_PYTHON_SYNTAX_VERIFIED; NO_ENGINE_EXECUTION')
if a.suite:
 if not a.execute_offline:raise SystemExit('EXPLICIT_OFFLINE_EXECUTION_FLAG_REQUIRED')
 sys.dont_write_bytecode=True;folder=ROOT/a.suite;sys.path[:0]=[str(folder),str(ROOT/'runtime')]
 if a.suite=='dynamic':
  import build_cases
  build_cases.SOURCE=ROOT/'dataset/data/competition_ai4_demo_dataset_v1.json'
 runpy.run_path(str(folder/'run_offline.py'),run_name='__main__')
