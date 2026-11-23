"""Build an additive, transactional SQL bundle. Does not connect to any database."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def preserve_public(expected_public_fingerprint):
 if not re.fullmatch('[a-f0-9]{32}',expected_public_fingerprint):raise ValueError('INVALID_PUBLIC_FINGERPRINT')
 snapshot=(ROOT/'tools/cloud_preflight.sql').read_text().split('SELECT jsonb_build_object(',1)[1].rsplit('COMMIT;',1)[0].strip().removesuffix(';')
 snapshot='SELECT jsonb_build_object('+snapshot
 guard="DO $preserve_public$ DECLARE actual text; previous_path text:=current_setting('search_path'); BEGIN PERFORM set_config('search_path','pg_catalog',true); SELECT preflight->>'public_definition_fingerprint' INTO actual FROM ("+snapshot+") catalog; PERFORM set_config('search_path',previous_path,true); IF actual IS DISTINCT FROM '"+expected_public_fingerprint+"' THEN RAISE EXCEPTION 'EXISTING_PUBLIC_DEFINITIONS_CHANGED_TRANSACTION_ROLLED_BACK'; END IF; END $preserve_public$;\n"
 return guard
def bundle(expected_public_fingerprint=None):
 files=[ROOT/'migrations'/name for name in ['001_business_schema.sql','002_tenant_read_security.sql','003_integrity_audit_and_policy_gates.sql']];assert all(p.is_file() for p in files)
 parts=["BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='120s';\nDO $preflight$ BEGIN\n IF to_regnamespace('dqa_business') IS NOT NULL OR to_regnamespace('dqa_private') IS NOT NULL THEN RAISE EXCEPTION 'DQA_SCHEMA_ALREADY_EXISTS_REVIEW_REQUIRED'; END IF;\n IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'PLATFORM_AUTH_REQUIRED'; END IF;\n IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN RAISE EXCEPTION 'PLATFORM_ROLES_REQUIRED'; END IF;\n IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'MIGRATION_OWNER_REQUIRES_RLS_BYPASS'; END IF;\n END $preflight$;\n"]
 manifest=[]
 for p in files:
  raw=p.read_bytes();h=hashlib.sha256(raw).hexdigest();parts.extend([f'\n-- {p.name} sha256={h}\n',raw.decode(),f"\nINSERT INTO dqa_business.schema_migrations(name,sha256) VALUES ('{p.name}','{h}');\n"]);manifest.append({'name':p.name,'sha256':h})
 if expected_public_fingerprint is not None:
  guard=preserve_public(expected_public_fingerprint)
  parts.insert(1,guard)
  parts.append(guard)
 parts.append('COMMIT;\n');return ''.join(parts),manifest
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--expected-public-fingerprint');args=parser.parse_args();sql,files=bundle(args.expected_public_fingerprint);p=Path(args.out);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(sql);p.with_suffix('.manifest.json').write_text(json.dumps({'files':files,'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest(),'expected_public_fingerprint':args.expected_public_fingerprint},indent=2)+'\n');print(json.dumps({'files':len(files),'bytes':len(sql.encode()),'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest()}))
