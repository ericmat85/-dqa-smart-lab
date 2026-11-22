"""Build migration 007 only. Never connects to a database or moves any case data."""
import argparse,hashlib,json,re
from pathlib import Path
from build_bundle import preserve_public
ROOT=Path(__file__).resolve().parents[1]
def bundle(baseline):
 rows=baseline['migrations'];fingerprint=baseline['snapshot']['public_definition_fingerprint']
 assert len(rows)==6 and all(re.fullmatch(r'00[1-6]_[a-z_]+\.sql',r['name']) for r in rows)
 for row in rows:
  assert hashlib.sha256((ROOT/'migrations'/row['name']).read_bytes()).hexdigest()==row['sha256'],'IMMUTABLE_BASELINE_MISMATCH'
 migration=ROOT/'migrations/007_case_recycle_bin.sql';digest=hashlib.sha256(migration.read_bytes()).hexdigest();guard=preserve_public(fingerprint)
 baseline_json=json.dumps(rows,separators=(',',':')).replace("'","''")
 pre="""DO $baseline$ BEGIN
 IF (SELECT jsonb_agg(jsonb_build_object('name',name,'sha256',sha256) ORDER BY name) FROM dqa_business.schema_migrations) IS DISTINCT FROM '%s'::jsonb THEN RAISE EXCEPTION 'MIGRATION_BASELINE_CHANGED'; END IF;
 IF to_regclass('dqa_private.case_recycle_runs') IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_APPLIED_READBACK_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'MIGRATION_OWNER_REQUIRES_RLS_BYPASS'; END IF;
 END $baseline$;
"""%baseline_json
 sql="BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='120s';\n"+guard+pre+migration.read_text()+f"\nINSERT INTO dqa_business.schema_migrations(name,sha256) VALUES ('{migration.name}','{digest}');\n"+guard+"NOTIFY pgrst,'reload schema';\nCOMMIT;\n"
 return sql,{'migration':{'name':migration.name,'sha256':digest},'baseline_migrations':rows,'expected_public_fingerprint':fingerprint,'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest(),'moves_case_data':False}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--out',required=True);a=p.parse_args();sql,manifest=bundle(json.loads(Path(a.baseline).read_text()));out=Path(a.out);out.write_text(sql);out.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest['migration']))
