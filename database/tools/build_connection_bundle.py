"""Build migration 004 against the exact verified foundation; never connects remotely."""
import argparse,hashlib,json
from pathlib import Path
from build_bundle import ROOT,bundle,preserve_public
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--expected-public-fingerprint',required=True);args=p.parse_args()
_,baseline=bundle();file=ROOT/'migrations/004_business_connection.sql';raw=file.read_bytes();digest=hashlib.sha256(raw).hexdigest()
checks='\n'.join("IF NOT EXISTS(SELECT 1 FROM dqa_business.schema_migrations WHERE name='"+f['name']+"' AND sha256='"+f['sha256']+"') THEN RAISE EXCEPTION 'FOUNDATION_MIGRATION_MISMATCH'; END IF;" for f in baseline)
pre="BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; DO $check$ BEGIN "+checks+" IF EXISTS(SELECT 1 FROM dqa_business.schema_migrations WHERE name='004_business_connection.sql') THEN RAISE EXCEPTION 'CONNECTION_MIGRATION_ALREADY_APPLIED_READBACK_REQUIRED'; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'MIGRATION_OWNER_REQUIRES_RLS_BYPASS'; END IF; END $check$;\n"
guard=preserve_public(args.expected_public_fingerprint)
sql=pre+guard+raw.decode()+f"\nINSERT INTO dqa_business.schema_migrations(name,sha256) VALUES ('{file.name}','{digest}');\n"+guard+'COMMIT;\n'
out=Path(args.out);out.write_text(sql);manifest={'baseline':baseline,'migration':{'name':file.name,'sha256':digest},'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest(),'expected_public_fingerprint':args.expected_public_fingerprint};out.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest))
