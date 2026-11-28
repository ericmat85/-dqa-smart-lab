"""Rollback-only mixed projects, isolated signed protocols and native compound planning."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_compound_schedule.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
M='bc640000-0000-4000-8000-000000000001'
def child(n):return str(uuid.UUID(hashlib.md5(('project-item:'+M+':'+str(n)).encode()).hexdigest()))
def mixed(submit=True):
 c=project_command();c['name']='合成混合專案';c['submit']=submit;c['common']['form_details'].pop('compoundStages');c['common']['form_details'].pop('compoundVersion')
 normal=dict(trial_id='a3000000-0000-0000-0000-000000000001',name='Synthetic humidity',quantity=3,specification='試驗時間：250 小時。',acceptance='合成判定',judgementRequired='需作判定')
 groups=[]
 for i in range(2):
  seq=json.loads(json.dumps(stages));seq[0]['label']='組'+str(i+1)+'首段'
  group={**c['items'][0],'quantity':i+1,'compound':dict(version=1,label='連續組'+str(i+1),stages=seq)};groups.append(group)
 c['items']=[normal,*groups];return c

def prep(c=None):return 'RESET ROLE;'+auth(2)+f"SELECT dqa_business.prepare_project_request('{T}','{M}',{literal(c or mixed())});"
def save(c=None):return f"SELECT dqa_business.execute_project_request('{T}','{M}',{literal(c or mixed())});"
class Tests(unittest.TestCase):
 def ok(self,sql):
  r=query(sql);self.assertEqual(r.returncode,0,r.stderr[-3500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def deny(self,sql,code):
  r=query(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-3000:])
 def test_mixed_three_items_share_one_project_and_own_protocols(self):self.ok(prep()+save()+f"RESET ROLE;SELECT count(*)=3 AND count(DISTINCT project_group_id)=1 AND bool_and(status='AWAITING_REQUEST_MANAGER') AND count(*) FILTER(WHERE form_details ? 'compoundStages')=2 AND min(quantity)=1 AND max(quantity)=3 FROM dqa_business.requests WHERE project_group_id='{M}';")
 def test_general_item_has_no_compound_metadata(self):self.ok(prep()+save()+f"RESET ROLE;SELECT NOT(form_details ?| ARRAY['compoundStages','compoundLabel','compoundVersion']) FROM dqa_business.requests WHERE id='{child(1)}';")
 def test_two_groups_keep_separate_names_stages_and_quantities(self):self.ok(prep()+save()+f"RESET ROLE;SELECT count(DISTINCT form_details->>'compoundLabel')=2 AND count(DISTINCT form_details->'compoundStages'->0->>'label')=2 AND count(DISTINCT quantity)=2 FROM dqa_business.requests WHERE project_group_id='{M}' AND project_item_index>1;")
 def test_signed_documents_freeze_each_distinct_group(self):self.ok(prep()+save()+f"RESET ROLE;SELECT count(*)=3 AND count(DISTINCT document_sha256)=3 AND count(*) FILTER(WHERE payload->'form_details' ? 'compoundStages')=2 FROM dqa_business.request_document_versions WHERE request_id IN(SELECT id FROM dqa_business.requests WHERE project_group_id='{M}');")
 def test_replay_does_not_duplicate_children_or_signatures(self):self.ok(prep()+save()+save()+f"RESET ROLE;SELECT count(*)=3 AND (SELECT count(*)=3 FROM dqa_business.request_signatures WHERE request_id IN(SELECT id FROM dqa_business.requests WHERE project_group_id='{M}')) FROM dqa_business.requests WHERE project_group_id='{M}';")
 def test_draft_reopens_with_protocol_and_label(self):
  c=mixed(False);self.ok(prep(c)+save(c)+f"RESET ROLE;SELECT bool_and(status='DRAFT') AND (SELECT jsonb_array_length(form_details->'compoundStages')=6 AND form_details->>'compoundLabel'='連續組2' FROM dqa_business.requests WHERE id='{child(3)}') FROM dqa_business.requests WHERE project_group_id='{M}';")
 def test_protocol_on_regular_trial_is_rejected(self):
  c=mixed();c['items'][0]['compound']=c['items'][1]['compound'];self.deny(prep(c),'COMPOUND_PROTOCOL_INVALID')
 def test_nested_scopes_and_unknown_fields_rejected(self):
  c=mixed();c['items'][1]['compound']['tenant_id']=T;self.deny(prep(c),'COMPOUND_PROTOCOL_INVALID')
 def test_missing_or_single_stage_is_rejected(self):
  c=mixed();c['items'][1]['compound']['stages']=stages[:1];self.deny(prep(c),'COMPOUND_PROTOCOL_INVALID')
 def test_forged_stage_tenant_reference_is_rejected(self):
  c=mixed();c['items'][1]['compound']['stages'][0]['trial_id']='ffffffff-ffff-4fff-8fff-ffffffffffff';self.deny(prep(c),'COMPOUND_CATALOG_CHANGED')
 def test_catalog_revision_change_invalidates_prepared_group(self):self.deny(prep()+f"RESET ROLE;UPDATE dqa_business.trial_definitions SET specification_version='UPDATED' WHERE id='{stages[0]['trial_id']}';"+auth(2)+save(),'COMPOUND_CATALOG_CHANGED')
 def test_changed_protocol_cannot_replace_pending_intent(self):
  c=mixed();c['items'][1]['compound']['label']='不同內容';self.deny(prep()+save(c),'PROJECT_OPERATION_CONFLICT')
 def test_old_common_protocol_cannot_leak_into_mixed_items(self):
  c=mixed();c['common']['form_details'].update(compoundStages=stages,compoundVersion=1);self.deny(prep(c),'COMPOUND_TRIAL_REQUIRED')
 def test_group_quantity_limit_is_enforced_before_create(self):
  c=mixed(False);c['items'][2]['quantity']=1001;self.deny(prep(c),'COMPOUND_PROTOCOL_INVALID')
 def test_failure_at_third_item_rolls_back_entire_mixed_project(self):
  trigger=f"RESET ROLE;CREATE FUNCTION dqa_private.synthetic_mixed_failure() RETURNS trigger LANGUAGE plpgsql AS $t$ BEGIN IF NEW.project_group_id='{M}' AND NEW.project_item_index=3 THEN RAISE EXCEPTION 'SYNTHETIC_MIXED_FAILURE';END IF;RETURN NEW;END $t$;CREATE TRIGGER synthetic_mixed_failure AFTER INSERT ON dqa_business.requests FOR EACH ROW EXECUTE FUNCTION dqa_private.synthetic_mixed_failure();"
  self.ok(trigger+prep()+f"DO $t$ BEGIN BEGIN PERFORM dqa_business.execute_project_request('{T}','{M}',{literal(mixed())});RAISE EXCEPTION 'FAILURE_NOT_TRIGGERED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'SYNTHETIC_MIXED_FAILURE' THEN RAISE;END IF;END;END $t$;RESET ROLE;SELECT NOT EXISTS(SELECT 1 FROM dqa_business.requests WHERE project_group_id='{M}') AND NOT EXISTS(SELECT 1 FROM dqa_business.request_projects WHERE id='{M}') AND (SELECT state='PLANNED' FROM dqa_private.project_request_operations WHERE id='{M}');")
 def test_mixed_group_reuses_native_stage_specific_planning(self):
  sql=prep()+save()+review(1,'MANAGER_APPROVE',651).replace(REQ,child(2))+planning().replace(REQ,child(2))
  self.ok(sql+f"RESET ROLE;SELECT jsonb_array_length(plan->'segments')=6 AND jsonb_array_length(plan->'allocations')=3 AND NOT EXISTS(SELECT 1 FROM dqa_business.schedules WHERE request_id='{child(2)}') FROM dqa_business.schedule_drafts WHERE request_id='{child(2)}';")
 def test_selected_mixed_project_items_can_be_planned_together(self):
  sql=prep()+save()
  for n in range(1,4):sql+=review(1,'MANAGER_APPROVE',660+n).replace(REQ,child(n))
  sql+='RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_batch('{T}','bc640000-0000-4000-8000-000000000099',jsonb_build_object('expected_member',dqa_private.member_id('{T}'),'options',jsonb_build_object('earliest','{START}','latest','{START}'::date+31),'selection',(SELECT jsonb_agg(jsonb_build_object('request_id',id,'expected_request_revision',revision,'expected_draft_revision',0,'sample_space_units',1,'equipment_count',1,'sample_code','')) FROM dqa_business.requests WHERE project_group_id='{M}')));SELECT dqa_business.schedule_batch_result('{T}','bc640000-0000-4000-8000-000000000099')->>'ready_count'='3';"
  self.ok(sql+f"SELECT dqa_business.execute_schedule_batch('{T}','bc640000-0000-4000-8000-000000000099');RESET ROLE;SELECT count(*)=3 AND NOT EXISTS(SELECT 1 FROM dqa_business.schedules WHERE request_id IN(SELECT id FROM dqa_business.requests WHERE project_group_id='{M}')) FROM dqa_business.schedule_drafts WHERE request_id IN(SELECT id FROM dqa_business.requests WHERE project_group_id='{M}');")
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
