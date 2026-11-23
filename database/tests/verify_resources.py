"""Resource and stock commands in an isolated, network-disabled PostgreSQL only."""
import argparse,json,subprocess,os,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();s=json.loads(Path(a.state).read_text());assert s['network']=='none' and not s['published_ports'] and s['container'].startswith('dqa-business-local-');env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
T='a0000000-0000-0000-0000-000000000001';U='10000000-0000-0000-0000-000000000001';E='ec000000-0000-4000-8000-000000000001';M='ec000000-0000-4000-8000-000000000002';D='ec000000-0000-4000-8000-000000000003';OP='ec000000-0000-4000-8000-000000000010';OP2='ec000000-0000-4000-8000-000000000011'
def auth(u=U):return f"SET LOCAL request.jwt.claim.sub='{u}';SET LOCAL ROLE authenticated;"
def equipment(**changes):
 d=dict(legacy_id='EQ-SYNTHETIC',name='合成設備',category='溫度試驗',model='SYNTHETIC',serial_number='SYNTHETIC',space_units=6,daily_hours=24,specification='合成設備規格',next_calibration=None,next_maintenance=None,display_details={'location':'合成位置','owner':'合成負責人'});d.update(changes);return d

def material(**changes):
 d=dict(legacy_id='MAT-SYNTHETIC',name='合成物料',category='耗材',unit='件',total_quantity=10,available_quantity=10,min_stock=1,reason='合成建檔',display_details={'location':'合成位置','owner':'合成負責人'});d.update(changes);return d

def trial(**changes):
 d=dict(name='合成新增試驗',aliases=[],profile_code='UNVERIFIED',specification='試驗時間：4 小時。',acceptance='合成判定',equipment_reference='合成設備',specification_version='SYNTH-1',duration_hours=4);d.update(changes);return d

def command(kind='equipment',action='save',id=E,revision=0,data=None):return dict(kind=kind,action=action,id=id,expected_revision=revision,data=data if data is not None else equipment())
def prepare(c,op=OP,t=T):
 q=json.dumps(c,ensure_ascii=False).replace("'","''");return f"SELECT set_config('test.resource.command','{q}',true);SELECT dqa_business.prepare_resource_operation('{t}','{op}',current_setting('test.resource.command')::jsonb);"
def execute(op=OP,t=T):return f"SELECT dqa_business.execute_resource_operation('{t}','{op}',current_setting('test.resource.command')::jsonb);"
def save(c=None,op=OP):return prepare(c or command(),op)+execute(op)
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
CM=command('material',id=M,data=material());CT=command('trial',id=D,data=trial())
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,expected):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(expected,r.stderr)
 def test_create_equipment_with_required_u(self):self.ok(auth()+save()+f"SELECT space_units,operational_status FROM dqa_business.equipment WHERE id='{E}'",'6|IDLE')
 def test_missing_space_is_rejected(self):self.deny(auth()+save(command(data=equipment(space_units=None))),'RESOURCE_SPACE_REQUIRED')
 def test_zero_and_fractional_space_rejected(self):
  for n in [0,1.5,-1,100001]:self.deny(auth()+save(command(data=equipment(space_units=n))),'RESOURCE_SPACE_REQUIRED')
 def test_other_workspace_rejected(self):self.deny(auth()+prepare(command(),t='b0000000-0000-0000-0000-000000000001'),'RESOURCE_WRITE_DENIED')
 def test_anon_rejected(self):self.deny('SET LOCAL ROLE anon;'+prepare(command()),'permission denied')
 def test_nonmanager_cannot_prepare(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+prepare(command()),'RESOURCE_WRITE_DENIED')
 def test_explicit_resource_permission_works_without_account_admin(self):self.ok("UPDATE dqa_business.roles SET permissions=array_append(permissions,'equipment.manage') WHERE id='a1000000-0000-0000-0000-000000000002';"+auth('10000000-0000-0000-0000-000000000002')+save()+f"RESET ROLE;SELECT count(*) FROM dqa_business.equipment WHERE id='{E}'",'1')
 def test_duplicate_execute_is_idempotent(self):self.ok(auth()+save()+execute()+f"SELECT count(*) FROM dqa_business.resource_events WHERE resource_id='{E}'",'1')
 def test_payload_change_after_preparation_is_rejected(self):self.deny(auth()+prepare(command())+"SELECT set_config('test.resource.command',jsonb_set(current_setting('test.resource.command')::jsonb,'{data,space_units}','9')::text,true);"+execute(),'RESOURCE_OPERATION_CONFLICT')
 def test_expired_plan_never_executes(self):self.deny(auth()+prepare(command())+"RESET ROLE;UPDATE dqa_private.resource_operations SET expires_at=clock_timestamp()-interval '1 second';SET LOCAL ROLE authenticated;"+execute(),'RESOURCE_OPERATION_EXPIRED')
 def test_result_lookup_finalizes_expiry_without_business_changes(self):self.ok(auth()+prepare(command())+"RESET ROLE;UPDATE dqa_private.resource_operations SET expires_at=clock_timestamp()-interval '1 second';SET LOCAL ROLE authenticated;"+f"SELECT dqa_business.resource_operation_result('{T}','{OP}')->>'state'",'EXPIRED')
 def test_unknown_actor_cannot_read_another_operation(self):self.ok(auth()+prepare(command())+auth('10000000-0000-0000-0000-000000000002')+f"SELECT dqa_business.resource_operation_result('{T}','{OP}')->>'state'",'NOT_FOUND')
 def test_equipment_revision_conflict(self):self.deny(auth()+save()+save(command(revision=7),OP2),'REVISION_CONFLICT')
 def test_equipment_maintenance_start_and_finish_are_durable(self):self.ok(auth()+save()+save(command(action='status',revision=1,data={'status':'MAINTENANCE','reason':'合成維護開始'}),OP2)+save(command(action='status',revision=2,data={'status':'IDLE','reason':'合成維護完成'}),'ec000000-0000-4000-8000-000000000012')+f"SELECT operational_status,service_started_at IS NULL,display_details ? 'lastMaintenance' FROM dqa_business.equipment WHERE id='{E}'",'IDLE|t|t')
 def usage(self,state='IN_USE'):
  return auth()+save()+f"RESET ROLE;UPDATE dqa_business.equipment SET operational_status='{state}' WHERE id='{E}';"
 def release(self,status='IDLE',reason='確認無占用，解除遺留使用狀態',revision=2):
  return auth()+save(command(action='status',revision=revision,data={'status':status,'reason':reason}),OP2)
 def allocation(self,released=False):
  return f"INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity,released_at) SELECT tenant_id,schedule_id,'{E}',reserve_from,reserve_until,1,1,"+('clock_timestamp()' if released else 'NULL')+f" FROM dqa_business.schedule_equipment WHERE tenant_id='{T}' LIMIT 1;"
 def borrow(self,status):
  # Seed the unsupported borrowing workflow as owner, then restore its gate before the tested command.
  return f"ALTER TABLE dqa_business.borrows DISABLE TRIGGER workflow_gate;INSERT INTO dqa_business.borrows(tenant_id,legacy_id,borrower_member_id,equipment_id,quantity,status) SELECT tenant_id,'BORROW-RELEASE-TEST',id,'{E}',1,'{status}' FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{U}';ALTER TABLE dqa_business.borrows ENABLE TRIGGER workflow_gate;"
 def test_unallocated_usage_can_return_to_idle_with_audit(self):
  self.ok(self.usage()+self.release()+f"SELECT e.operational_status,e.service_started_at IS NULL,NOT(e.display_details ? 'lastMaintenance'),NOT(e.display_details ? 'lastCalibration'),v.detail->>'before_status',v.detail->>'after_status',v.reason,v.actor_member_id IS NOT NULL FROM dqa_business.equipment e JOIN dqa_business.resource_events v ON v.resource_id=e.id AND v.action='STATUS' WHERE e.id='{E}'",'IDLE|t|t|t|IN_USE|IDLE|確認無占用，解除遺留使用狀態|t')
 def test_unreleased_allocation_still_blocks_even_for_admin(self):
  self.deny(self.usage()+self.allocation()+self.release(),'RESOURCE_RESERVED')
 def test_active_borrow_blocks_even_when_usage_label_is_stale(self):
  for state in ['PENDING','APPROVED','ON_LOAN']:self.deny(self.usage()+self.borrow(state)+self.release(),'RESOURCE_RESERVED')
 def test_released_allocation_and_returned_borrow_allow_reset(self):
  self.ok(self.usage()+self.allocation(True)+self.borrow('RETURNED')+self.release()+f"SELECT operational_status FROM dqa_business.equipment WHERE id='{E}'",'IDLE')
 def test_usage_cannot_jump_directly_to_service(self):
  for target in ['MAINTENANCE','CALIBRATION']:self.deny(self.usage()+self.release(target),'RESOURCE_RESERVED')
 def test_loan_pause_and_retirement_are_not_bypassed(self):
  for state in ['ON_LOAN','PAUSED','RETIRED']:self.deny(self.usage(state)+self.release(),'RESOURCE_RESERVED')
 def test_unallocated_usage_release_still_needs_permission(self):
  self.deny(self.usage()+auth('10000000-0000-0000-0000-000000000002')+save(command(action='status',revision=2,data={'status':'IDLE','reason':'不應釋放'}),OP2),'RESOURCE_WRITE_DENIED')
 def test_usage_release_requires_reason_and_current_revision(self):
  self.deny(self.usage()+self.release(reason=''),'RESOURCE_REASON_REQUIRED')
  self.deny(self.usage()+self.release(revision=1),'REVISION_CONFLICT')
 def test_usage_release_replay_records_only_one_status_event(self):
  self.ok(self.usage()+self.release()+execute(OP2)+f"SELECT count(*) FROM dqa_business.resource_events WHERE resource_id='{E}' AND action='STATUS'",'1')
 def test_reserved_capacity_cannot_be_changed(self):
  e='a4000000-0000-0000-0000-000000000001';data=equipment(legacy_id='EQ-TEST',space_units=1);self.deny(auth()+save(command(id=e,revision=1,data=data)),'RESOURCE_RESERVED')
 def test_status_cannot_fake_equipment_workflow(self):self.deny(auth()+save()+save(command(action='status',revision=1,data={'status':'IN_USE','reason':'不應繞過排程'}),OP2),'RESOURCE_FIELDS_INVALID')
 def test_create_material_records_opening_stock(self):self.ok(auth()+save(CM)+f"SELECT total_quantity::text,available_quantity::text,(SELECT count(*) FROM dqa_business.material_transactions WHERE material_id='{M}') FROM dqa_business.materials WHERE id='{M}'",'10.000000|10.000000|1')
 def test_receive_and_issue_stock(self):
  receive=command('material','stock',M,1,{'mode':'RECEIVE','quantity':2,'reason':'合成入庫'});issue=command('material','stock',M,2,{'mode':'ISSUE','quantity':3,'reason':'合成領用'});self.ok(auth()+save(CM)+save(receive,OP2)+save(issue,'ec000000-0000-4000-8000-000000000012')+f"SELECT total_quantity::text,available_quantity::text FROM dqa_business.materials WHERE id='{M}'",'9.000000|9.000000')
 def test_issue_cannot_exceed_available_stock(self):self.deny(auth()+save(CM)+save(command('material','stock',M,1,{'mode':'ISSUE','quantity':11,'reason':'超量'}),OP2),'STOCK_INSUFFICIENT')
 def test_stock_conflict_prevents_lost_update(self):self.deny(auth()+save(CM)+save(command('material','stock',M,1,{'mode':'ISSUE','quantity':2,'reason':'合成領用'}),OP2)+save(command('material','stock',M,1,{'mode':'ISSUE','quantity':2,'reason':'過期版本'}),'ec000000-0000-4000-8000-000000000012'),'REVISION_CONFLICT')
 def test_duplicate_issue_is_not_charged_twice(self):self.ok(auth()+save(CM)+save(command('material','stock',M,1,{'mode':'ISSUE','quantity':2,'reason':'合成領用'}),OP2)+execute(OP2)+f"SELECT available_quantity::text,(SELECT count(*) FROM dqa_business.material_transactions WHERE material_id='{M}') FROM dqa_business.materials WHERE id='{M}'",'8.000000|2')
 def test_stock_mode_is_required(self):self.deny(auth()+save(CM)+save(command('material','stock',M,1,{'quantity':2,'reason':'缺少種類'}),OP2),'RESOURCE_FIELDS_INVALID')
 def test_stock_reason_is_required(self):self.deny(auth()+save(CM)+save(command('material','stock',M,1,{'mode':'ISSUE','quantity':2}),OP2),'RESOURCE_REASON_REQUIRED')
 def test_available_cannot_exceed_total(self):self.deny(auth()+save(command('material',id=M,data=material(available_quantity=11))),'STOCK_INVALID')
 def test_stock_permission_is_separate_from_metadata_editing(self):
  grant="UPDATE dqa_business.roles SET permissions=array_append(permissions,'materials.manage') WHERE id='a1000000-0000-0000-0000-000000000002';";self.deny(grant+auth('10000000-0000-0000-0000-000000000002')+save(CM),'RESOURCE_WRITE_DENIED')
 def test_stock_unit_is_immutable_after_ledger_started(self):self.deny(auth()+save(CM)+save(command('material',id=M,revision=1,data=material(unit='盒')),OP2),'STOCK_UNIT_IMMUTABLE')
 def test_trial_creation_is_real_catalog_data(self):self.ok(auth()+save(CT)+f"SELECT source_kind,profile_code,duration_hours::text FROM dqa_business.trial_definitions WHERE id='{D}'",'MANUAL|UNVERIFIED|4.0000')
 def test_fixed_250h_humidity_cannot_change(self):self.deny(auth()+save(command('trial',id=D,data=trial(profile_code='HIGH_HUMIDITY',duration_hours=249,specification='試驗時間：249 小時。'))),'TRIAL_FIXED_DURATION')
 def test_fixed_20h_vibration_cannot_change(self):self.deny(auth()+save(command('trial',id=D,data=trial(profile_code='VIBRATION_DURABILITY',duration_hours=19,specification='試驗時間：19 小時。'))),'TRIAL_FIXED_DURATION')
 def test_mismatched_trial_duration_is_rejected(self):self.deny(auth()+save(command('trial',id=D,data=trial(duration_hours=5))),'TRIAL_DURATION_INVALID')
 def test_trial_rename_keeps_old_name_as_alias(self):self.ok(auth()+save(CT)+save(command('trial',id=D,revision=1,data=trial(name='合成試驗新名稱')),OP2)+f"SELECT '合成新增試驗'=ANY(aliases) FROM dqa_business.trial_definitions WHERE id='{D}'",'t')
 def test_trial_profile_is_immutable(self):self.deny(auth()+save(CT)+save(command('trial',id=D,revision=1,data=trial(profile_code='HIGH_HUMIDITY',duration_hours=250,specification='試驗時間：250 小時。')),OP2),'TRIAL_PROFILE_IMMUTABLE')
 def test_append_only_material_ledger(self):self.deny(auth()+save(CM)+'RESET ROLE;DELETE FROM dqa_business.material_transactions','APPEND_ONLY_RECORD')
 def test_no_direct_resource_write(self):self.deny(auth()+"UPDATE dqa_business.equipment SET space_units=2",'permission denied')
 def test_events_do_not_change_other_workspaces(self):self.ok(auth()+save()+"RESET ROLE;SELECT count(*) FROM dqa_business.resource_events WHERE tenant_id='b0000000-0000-0000-0000-000000000001'",'0')
 def test_private_profiles_are_not_editable(self):self.deny(auth()+'UPDATE dqa_private.resource_trial_profiles SET fixed_hours=1','permission denied')
 def test_case_gate_remains_closed(self):self.deny(auth()+"UPDATE dqa_business.requests SET status='RUNNING'",'permission denied')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
