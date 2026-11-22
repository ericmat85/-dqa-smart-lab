"""Migration 017 only; refuses predecessor drift and preserves public definitions."""
import argparse,hashlib,json
from pathlib import Path
from build_bundle import preserve_public
ROOT=Path(__file__).resolve().parents[1]
def bundle(baseline):
 rows=baseline['migrations'];assert len(rows)==16
 for row in rows:assert hashlib.sha256((ROOT/'migrations'/row['name']).read_bytes()).hexdigest()==row['sha256']
 migration=ROOT/'migrations/017_account_entry_and_password_recovery.sql';digest=hashlib.sha256(migration.read_bytes()).hexdigest();guard=preserve_public(baseline['snapshot']['public_definition_fingerprint']);previous=json.dumps(rows,separators=(',',':')).replace("'","''")
 pre="DO $b$ BEGIN IF (SELECT jsonb_agg(jsonb_build_object('name',name,'sha256',sha256) ORDER BY name) FROM dqa_business.schema_migrations) IS DISTINCT FROM '%s'::jsonb THEN RAISE EXCEPTION 'MIGRATION_BASELINE_CHANGED';END IF;IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='dqa_private' AND table_name='password_recovery_requests') THEN RAISE EXCEPTION 'ALREADY_APPLIED_READBACK_REQUIRED';END IF;END $b$;"%previous
 sql="BEGIN;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';"+guard+pre+migration.read_text()+f"INSERT INTO dqa_business.schema_migrations(name,sha256) VALUES('{migration.name}','{digest}');"+guard+"NOTIFY pgrst,'reload schema';COMMIT;"
 return sql,{'migration':{'name':migration.name,'sha256':digest},'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest(),'baseline_migrations':rows,'public_fingerprint':baseline['snapshot']['public_definition_fingerprint']}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--out',required=True);a=p.parse_args();sql,m=bundle(json.loads(Path(a.baseline).read_text()));o=Path(a.out);o.write_text(sql);o.with_suffix('.manifest.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps(m['migration']))
