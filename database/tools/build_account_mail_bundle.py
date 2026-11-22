"""Additive migration 014 with immutable predecessor and public-schema guards."""
import argparse,hashlib,json,re
from pathlib import Path
from build_bundle import preserve_public
ROOT=Path(__file__).resolve().parents[1]
def bundle(baseline):
 rows=baseline['migrations'];fingerprint=baseline['snapshot']['public_definition_fingerprint'];assert len(rows)==13
 for row in rows:assert hashlib.sha256((ROOT/'migrations'/row['name']).read_bytes()).hexdigest()==row['sha256'],'IMMUTABLE_BASELINE_MISMATCH'
 migration=ROOT/'migrations/014_account_activation_mail.sql';digest=hashlib.sha256(migration.read_bytes()).hexdigest();guard=preserve_public(fingerprint);baseline_json=json.dumps(rows,separators=(',',':')).replace("'","''")
 pre="""DO $baseline$ BEGIN
 IF (SELECT jsonb_agg(jsonb_build_object('name',name,'sha256',sha256) ORDER BY name) FROM dqa_business.schema_migrations) IS DISTINCT FROM '%s'::jsonb THEN RAISE EXCEPTION 'MIGRATION_BASELINE_CHANGED';END IF;
 IF to_regclass('dqa_private.account_invitations') IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_APPLIED_READBACK_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'MIGRATION_OWNER_REQUIRES_RLS_BYPASS';END IF;
 END $baseline$;
"""%baseline_json
 sql="BEGIN;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';\n"+guard+pre+migration.read_text()+f"\nINSERT INTO dqa_business.schema_migrations(name,sha256) VALUES('{migration.name}','{digest}');\n"+guard+"NOTIFY pgrst,'reload schema';COMMIT;\n"
 return sql,{'migration':{'name':migration.name,'sha256':digest},'baseline_migrations':rows,'expected_public_fingerprint':fingerprint,'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest(),'mail_delivery_default':False,'moves_business_data':False}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--out',required=True);a=p.parse_args();sql,manifest=bundle(json.loads(Path(a.baseline).read_text()));out=Path(a.out);out.write_text(sql);out.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest['migration']))
