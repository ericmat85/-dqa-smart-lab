"""Rollback-only compound project/approval/reservation tests. Network-isolated local PostgreSQL only."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_preapproval_scheduling.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
import hashlib,uuid
from contextlib import contextmanager
normal_fixture=fixture;normal_req=REQ
G='ec000000-0000-4000-8000-000000000001';compound_req=str(uuid.UUID(hashlib.md5(('project-item:'+G+':1').encode()).hexdigest()))
REQ=compound_req
COMPOUND=subprocess.check_output(cmd+['-c',f"SELECT id FROM dqa_business.trial_definitions WHERE tenant_id='{T}' AND profile_code='COMPOUND_ENVIRONMENT'"],text=True,env=env).strip()
assert COMPOUND
start=datetime.now(timezone(timedelta(hours=8))).date()+timedelta(days=7)
while start.isoweekday()!=6:start+=timedelta(days=1)
START=start.isoformat()
EQS=[f'ee900000-0000-4000-8000-{i:012}' for i in range(1,4)]
profiles=['HIGH_TEMPERATURE','THERMAL_CYCLE','WATER_INGRESS','HUMIDITY_CYCLE','SALT_SPRAY','WEATHERING'];minutes=[2880,1440,60,1440,60,1440]
stages=[dict(trial_id=f'e9900000-0000-4000-8000-{i+1:012}',trial_revision=1,profile_id=p,name=f'合成階段{i+1}',label=f'合成階段{i+1}',duration_minutes=minutes[i],operation='operator' if i in [2,4] else 'continuous',specification='合成測試條件，非正式試驗規範。',acceptance='合成判定',judgementRequired='需作判定') for i,p in enumerate(profiles)]
def project_command():return dict(name='合成連續複合專案',execution_kind='REAL',submit=True,common=dict(product_code='SYNTHETIC',customer_name='SYNTHETIC',purpose='合成驗證',requested_date='2027-12-31',draft_signature_data=SIG,form_details=dict(purpose=['合成驗證'],compoundStages=stages,compoundVersion=1)),items=[dict(trial_id=COMPOUND,name='複合式環境試驗',quantity=1,specification='合成六階段連續試驗。',acceptance='依各階段合成判定',judgementRequired='需作判定')])
def fixture():
 global REQ
 REQ=normal_req
 f=normal_fixture();REQ=compound_req
 f+='RESET ROLE;'
 for s in stages:f+=f"INSERT INTO dqa_business.trial_definitions(id,tenant_id,legacy_id,name,profile_code,specification_version,duration_hours,source_kind) VALUES('{s['trial_id']}','{T}','STAGE-{s['profile_id']}','{s['name']}','{s['profile_id']}','SYNTHETIC-1',{s['duration_minutes']/60},'SYNTHETIC');"
 for i,name in enumerate(['環境試驗箱 合成','防水 耐候 合成','鹽霧 合成']):f+=f"INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,space_units,daily_hours) VALUES('{EQS[i]}','{T}','EQ-COMPOUND-{i+1}','{name}','合成',6,24);"
 c=literal(project_command());f+=auth(2)+f"SELECT dqa_business.prepare_project_request('{T}','{G}',{c});SELECT dqa_business.execute_project_request('{T}','{G}',{c});"+review(1,'MANAGER_APPROVE',22)
 return f

def plan_data(**patch):
 c=dict(start_local=START+'T09:00',shift_start='09:00',shift_end='18:00',preloaded_weekend=True,stage_equipment_ids=[EQS[i] for i in [0,0,1,0,2,1]]);c.update(patch)
 return dict(equipment_ids=EQS,equipment_revisions={id:1 for id in EQS},executor_id=EX,executor_revision=1,start_date=c['start_local'][:10],end_date=c['start_local'][:10],sample_code='',note='合成連續排程',preparation_minutes=0,cleanup_minutes=0,sample_space_units=1,compound=c)
def planning(data=None,save=True):
 return 'RESET ROLE;'+auth(3)+f"DO $t$ DECLARE c jsonb;p jsonb;BEGIN SELECT jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',0,'data',{literal(data or plan_data())}) INTO c FROM dqa_business.requests q WHERE id='{REQ}';p:=dqa_business.preview_schedule_draft('{T}',c);PERFORM set_config('test.compound_plan',p::text,true);c:=jsonb_set(c,'{{data,end_date}}',p->'end_date');"+(f"PERFORM dqa_business.prepare_schedule_draft('{T}','{op(11)}',c);PERFORM dqa_business.execute_schedule_draft('{T}','{op(11)}',c);" if save else '')+'END $t$;'
def number_after():return 'RESET ROLE;'+auth(3)+f"SELECT dqa_business.save_preapproval_sample_numbers('{T}','{op(10)}','{REQ}',q.request_document_version_id,q.revision,0,1,'SAVE','[\"RT-2\"]'::jsonb) FROM dqa_business.requests q WHERE id='{REQ}';"
def first():return planning()+number_after()+review(3,'LMS_APPROVE',12,FIRST,'2')
def query(sql):return subprocess.run(cmd,input='BEGIN;'+fixture()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
@contextmanager
def final_stage(minutes,operation='operator'):
 global stages
 original=stages;stages=[*stages[:-1],{**stages[-1],'duration_minutes':minutes,'operation':operation}]
 try:yield
 finally:stages=original
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=query(sql);self.assertEqual(r.returncode,0,r.stderr[-2400:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,expected):
  r=query(sql);self.assertNotEqual(r.returncode,0);self.assertIn(expected,r.stderr[-2000:])
 def test_project_creates_one_signed_request_with_all_stages(self):self.ok(f"SELECT count(*),jsonb_array_length(min(form_details::text)::jsonb->'compoundStages') FROM dqa_business.requests WHERE project_group_id='{G}'",'1|6')
 def test_preview_keeps_exact_minutes_and_does_not_reserve(self):self.ok(planning(save=False)+f"SELECT current_setting('test.compound_plan')::jsonb->>'scheduling_unit',jsonb_array_length(current_setting('test.compound_plan')::jsonb->'segments'),(SELECT count(*) FROM dqa_business.schedule_equipment WHERE equipment_id=ANY(ARRAY{EQS}::uuid[]))",'MINUTE|6|0')
 def test_six_stage_chain_has_zero_gaps_and_three_devices(self):self.ok(planning()+f"SELECT jsonb_array_length(plan->'allocations'),NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'segments') WITH ORDINALITY a(v,n) JOIN jsonb_array_elements(plan->'segments') WITH ORDINALITY b(v,n) ON b.n=a.n+1 WHERE a.v->>'end_ms' IS DISTINCT FROM b.v->>'start_ms') FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'",'3|t')
 def test_first_signature_reserves_all_three_devices_for_one_sample_atomically(self):self.ok(first()+f"RESET ROLE;SELECT status,(SELECT count(*) FROM dqa_business.schedule_equipment a WHERE a.schedule_id=s.id),(SELECT sum(sample_quantity) FROM dqa_business.schedule_equipment a WHERE a.schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{REQ}'",'PENDING_APPROVAL|3|3')
 def test_second_signature_activates_existing_single_workflow(self):self.ok(first()+review(4,'LMS_APPROVE',13)+f"SELECT status FROM dqa_business.schedules WHERE request_id='{REQ}'",'AWAITING_RECEIPT')
 def test_prestart_preparation_and_signature_remain_required(self):self.ok(first()+review(4,'LMS_APPROVE',13)+human('PREPARE',20,{**PREP,'sampleQuantity':1},'')+human('RECEIVE',21,{'executionAbnormal':'no'})+f"SELECT status,received_at IS NOT NULL FROM dqa_business.schedules WHERE request_id='{REQ}'",'BOOKED|t')
 def test_conflicting_second_project_does_not_take_any_device(self):
  group='ec000000-0000-4000-8000-000000000002';req=str(uuid.UUID(hashlib.md5(('project-item:'+group+':1').encode()).hexdigest()));c=literal(project_command())
  extra='RESET ROLE;'+auth(2)+f"SELECT dqa_business.prepare_project_request('{T}','{group}',{c});SELECT dqa_business.execute_project_request('{T}','{group}',{c});"+review(1,'MANAGER_APPROVE',23).replace(REQ,req)
  self.deny(first()+extra+planning().replace(REQ,req),'PLANNING_RESOURCE_CONFLICT')
 def test_failed_review_leaves_no_partial_reservation_or_signature(self):
  setup=planning()+number_after()+f"RESET ROLE;UPDATE dqa_business.equipment SET operational_status='MAINTENANCE' WHERE id='{EQS[2]}';"+auth(3)
  attempt=f"DO $t$ DECLARE c jsonb;BEGIN SELECT {dynamic_command('LMS_APPROVE')} INTO c FROM dqa_business.requests q WHERE id='{REQ}';BEGIN PERFORM dqa_business.prepare_request_template_operation('{T}','{op(12)}',c,{literal(FIRST)},2);RAISE EXCEPTION 'MISSING_EXPECTED_FAILURE';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PLANNING_EQUIPMENT_REQUIRED' THEN RAISE;END IF;END;END $t$;RESET ROLE;"
  self.ok(setup+attempt+f"SELECT (SELECT count(*) FROM dqa_business.schedules WHERE request_id='{REQ}'),(SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LMS_1')",'0|0')
 def test_old_snapshot_catalog_stays_compatible_and_new_metadata_opts_in(self):self.ok('RESET ROLE;'+auth(3)+f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.original_ui_snapshot('{T}')->'trials') t WHERE t->>'profile_code'='COMPOUND_ENVIRONMENT'),jsonb_array_length(dqa_business.preapproval_snapshot('{T}')->'compound_trials')",'f|1')
 def test_old_catalog_select_does_not_include_the_new_dynamic_type(self):self.ok('RESET ROLE;'+auth(3)+f"SELECT count(*) FROM dqa_business.trial_definitions WHERE tenant_id='{T}' AND profile_code='COMPOUND_ENVIRONMENT'",'0')
 def test_weekend_start_requires_explicit_preloaded_high_temperature(self):self.deny(planning(plan_data(preloaded_weekend=False)),'COMPOUND_HANDOFF_WINDOW')
 def test_overnight_handoff_is_rejected_without_padding(self):self.deny(planning(plan_data(start_local=START+'T22:00')),'COMPOUND_HANDOFF_WINDOW')
 def test_operator_stage_cannot_cross_shift_end(self):self.deny(planning(plan_data(start_local=START+'T17:30')),'COMPOUND_OPERATOR_WINDOW')
 def test_final_operator_can_finish_at_the_workday_shift_boundary(self):
  with final_stage(420):self.ok(planning()+f"SELECT extract(isodow FROM (plan->>'ends_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::integer,to_char((plan->>'ends_at')::timestamptz AT TIME ZONE 'Asia/Taipei','HH24:MI') FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'",'3|18:00')
 def test_final_operator_cannot_finish_after_hours(self):
  with final_stage(480):self.deny(planning(),'COMPOUND_OPERATOR_WINDOW')
 def test_final_operator_cannot_finish_on_weekend(self):
  monday=(start+timedelta(days=2)).isoformat()
  with final_stage(1380):self.deny(planning(plan_data(start_local=monday+'T09:00')),'COMPOUND_OPERATOR_WINDOW')
 def test_final_continuous_phase_still_requires_a_workday_completion_point(self):
  monday=(start+timedelta(days=2)).isoformat()
  with final_stage(1380,'continuous'):self.deny(planning(plan_data(start_local=monday+'T09:00')),'COMPOUND_HANDOFF_WINDOW')
 def test_wrong_device_type_is_rejected(self):self.deny(planning(plan_data(stage_equipment_ids=[EQS[1],EQS[0],EQS[1],EQS[0],EQS[2],EQS[1]])),'PLANNING_EQUIPMENT_REQUIRED')
 def test_complete_sample_batch_must_fit_each_device(self):self.deny('RESET ROLE;'+f"UPDATE dqa_business.equipment SET space_units=1 WHERE id='{EQS[2]}';"+planning({**plan_data(), 'equipment_revisions':{EQS[0]:1,EQS[1]:1,EQS[2]:2},'sample_space_units':2}),'PLANNING_SPACE_INSUFFICIENT')
 def test_device_revision_change_before_signature_prevents_partial_booking(self):
  sql=planning()+number_after()+f"RESET ROLE;UPDATE dqa_business.equipment SET operational_status='MAINTENANCE' WHERE id='{EQS[2]}';"+review(3,'LMS_APPROVE',12,FIRST,'2')
  self.deny(sql,'PLANNING_EQUIPMENT_REQUIRED')
 def test_tampered_stage_protocol_is_rejected(self):self.deny('RESET ROLE;'+f"SELECT dqa_private.validate_compound_protocol('{T}',jsonb_set(form_details->'compoundStages','{{0,duration_minutes}}','0')) FROM dqa_business.requests WHERE id='{REQ}'",'COMPOUND_PROTOCOL_INVALID')
 def test_cross_tenant_draft_access_is_denied(self):self.deny(planning().replace("'"+T+"'","'b0000000-0000-0000-0000-000000000001'"),'PLANNING_ACCESS_DENIED')
 def test_discontinuous_chain_can_wait_across_weekend_without_increasing_effort(self):
  policy=dict(mode='COMPOUND_DISCONTINUOUS',weekends=True,holidays=True,work_start=540,work_end=1080,overtime=False,overtime_end=1200,substitution=True)
  sql=f"RESET ROLE;INSERT INTO dqa_private.trial_calendar_policies VALUES('{T}','{COMPOUND}',{literal(policy)},1);"+planning()+f"SELECT (SELECT sum((x->>'end_ms')::numeric-(x->>'start_ms')::numeric)=sum((x->>'duration_minutes')::numeric)*60000 FROM jsonb_array_elements(plan->'segments') x),plan->>'start_date' FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'"
  # The physical protocol's exact original effort, not any inserted waiting period.
  sql=sql.replace("sum((x->>'duration_minutes')::numeric)*60000",str(sum(minutes)*60000))
  self.ok(sql,'t|'+(start+timedelta(days=2)).isoformat())
 def test_continuous_chain_rejects_a_holiday_handoff(self):
  # The first preloaded exposure ends on Monday; a closure cannot be padded away.
  monday=(start+timedelta(days=2)).isoformat()
  self.deny(f"RESET ROLE;INSERT INTO dqa_private.schedule_incidents VALUES('{op(99)}','{T}','CLOSURE',NULL,'{monday}','{monday}','合成停班','{uid(1)}',clock_timestamp(),NULL);"+planning(),'CALENDAR_NONWORKING_DAY')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'scope':'network-isolated local PostgreSQL, rollback-only synthetic cases'},indent=2));raise SystemExit(not result.wasSuccessful())
