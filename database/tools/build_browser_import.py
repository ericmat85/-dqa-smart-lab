"""Build one transactional browser-data archive import; never contacts a database.

Only equipment is promoted. Imported workflow records retain their original state in
append-only import_rows and are exposed solely as an administrator's read-only archive.
The original export JSON remains outside Git and is preserved byte-for-byte in the envelope.
"""
import argparse,datetime,hashlib,json,re,subprocess,uuid
from pathlib import Path
from build_bundle import ROOT,preserve_public
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',required=True);p.add_argument('--tenant',required=True);p.add_argument('--importer',required=True);p.add_argument('--expected-file-sha256',required=True);p.add_argument('--source-commit',required=True);p.add_argument('--expected-public-fingerprint',required=True);a=p.parse_args()
tenant=str(uuid.UUID(a.tenant));importer=str(uuid.UUID(a.importer));source=Path(a.source).resolve();out=Path(a.out).resolve()
if ROOT.parent==out or ROOT.parent in out.parents:raise SystemExit('BUSINESS_PAYLOAD_MUST_STAY_OUTSIDE_GIT_SOURCE')
raw=source.read_bytes();file_hash=hashlib.sha256(raw).hexdigest();assert file_hash==a.expected_file_sha256 and len(raw)<=10485760,'SOURCE_HASH_OR_SIZE_MISMATCH';assert re.fullmatch('[a-f0-9]{40}',a.source_commit)
out.parent.mkdir(parents=True,exist_ok=True);review_path=out.with_suffix('.review.json');subprocess.run(['node',str(ROOT/'tools/inspect_browser_export.mjs'),str(source),str(review_path)],check=True,capture_output=True)
review=json.loads(review_path.read_text());bundle=json.loads(raw);payload=bundle['payload'];assert payload['kind']=='DQA_BROWSER_BUSINESS_EXPORT','ACTUAL_BROWSER_SOURCE_REQUIRED'
assert isinstance(payload['source_origin'],str) and re.fullmatch(r'https://[A-Za-z0-9.-]+',payload['source_origin']),'SOURCE_ORIGIN_INVALID'
source_hash=bundle['sha256'];batch=str(uuid.uuid5(uuid.NAMESPACE_URL,'dqa-browser-import:'+tenant+':'+source_hash));uid=lambda text:str(uuid.uuid5(uuid.NAMESPACE_URL,tenant+':'+text))
quote=lambda s:"'"+str(s).replace("'","''")+"'";js=lambda o:json.dumps(o,ensure_ascii=False,separators=(',',':'));literal=lambda o:quote(js(o))+'::jsonb'
rows=[];sites={};equipment=[];errors={}
for issue in review['issues']:errors.setdefault((issue['collection'],issue.get('id')),[]).append(issue['code'])
known_archive_issues={'WORKFLOW_STATE_REQUIRES_EXPLICIT_MIGRATION_POLICY','LEGACY_ACTOR_MAPPING_REQUIRED'}
assert all(i['code'] in known_archive_issues for i in review['issues']),'UNRESOLVED_SOURCE_INTEGRITY_ERROR'
status={'待機中':'IDLE','使用中':'IN_USE','維護中':'MAINTENANCE','校驗中':'CALIBRATION','借用':'ON_LOAN','借用中':'ON_LOAN','暫停中':'PAUSED','停用':'RETIRED'}
for c in payload['collections']:
 ids=set()
 for row in c['rows']:
  assert isinstance(row,dict) and isinstance(row.get('id'),str) and row['id'] and row['id'] not in ids,'ROW_ID_REQUIRED_OR_DUPLICATE';ids.add(row['id']);row_id=uid('import-row:'+batch+':'+c['name']+':'+row['id'])
  rows.append({'id':row_id,'collection':c['name'],'legacy_id':row['id'],'payload':row,'validation_errors':sorted(set(errors.get((c['name'],row['id']),[])))})
  if c['name']!='equipment':continue
  for key in ['name','category','location']:assert isinstance(row.get(key),str) and row[key].strip() and len(row[key])<=500,'EQUIPMENT_REQUIRED_FIELD_INVALID'
  u=row.get('spaceUnits',row.get('capacity'));assert type(u) is int and 1<=u<=100000,'U_REQUIRED_NO_LITRE_CONVERSION'
  if 'spaceUnits' in row and 'capacity' in row:assert row['spaceUnits']==row['capacity'],'CONFLICTING_U_FIELDS'
  assert row['status'] in status,'UNKNOWN_EQUIPMENT_STATE';hours=row.get('dailyHours',24);assert type(hours) in [int,float] and .5<=hours<=24 and round(hours,1)==hours,'DAILY_HOURS_INVALID'
  for key in ['nextCalibration','nextMaintenance']:
   if row.get(key):assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',row[key]);datetime.date.fromisoformat(row[key])
  site=uid('site:'+row['location']);sites[site]={'id':site,'legacy_id':'IMPORTED-SITE-'+site.replace('-',''),'name':row['location']}
  equipment.append({'id':uid('equipment:'+row['id']),'legacy_id':row['id'],'name':row['name'],'category':row['category'],'model':row.get('model') or '', 'serial_number':row.get('serial') or '', 'site_id':site,'space_units':u,'daily_hours':hours,'operational_status':status[row['status']],'specification':row.get('specification') or '', 'next_calibration':row.get('nextCalibration') or None,'next_maintenance':row.get('nextMaintenance') or None})
assert len(rows)>0 and len(rows)<=1000,'IMPORT_ROW_LIMIT';assert len(equipment)>0,'EQUIPMENT_SOURCE_REQUIRED'
baseline=[{'name':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted((ROOT/'migrations').glob('00[1-5]_*.sql'))];assert len(baseline)==5
migration=ROOT/'migrations/006_legacy_browser_readback.sql';migration_hash=hashlib.sha256(migration.read_bytes()).hexdigest();guard=preserve_public(a.expected_public_fingerprint)
checks='\n'.join("IF NOT EXISTS(SELECT 1 FROM dqa_business.schema_migrations WHERE name="+quote(m['name'])+" AND sha256="+quote(m['sha256'])+") THEN RAISE EXCEPTION 'EXISTING_MIGRATION_MISMATCH'; END IF;" for m in baseline)
parts=["BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL standard_conforming_strings=on; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';",f"SET LOCAL request.jwt.claim.sub={quote(importer)};",guard,
"DO $pre$ BEGIN "+checks+f" IF NOT dqa_private.is_admin('{tenant}') THEN RAISE EXCEPTION 'IMPORTER_ADMIN_REQUIRED'; END IF; IF EXISTS(SELECT 1 FROM dqa_business.schema_migrations WHERE name='006_legacy_browser_readback.sql') THEN RAISE EXCEPTION 'MIGRATION_ALREADY_EXISTS_READBACK_REQUIRED'; END IF; PERFORM pg_advisory_xact_lock(hashtextextended('{tenant}:{source_hash}',0)); IF EXISTS(SELECT 1 FROM dqa_business.import_batches WHERE tenant_id='{tenant}' AND (id='{batch}' OR source_sha256='{source_hash}')) THEN RAISE EXCEPTION 'IMPORT_ALREADY_EXISTS_READBACK_REQUIRED'; END IF; IF EXISTS(SELECT 1 FROM dqa_business.settings WHERE tenant_id='{tenant}' AND module='legacy_browser_archive') THEN RAISE EXCEPTION 'ARCHIVE_CONFIGURATION_EXISTS'; END IF; END $pre$;",
migration.read_text(),f"INSERT INTO dqa_business.schema_migrations(name,sha256) VALUES ('{migration.name}','{migration_hash}');"]
parts.append(f"INSERT INTO dqa_business.import_batches(id,tenant_id,source_name,source_sha256,status) VALUES ('{batch}','{tenant}',{quote('Browser export '+payload['source_origin'])},'{source_hash}','STAGED');")
envelope={'original_json':raw.decode('utf8'),'file_sha256':file_hash,'payload_sha256':source_hash,'source_origin':payload['source_origin'],'source_commit':a.source_commit,'business_rows':len(rows),'collections':[{'name':c['name'],'rows':c['row_count'],'sha256':c['sha256'],'omitted_fields':c['omitted_fields']} for c in payload['collections']],'missing':payload['missing'],'binary_files_included':False,'workflow_activation':False}
parts.append(f"INSERT INTO dqa_business.import_rows(id,tenant_id,batch_id,source_collection,legacy_id,payload) VALUES ('{uid('envelope:'+batch)}','{tenant}','{batch}','_source_envelope','ORIGINAL_EXPORT',{literal(envelope)});")
for row in rows:parts.append(f"INSERT INTO dqa_business.import_rows(id,tenant_id,batch_id,source_collection,legacy_id,payload,validation_errors) VALUES ('{row['id']}','{tenant}','{batch}',{quote(row['collection'])},{quote(row['legacy_id'])},{literal(row['payload'])},{literal(row['validation_errors'])});")
for site in sites.values():parts.append(f"INSERT INTO dqa_business.sites(id,tenant_id,legacy_id,name) VALUES ('{site['id']}','{tenant}',{quote(site['legacy_id'])},{quote(site['name'])});")
for e in equipment:
 parts.append('INSERT INTO dqa_business.equipment(id,tenant_id,'+','.join(k for k in e if k!='id')+') VALUES ('+quote(e['id'])+','+quote(tenant)+','+','.join('NULL' if v is None else quote(v) for k,v in e.items() if k!='id')+');')
cfg={'batch_id':batch,'source_sha256':source_hash,'file_sha256':file_hash,'source_origin':payload['source_origin'],'source_commit':a.source_commit,'mode':'READ_ONLY_ARCHIVE','workflow_activated':False,'business_rows':len(rows),'equipment_promoted':len(equipment)}
parts.append(f"INSERT INTO dqa_business.settings(id,tenant_id,module,configuration) VALUES ('{uid('archive-settings')}','{tenant}','legacy_browser_archive',{literal(cfg)});")
parts.append(f"DO $verify$ DECLARE saved text; BEGIN SELECT payload->>'original_json' INTO saved FROM dqa_business.import_rows WHERE tenant_id='{tenant}' AND batch_id='{batch}' AND source_collection='_source_envelope'; IF encode(sha256(convert_to(saved,'UTF8')),'hex')<>'{file_hash}' THEN RAISE EXCEPTION 'SOURCE_FILE_READBACK_MISMATCH'; END IF; IF (SELECT count(*) FROM dqa_business.import_rows WHERE tenant_id='{tenant}' AND batch_id='{batch}' AND source_collection<>'_source_envelope')<>{len(rows)} THEN RAISE EXCEPTION 'IMPORTED_ROW_COUNT_MISMATCH'; END IF; END $verify$;")
parts.extend([guard,'COMMIT;']);sql='\n'.join(parts)+'\n';out.write_text(sql)
manifest={'tenant_id':tenant,'importer_auth_user_id':importer,'batch_id':batch,'source_origin':payload['source_origin'],'source_commit':a.source_commit,'source_file_sha256':file_hash,'source_payload_sha256':source_hash,'bundle_sha256':hashlib.sha256(sql.encode()).hexdigest(),'baseline_migrations':baseline,'migration':{'name':migration.name,'sha256':migration_hash},'expected_public_fingerprint':a.expected_public_fingerprint,'business_rows':len(rows),'envelope_rows':1,'source_counts':{c['name']:c['row_count'] for c in payload['collections']},'equipment':equipment,'sites':list(sites.values()),'rows':[{'id':r['id'],'collection':r['collection'],'legacy_id':r['legacy_id'],'sha256':hashlib.sha256(json.dumps(r['payload'],sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()} for r in rows],'workflow_records_promoted':0,'legacy_people_granted_auth_accounts':0}
out.with_suffix('.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':'IMPORT_BUNDLE_PREPARED_NOT_APPLIED','business_rows':len(rows),'equipment_to_import':len(equipment),'batch_id':batch,'workflow_records_promoted':0}))
