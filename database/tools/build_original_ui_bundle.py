"""Build original-UI additive migration against four fixed existing migrations. No remote I/O."""
import argparse,hashlib,json
from pathlib import Path
from build_bundle import ROOT,preserve_public
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--expected-public-fingerprint',required=True);args=p.parse_args()
baseline=[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'migrations').glob('00[1-4]_*.sql'))];assert len(baseline)==4
file=ROOT/'migrations/005_original_ui_drafts.sql';digest=hashlib.sha256(file.read_bytes()).hexdigest();guard=preserve_public(args.expected_public_fingerprint)
checks='\n'.join("IF NOT EXISTS(SELECT 1 FROM dqa_business.schema_migrations WHERE name='"+f['name']+"' AND sha256='"+f['sha256']+"') THEN RAISE EXCEPTION 'EXISTING_MIGRATION_MISMATCH'; END IF;" for f in baseline)
pre="BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; DO $check$ BEGIN "+checks+" IF EXISTS(SELECT 1 FROM dqa_business.schema_migrations WHERE name='005_original_ui_drafts.sql') THEN RAISE EXCEPTION 'MIGRATION_ALREADY_APPLIED_READBACK_REQUIRED'; END IF; END $check$;\n"
sql=pre+guard+file.read_text()+f"\nINSERT INTO dqa_business.schema_migrations(name,sha256) VALUES ('{file.name}','{digest}');\n"+guard+'COMMIT;\n'
out=Path(args.out);out.write_text(sql);out.with_suffix('.manifest.json').write_text(json.dumps({'baseline':baseline,'migration':{'name':file.name,'sha256':digest},'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest(),'expected_public_fingerprint':args.expected_public_fingerprint},indent=2)+'\n');print(json.dumps({'migration':file.name,'sha256':digest}))
